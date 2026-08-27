# WaveMod 异地备份与灾难恢复手册

本手册说明如何把 WaveMod 的**数据库**和 **mod 图片**备份到 GitHub，以及数据意外丢失时如何**完全恢复**。

## 1. 备份架构总览

```
Supabase Postgres ──pg_dump(Fc, public)──▶ 数据库 dump ──▶ GitHub Release 附件（保留最近 30 份）
腾讯云 COS（mods/ + tutorial/ 图片）──▶ backups/images/ ──▶ git 仓库（增量提交）
表行数 ──▶ backups/manifest.json ──▶ git 仓库
```

- **数据库 dump**：每天全量 `pg_dump`（public schema，custom 格式），上传为 GitHub Release 附件。仓库代码保持小、git 历史不膨胀。
- **图片**：从 COS 增量同步到 `backups/images/`（首次全量约 300-500MB，之后只下载新增/变更的），提交进 git 仓库。**object key 原样保留**，因此恢复时把图片回传 COS 相同路径，数据库里存的 COS URL 自动恢复生效。
- **manifest.json**：备份清单（生成时间、来源、各表行数、dump 校验值、图片完整索引），随 git 提交。

备份由 **GitHub Actions 每天 11:00（北京时间）自动执行**，也可手动触发或在本机手动运行。

## 2. 一键命令

```bash
# 备份
node scripts/backup-to-github.mjs              # 全量备份（dump→release + 图片→git + 推送）
node scripts/backup-to-github.mjs --dry-run    # 只预览（会列目录比对，不下载/上传/推送）
node scripts/backup-to-github.mjs --no-push    # 备份但不推送（先检查产物）
npm run backup                                 # 等价于第一条

# 恢复
node scripts/restore-from-backup.mjs --dry-run    # 预览要执行的动作
node scripts/restore-from-backup.mjs --yes        # 正式恢复（数据库 + 图片）
npm run restore                                   # 等价
```

## 3. 前置：获取 Supabase 数据库连接串（必做一次）

备份脚本需要 Postgres 连接串（`pg_dump` 用它直连数据库）。当前 `.env.local` 里只有 Supabase 的 JS 密钥，没有连接串，需要你到控制台获取：

