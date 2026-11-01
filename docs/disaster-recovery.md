# WaveMod 异地备份与灾难恢复手册

> **2026-11 数据库迁移后**：生产库已从 Supabase 搬到香港自建 PostgreSQL
> （`db.sunnyrose.xyz:6432`，pgbouncer + TLS）。本手册的备份/恢复流程仍然适用，
> 但连接串、备份来源和「登录用户」相关描述已更新。旧 Supabase 项目只保留
> **30 天**用于回滚，之后删除；下文涉及旧平台的内容仅作过渡期参考。
> 迁移方案见 `docs/db-migration-selfhosted-pg-prd.md`。

本手册说明如何把 WaveMod 的**数据库**和 **mod 图片**备份到 GitHub，以及数据意外丢失时如何**完全恢复**。

## 1. 备份架构总览

```
香港自建 PostgreSQL ──pg_dump(Fc, public)──▶ 数据库 dump ──▶ GitHub Release 附件（保留最近 30 份）
        │                                   └─▶ 香港机 /var/backups/wavemod（本地 30 份）
腾讯云 COS（mods/ + tutorial/ 图片）──▶ backups/images/ ──▶ git 仓库（增量提交）
表行数 ──▶ backups/manifest.json ──▶ git 仓库
```

- 自建库的**主备份**是香港机上的 `/etc/cron.d/wavemod-db-backup`（每天 03:10，
  `deploy/hk-db/backup.sh`，本地保留 30 份）；GitHub Actions 的每日备份是第二份异地副本。

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

## 3. 前置：数据库连接串

迁移完成后，备份与恢复都只认 `DATABASE_URL`，指向香港自建 pgbouncer：

```
DATABASE_URL=postgresql://wavemod_app:<密码>@db.sunnyrose.xyz:6432/wavemod?sslmode=verify-full
```

- 该串同时用于 `pg_dump` / `pg_restore` / 应用运行时，密码在
  `/etc/pgbouncer/userlist.txt`（服务器）与 Vercel 环境变量里。
- 证书由 certbot 维护；`sslmode=verify-full` 会校验证书与主机名。
- **过渡期（切换后 30 天内）** 旧 Supabase 连接串只用于回滚，不再作为备份源。

> ⚠️ 备份脚本在 GitHub Actions 上运行时需要出站访问 6432；服务器防火墙必须放行。
> 若不想把库暴露给 Actions，可只依赖香港机本地 cron 备份。

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

### 7.0 回滚到旧 Supabase（切换后 30 天内）

1. Vercel → Deployments → 把上一个可用版本 **Promote**（≤2 分钟）。
2. 恢复该版本需要的 `DATABASE_URL` / Supabase 环境变量（旧值仍留在备忘录或
   `.env.local.bak`，不要提前删）。
3. **先导出新库的增量**：`pg_dump -Fc "$NEW_DATABASE_URL" -f rollback-delta.dump`，
   否则切换后写入的 mod 会丢。把差异补回旧库后再宣布回滚完成。
4. 回滚后重新启用旧 Supabase 的 REST 网关（升级/解除 spend cap），确认后台可用。

> 30 天后旧项目删除，此路径失效；此后只能用备份恢复自建库。

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
- 只恢复 `public` schema（业务数据 + 表 + 函数 + 触发器 + 索引）。
- 自建库**没有 Auth/Storage**：登录已下线，`profiles` 等用户表只作历史存档；
  恢复后不需要重建 auth 触发器或 storage bucket。
- 若目标是全新空库：先执行 `db/schema.sql`（或直接 restore dump），再执行
  `db/cleanup-supabase-artifacts.sql` 去掉 dump 里可能残留的 RLS/policy。
- 恢复完成后用 `node scripts/verify-migration.mjs` 对比行数与 `mods` 校验和。

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

## 10. 兜底快照的发布路径（网关被锁时怎么让新内容立刻可见）

Supabase 网关被锁（`exceed_egress_quota` → REST/Auth 全站 402）期间，前台读的是兜底快照。
快照有**两份**，读侧顺序是：

```
COS（snapshots/mods-snapshot.json.gz）→ 打包内 data/mods-snapshot.json.gz → 空数组
```

打包内那份**只能在构建时打进部署**，所以只靠它的话，锁定期内新入库的 mod 要等重新部署
才可见（2026-09-21「当天 16 条 mod 在站上没有迅雷按钮」就是这么来的）。COS 那份是给
**运行中的部署**用的：换掉对象 + 通知缓存失效，几秒内生效，不用重新部署。

**发布入口**（都走 `scripts/mods-snapshot-export.mjs`）：

