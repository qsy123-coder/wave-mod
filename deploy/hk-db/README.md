# 香港自建 PostgreSQL 运维手册

对应 PRD：`docs/db-migration-selfhosted-pg-prd.md`。

目标机：`45.135.119.204`（香港反代机，2C / 1.9G / 30G，Ubuntu 22.04）。

```
Vercel hkg1 ──TLS 6432──▶ pgbouncer ──▶ PostgreSQL 17（仅 127.0.0.1:5432）
                              │
                 后台 `/admin` 鉴权在应用层（登录页 + 30 天 Cookie / Basic 头）
```

## 0. 顺序（不能反）

1. **DNS**：`db.sunnyrose.xyz` A 记录 → 本机公网 IP（Cloudflare 灰云）。
2. **防火墙**：腾讯云轻量控制台放行 **6432**（本机 ufw 是 inactive，改它没用）。
3. **证书**：`deploy/hk-db/install.sh` 会签（DNS-01 需要 `CF_DNS_API_TOKEN`）。
4. **装机 + 建库**：见下。
5. **迁移数据**：先 dump/restore 到新库并校验，再切应用。

## 1. 装机

在服务器上（root）：

```bash
DB_PASSWORD='<32位随机字母数字>' \
ADMIN_BASIC_USER='waveadmin' \
ADMIN_BASIC_PASSWORD='<后台密码>' \
DB_DOMAIN='db.sunnyrose.xyz' \
CF_DNS_API_TOKEN='<Cloudflare DNS Edit token>' \
CERTBOT_EMAIL='<邮箱>' \
bash deploy/hk-db/install.sh
```

脚本会：

- 安装 PostgreSQL 17（PGDG）+ pgbouncer + certbot；
- 写 `/etc/postgresql/17/main/conf.d/wavemod.conf`（内存/连接数按 1.9G 调）；
- 建角色 `wavemod_app` 与库 `wavemod`；
- 渲染 `/etc/pgbouncer/pgbouncer.ini`，启用 TLS + SCRAM；
- 写 `/etc/nginx/.htpasswd.wavemod`（历史遗留：nginx 现在不再读它，
  后台鉴权已移到应用层，见下方说明）；
- 安装每日备份 `/usr/local/bin/wavemod-db-backup` 与 `/etc/cron.d/wavemod-db-backup`。

> nginx 配置在 `deploy/hk-proxy/nginx/wavemod-proxy.conf.template` 里，重跑
> `scripts/setup-hk-proxy.sh` 才会生效。**不要手改渲染后的 nginx 文件**。
>
> 2026-11-05 起 nginx **不再做 `auth_basic`**（浏览器原生弹框关掉浏览器就忘）：
> 后台改为 `/admin/login` 站内登录换 30 天签名 Cookie，鉴权全在 `src/proxy.ts`；
> htpasswd 仅作历史保留，curl 仍可用 `-u waveadmin:<密码>` 走应用层 Basic 校验。

## 2. 自检

```bash
systemctl status postgresql pgbouncer --no-pager
ss -ltnp | grep -E ':5432|:6432'
psql "postgresql://wavemod_app:<密码>@db.sunnyrose.xyz:6432/wavemod?sslmode=verify-full" -c "select 1"
```

若 `psql` 报证书错误：确认 `db.sunnyrose.xyz` 已签证书、DNS 已指向本机，
且 pgbouncer 在证书签发后重启过。

## 3. 迁移数据

**在服务器上执行**（29MB dump 不过公网两遍；服务器装的是 PG17 客户端）：

```bash
cd /opt/wavemod   # 或你的仓库目录
SOURCE_DATABASE_URL='postgresql://...@aws-...pooler.supabase.com:5432/postgres' \
TARGET_ADMIN_URL='postgresql://postgres:<本机密码>@127.0.0.1:5432/wavemod' \
APP_DB_USER='wavemod_app' \
node scripts/migrate-supabase-to-hk.mjs
```

- 目标库必须为空（否则加 `--force`，会与现有对象冲突）。
- 脚本会自动预建 `auth.users` 桩、过滤 `CREATE SCHEMA public`、
  restore 后执行 `db/cleanup-supabase-artifacts.sql`、授权给 `wavemod_app`，
  最后跑 `scripts/verify-migration.mjs` 校验行数/校验和/列定义。