1. 打开 [Supabase 控制台](https://supabase.com/dashboard) → 选择项目 **`xqwzgcxwdwpmkdbmzmve`**
2. 左侧 **Project Settings** → **Database**
3. 在 **Connection string** 区域，选 **Session pooler**（或 **Direct connection**）
   > ⚠️ 不要选 Transaction pooler（端口 6543）——`pg_dump` 长连接会超时
4. 复制形如 `postgresql://postgres.xqwzgcxwdwpmkdbmzmve:[PASSWORD]@aws-0-xxx.pooler.supabase.com:5432/postgres` 的连接串
5. 密码在 **Reset database password** 处可重置（忘了就重置）
6. 填到本机 `.env.local`：
   ```
   DATABASE_URL=postgresql://postgres.xqwzgcxwdwpmkdbmzmve:[PASSWORD]@aws-0-xxx.pooler.supabase.com:5432/postgres
   ```
   > 提醒：连接串含数据库密码，`.env*` 已被 `.gitignore` 排除，**不会**提交进 git。

## 4. 配置 GitHub Secrets（GitHub Actions 定时备份需要）

GitHub 仓库 → **Settings → Secrets and variables → Actions** → 新增：

| Secret | 值 |
|---|---|
| `DATABASE_URL` | 上一步的完整连接串 |
| `COS_SECRET_ID` | 腾讯云 COS SecretId（与 `.env.local` 的 `COS_SECRET_ID` 相同） |
| `COS_SECRET_KEY` | 腾讯云 COS SecretKey |

> `COS_BUCKET` / `COS_REGION` 非敏感，已在 workflow 中硬编码为 `wave-mod-preview-1327973389` / `ap-guangzhou`。

配置好后，push 包含 `.github/workflows/backup.yml` 的提交即生效；Actions 每天 11:00 自动备份，也可在 Actions 页面点 **Run workflow** 手动触发。

## 5. 首次初始化（本机跑一次，再开 cron）

为避免第一次就在云端全量下载 + 提交 300-500MB 图片，建议先在本机跑通：

```bash
# 1. 预览：会列出 COS 图片数量、待下载数（不下载）
node scripts/backup-to-github.mjs --dry-run

# 2. 真实备份但不推送：检查 backups/db/*.dump、backups/images/ 数量、manifest.json
node scripts/backup-to-github.mjs --no-push

# 3. 正式备份并推送（dump→release，图片+manifest→git push）
node scripts/backup-to-github.mjs
```

跑完后确认：
- GitHub Releases 页出现 `db-<日期时间>` release
- 仓库出现 `backups/images/` 和 `backups/manifest.json`
- 之后 GitHub Actions 的每日任务就基于已有备份增量运行

## 6. 备份内容验证（每次备份后自查）

```bash
# dump 是否合法（条目数非 0）
pg_restore --list backups/db/wavemod-*.dump | tail -n +5 | wc -l

# 图片数量是否等于 COS 列表总数（manifest 有记录）
# 抽查：取 manifest 中某图片本地 md5 与 etag 是否一致
```

## 7. 灾难恢复流程

### 7.1 数据库被清空 / 被篡改 → 恢复数据库

```bash
# 1. 克隆备份仓库（或确保本地已是最新，git pull）
git pull

# 2. 预览要执行的动作
node scripts/restore-from-backup.mjs --db-only --dry-run

# 3. 正式恢复（会 DROP 并重建目标库 public 表）
node scripts/restore-from-backup.mjs --db-only --yes
```

- 脚本会自动从 GitHub Release 下载最新 dump 并做 **sha256 校验**（损坏即拒绝）。
- 只恢复 `public` schema（业务数据 + 表 + 函数 + 触发器 + RLS），**不触碰** `auth`/`storage` 等平台托管 schema。
- **登录用户**：同一个 Supabase 项目下 `auth.users` 未被清空时，恢复后用户密码哈希仍有效，可直接登录；若 auth 也被清空，用户需重新注册（注册触发器会自动重建 `profiles`）。
- **全新项目**（换了个空 Supabase 项目）：恢复后需手动补平台侧依赖——重跑 `supabase/schema.sql` 中挂 `auth.users` 的触发器、重建 `mod-assets` storage bucket、配置 app settings。

### 7.2 图片全删 / COS 被清空 → 恢复图片

```bash
# 预览
node scripts/restore-from-backup.mjs --images-only --dry-run

# 正式恢复：把 backups/images/ 全部回传到 COS 相同 object key
node scripts/restore-from-backup.mjs --images-only --yes
```

- 图片按 manifest 索引回传 COS **相同 object key**，所以数据库 `mods.images` 里存的 COS URL **自动恢复生效**，无需改库。
- 恢复脚本会抽查几条图片 URL 返回 200。

### 7.3 完整恢复（数据库 + 图片都丢）

```bash
node scripts/restore-from-backup.mjs --dry-run   # 先预览
node scripts/restore-from-backup.mjs --yes        # 一起恢复
```

## 8. 灾难演练（每季度一次）

1. **数据库演练**（不碰生产）：本机起一个临时 Postgres，用 dump 恢复，然后对比行数：
   ```bash
   pg_restore --clean --if-exists --no-owner -n public -d <临时库连接串> backups/db/wavemod-<最新>.dump
   psql <临时库> -c "select count(*) from mods;"   # 与 manifest.json 的 tableCounts.mods 对比
   ```
2. **图片演练**（不碰生产）：`node scripts/restore-from-backup.mjs --images-only --dry-run` 打印待回传数量；真要验证上传链路，可先上传到 COS 一个临时前缀（如 `restore-drill/<日期>/`），不要真覆盖 `mods/`、`tutorial/`。
3. 演练通过后再放心启用自动备份。

## 9. 常见参数与环境变量

**备份脚本参数：**

| 参数 | 作用 |
|---|---|
| `--dry-run` | 只预览（列目录/比对会执行，不下载/上传/推送） |
| `--full` | 忽略比对，强制全量重下所有图片 |
| `--no-push` | 备份但不提交/推送 git |
| `--db-only` / `--images-only` | 只备份数据库 / 只备份图片 |
| `--fast` | 只用 size 比对，不算 md5（快但可能漏掉同大小的变化） |
| `--concurrency=N` | 图片下载并发数（默认 8） |
| `--db-retention=N` | 保留最近 N 份 dump（默认 7，Actions 为 30） |

**环境变量：**

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | 备份源 / 恢复目标库连接串 |
| `RESTORE_DATABASE_URL` | 恢复时覆盖目标库（不填则用 `DATABASE_URL`） |
| `DB_DUMP_MODE` | `release`（默认，dump 走 GitHub Release）或 `git`（dump 提交进仓库） |
| `DB_RETENTION` | 保留 dump 份数（默认 7） |
| `PG_DUMP_PATH` / `PG_RESTORE_PATH` | pg 工具路径（默认 PATH 中的 `pg_dump`/`pg_restore`） |
| `GH_TOKEN` | 本机已登录 gh 则省略；Actions 自动注入 `GITHUB_TOKEN` |

## 10. 边界与注意事项

- **备份范围**：mods 预览图 + 教程图（COS 的 `mods/` 和 `tutorial/` 前缀）。**不含视频**（单文件可能超 GitHub 100MB 限制）。本地 `public/` 静态资源已随代码在 git 里。
- **dump 只含 `public` schema**：业务数据完整；auth/storage 是 Supabase 平台托管，不备份也不允许直接重建。
- **仓库体积**：首次全量图片约 300-500MB 进 git（GitHub 建议仓库 <1GB）。之后每天只增量几 MB，可控。
- **git 历史清理**（仅在 dump 曾用 git 模式、历史膨胀时）：单作者仓库可每月执行
  ```bash
  git filter-repo --path backups/db --invert-paths
  git push --force
  ```
  强制清理后需 `--full` 重新全量备份一次图片。

## 11. 架构决策记录

| 决策 | 原因 |
|---|---|
| dump 走 GitHub Release 而非 git | 每天全量 dump 会让 git 历史每月膨胀数百 MB；Release 附件独立存储、保留 N 份 |
| 图片提交 git 仓库 | 总量适中（数百 MB）、增量小，git 最简单可靠，恢复直接取文件 |
| 只备份 public schema | auth/storage 平台托管，`--clean` 重建会破坏 Supabase 平台 |
| Session pooler / direct 连接 | Transaction pooler（6543）会重置 `pg_dump` 长连接 |
| 恢复图片回传 COS 原 key | 数据库 URL 无需改动即恢复生效 |