| 场景 | 命令 |
|---|---|
| 每日上传（`upload-daily-by-date.mjs`） | 有写入（`inserted > 0`）时自动：导出 → 传 COS → ping |
| 迅雷链接回填（`apply-daily-xunlei-by-date.mjs`） | 同上（`applied > 0`）；`drive_links` 在快照列清单里，不重发等于没改 |
| 每日备份 CI（`backup-to-github.mjs`） | 导出成功即**无条件**上传（不只在内容变化时），manifest 记 `cosKey` / `cosUrl` |
| 手工重导之后 | `node scripts/publish-mods-snapshot-to-cos.mjs [--dry-run] [--no-ping]` |

**顺序必须是「导出 → 传 COS → 再 ping」**，反过来有问题：ping 会清掉 `mods:snapshot`
缓存条目，若先 ping 后上传，ping 之后第一个走到回退的请求会把 **COS 上的旧对象**重新
拉下来缓存一整个 TTL，新内容反而比不 ping 更晚可见。

注意 `revalidateTag` 是 **stale-while-revalidate**：ping 之后的**第一个**请求仍可能拿到
旧 payload，第二个才是新的（实测如此）。

**两个环境前提**（Vercel 控制台）：

1. `COS_BUCKET` / `COS_REGION` 必须在 **Production + Runtime** 作用域可见。只配在 Build
   里的话运行时会读不到 ⇒ 静默只用打包内那份（表现为「发了也不生效」）。
2. 对象是**匿名公开读**的（不需要任何密钥，`curl -I` 能直接取）。这是刻意的取舍：
   换来的是读路径不需要签发 STS 临时密钥、也不需要给 serverless 函数配 COS 密钥。
   代价是**全量已发布 mod 数据变成一条公开直链** —— 内容与站上页面完全一致（导出的 SQL
   里没有 `created_by`、没有用户 id，`drive_links` 本来就是页面上公开的分享链），
   但这一点必须写明，不要让它变成无人知道的既成事实。

排查「发了快照但前台还是旧内容」时按序看：`curl -I` 确认对象在（404 = 键写错/没传成功）；
Vercel 运行时日志里有没有 `[mods] 已从远程快照（COS）载入`（有 = 走的是 COS 那份）；
有没有 `[mods] 远程快照不可用` 或 `未配置 COS_BUCKET`（有 = 根本没读 COS）。
这两个告警只在回退路径上打印，所以「日志里没有」本身也是信息。

## 11. 边界与注意事项

- **备份范围**：mods 预览图 + 教程图（COS 的 `mods/` 和 `tutorial/` 前缀）。**不含视频**（单文件可能超 GitHub 100MB 限制）。本地 `public/` 静态资源已随代码在 git 里。
- **dump 只含 `public` schema**：业务数据完整；自建库不迁移 Supabase Auth/Storage
  的内部表，`profiles/favorites/likes/comments/ratings` 只作历史存档。
- **仓库体积**：首次全量图片约 300-500MB 进 git（GitHub 建议仓库 <1GB）。之后每天只增量几 MB，可控。
- **git 历史清理**（仅在 dump 曾用 git 模式、历史膨胀时）：单作者仓库可每月执行
  ```bash
  git filter-repo --path backups/db --invert-paths
  git push --force
  ```
  强制清理后需 `--full` 重新全量备份一次图片。

## 12. 架构决策记录

| 决策 | 原因 |
|---|---|
| dump 走 GitHub Release 而非 git | 每天全量 dump 会让 git 历史每月膨胀数百 MB；Release 附件独立存储、保留 N 份 |
| 图片提交 git 仓库 | 总量适中（数百 MB）、增量小，git 最简单可靠，恢复直接取文件 |
| 只备份 public schema | 自建库不迁 Supabase Auth/Storage；业务数据都在 public |
| 香港机本地 cron + GitHub Actions 双备份 | 单机自建库没有托管平台的高可用；本地备份保证 Actions 不可达时仍有副本 |
| pgbouncer transaction 模式 | Vercel Serverless 实例多，直连会打满 Postgres 连接 |
| 恢复图片回传 COS 原 key | 数据库 URL 无需改动即恢复生效 |
| 兜底快照同时放 COS、且匿名公开读 | 锁定期内新内容要立刻可见就得绕开「重新部署」；公开读省掉密钥管理，代价（全量数据一条公开直链）见第 10 节 |
| 快照缓存的是 COS 上的 base64，不是解析后的行数组 | Vercel Data Cache 单条上限 2MB（解析后约 4.7MB），超限时 Next 静默不写 ⇒ 退化成每请求真拉 513KB |
| 每日备份无条件发快照（不只在内容变化时） | 上一次上传失败会让「内容没变化」永远为真，COS 从此停在旧版且没有任何信号 |