- 只想复跑校验：

```bash
SOURCE_DATABASE_URL='...' DATABASE_URL='postgresql://wavemod_app:...@db.sunnyrose.xyz:6432/wavemod?sslmode=verify-full' \
node scripts/verify-migration.mjs
```

## 4. 切换应用

在 Vercel（Production + Preview）设置：

| 变量 | 值 |
|---|---|
| `DATABASE_URL` | `postgresql://wavemod_app:<密码>@db.sunnyrose.xyz:6432/wavemod?sslmode=verify-full` |
| `ADMIN_BASIC_AUTH_USER` | 与 htpasswd 相同 |
| `ADMIN_BASIC_AUTH_PASSWORD` | 与 htpasswd 相同 |

然后部署新版本。切换窗口：

1. 停每日上传、暂停后台编辑（冻结写入）；
2. 在服务器上重跑一次 migrate（拿到最终增量）；
3. Vercel 部署/提升新版本；
4. 验证 `/api/mods`、`/api/updates`、`/admin/mods`（带 Basic Auth）；
5. 解除冻结；跑 `node scripts/upload-daily-by-date.mjs --dry-run` 确认「待上传 = 0」。

## 5. 回滚

- 应用：Vercel Promote 上一个版本，恢复 Supabase 环境变量。
- 数据：先 `pg_dump` 新库导出切换后的增量，再补回旧库（详见
  `docs/disaster-recovery.md` 7.0）。
- 旧 Supabase 保留 30 天，之后删除。

## 6. 备份

```bash
# 立即备份一次
DB_NAME=wavemod /usr/local/bin/wavemod-db-backup

# 看备份
ls -lh /var/backups/wavemod/

# 恢复某份到临时库演练
createdb wavemod_restore_drill
pg_restore --no-owner --no-privileges -d wavemod_restore_drill /var/backups/wavemod/wavemod-<ts>.dump
```

每日 03:10 由 cron 执行，保留 30 份。异地副本由 GitHub Actions
`.github/workflows/backup.yml` 使用同一个 `DATABASE_URL` 再跑一遍。

## 7. 常见问题

| 现象 | 排查 |
|---|---|
| 应用报 `password authentication failed` | `/etc/pgbouncer/userlist.txt` 与 Vercel env 是否一致；改完 `systemctl restart pgbouncer` |
| 报 `SSL required` / 证书错误 | pgbouncer 是否在证书签发后重启；`db.sunnyrose.xyz` A 记录是否指向本机 |
| 连接被拒绝 | 腾讯云控制台 6432 是否放行；`ss -ltnp` 是否监听 0.0.0.0:6432 |
| `too many connections` | pgbouncer `max_client_conn` / `default_pool_size`；应用 `PG_POOL_MAX` |
| 后台一直跳登录页 | 检查 Vercel 的 `ADMIN_BASIC_AUTH_USER/PASSWORD`；Cookie 由密码派生签名，改密码会让旧登录全部失效 |
| 想强制所有设备重新登录 | 改 `ADMIN_BASIC_AUTH_PASSWORD`（或改 `ADMIN_SESSION_SECRET`）后重新部署 |
| 内存吃紧 | `free -m`；必要时把轻量升到 4G（PG 的 shared_buffers 已压到 256MB） |

## 8. 安全边界

- Postgres 只监听 `127.0.0.1`，公网只有 pgbouncer 6432。
- pgbouncer 强制 TLS + SCRAM；应用角色不是超级用户。
- `wavemod_app` 的密码 32 位随机；轮换时同时改 userlist 与 Vercel env。
- 后台访问控制集中在应用层 `src/proxy.ts`：站内登录页换 30 天签名 Cookie
  （`wavemod_admin_session`），或 curl 用 Basic 头；nginx 不再弹原生 Basic 框。
  凭据仍是 `ADMIN_BASIC_AUTH_USER/PASSWORD`，Cookie 签名密钥由它派生
  （也可用 `ADMIN_SESSION_SECRET` 单独指定）。
