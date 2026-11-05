# 数据库迁移 PRD：Supabase → 香港自建 PostgreSQL

> 状态：实施中（代码与本地演练已完成，待装机/切换；见 §14）
> 日期：2026-11-01
> 决策来源：2026-11-01 需求会话（「数据库迁移 + 恢复后台管理」）
> 关联文档：`docs/disaster-recovery.md`、`docs/hk-proxy-runbook.md`、`docs/域名入口拓扑.md`

---

## 1. 背景与问题

### 1.1 现在卡在哪

- 2026-09-21 起，Supabase 免费额度的出站流量被打穿，**REST / Auth 网关整层返回 402
  （`exceed_egress_quota`）**。应用运行时全部走 `@supabase/supabase-js` → REST，
  因此后台登录、后台读写、评论、评分、个人中心全部不可用。
- 前台还能打开，是因为公开读有 COS 兜底快照（`src/lib/mods-domain/snapshot.ts`），
  数据停留在最后一次快照；新上传的 mod 要等有人手动发快照才会出现在列表里。
- **直连 5432 pooler 不受影响**：每日上传脚本、备份脚本、快照导出早就改成
  `psql` 直连（`scripts/psql-db.mjs`）。这说明数据本身是好的，坏的只是 Supabase 的
  HTTP 网关。
- 用户明确要「恢复后台管理」，并接受牺牲登录能力。

### 1.2 一句话目标

把**数据**从 Supabase Postgres 搬到香港服务器自建的 PostgreSQL，应用改成原生 `pg`
直连；后台保留除登录外的全部能力；图片仍放腾讯云 COS 不动。

### 1.3 实测现状（2026-11-01）

| 项目 | 实测值 |
|---|---|
| 源库版本 | PostgreSQL **17.6**（Supabase） |
| 整库大小 | **29 MB** |
| `mods` | **5,578** 行 |
| `profiles` | 136 行 |
| `favorites` | 34 行 |
| `likes` | 7 行 |
| `comments` / `comment_reactions` / `ratings` | 0 行 |
| `engagement_totals` / `engagement_devices` | 4,233 / 4,157 行（历史计数，已不走此路径） |
| `tutorial_images` | 138 行 |
| `gamebanana_mods` | 288 行 |
| 香港反代机 | `45.135.119.204`，2 核 / 1.9 GB 内存 / 30 GB 盘，nginx 1.18，**未装 Postgres/Docker** |

> 结论：库非常小，单机 PostgreSQL 绰绰有余；真正的风险在**网络暴露**和**切换窗口**，
> 不在容量。

---

## 2. 目标 / 非目标

### 2.1 目标

- **G1 后台恢复**：`/admin` 下的管理列表、上传、编辑、批量操作、推荐位、教程管理
  全部可用（**除登录之外的所有**）。
- **G2 数据完整**：`public` schema 全部业务数据（含历史用户表）迁到新库，
  行数与关键字段校验和一致。
- **G3 前台不变**：列表、详情、角色分类、每日更新、搜索、排序、兜底快照的行为
  与迁移前一致；首页与详情页不出现空窗。
- **G4 去掉 Supabase 运行时依赖**：`src/` 内不再 import `@supabase/*`，
  应用不再依赖 REST 网关。
- **G5 可回滚**：旧 Supabase 保留 **30 天**，期间可切回；回滚步骤写入文档。

### 2.2 非目标（这次不做）

- **不做登录**：不放回邮箱/手机 OTP，不引入 NextAuth，不建新用户体系。
- **不迁图片**：图片继续在腾讯云 COS；Supabase Storage 只读保留到清理日。
- **不迁 Supabase Auth / Storage 的内部表**：`auth.users`、`storage.objects` 等不迁；
  `profiles` 作为业务数据迁过去存档。
- **不建高可用**：单机 + 每日备份 + 30 天旧库，不做主从/自动故障转移。
- **不改每日更新规则**：去重键 `character|title`、角色归一化、标题用文件名等硬规则
  （见 `CLAUDE.md`）一律不动。
- **不改缓存语义**：香港 nginx 缓存、`unstable_cache` TTL、快照兜底都保持现状。
- **不新建角色分类**：不碰任何 `character` 值。
- **不恢复评论 / 评分**：代码与入口移除，数据保留为存档。
- **不处理 Cloudflare Workers 部署**：该流水线已禁用（超出 3 MiB 限制），
  若将来重启需单独评估（Workers 无长连接，需 Hyperdrive 或 HTTP 网关）。

---

## 3. 用户故事

### 3.1 站长（唯一真实用户）

- 我打开 `/admin/mods`，输入 Basic Auth 账号密码后能看到全部 5,578 条 mod，按状态/角色筛选。
- 我上传一条新 mod：图片直传 COS、ZIP 直传 OSS、表单写库成功，前台立刻可见。
- 我批量上架/下架/推荐，操作后前台缓存立即失效。
- 我管理教程的章节、图片、工具、版本。
- 我不用登录，也不用担心别人从 `*.vercel.app` 绕过 nginx 直接进后台。

### 3.2 访客

- 我打开首页/列表/详情，速度与现在一致，数据是最新的。
- 我点赞、收藏、浏览、点网盘，行为和现在一致（这些本来就不走 Supabase）。
- 我看不到登录按钮、评论框、评分星星、个人中心入口。
- 我的收藏只保存在这台设备上，换设备就没了（已在页面上写明）。

### 3.3 每日上传（本机脚本）

- 我照旧运行 `node scripts/upload-daily-by-date.mjs --dates=...`，脚本连新库写入，
  入库后自动 ping `/api/revalidate`，当天条目出现在「每日更新」。
- dry-run 的「待上传」仍为 0（去重键不受影响）。

### 3.4 运维（备份 / 回滚）

- 每天自动从新库 `pg_dump`，保留 30 份，异地存放。
- 出事时能按文档在 5 分钟内切回旧 Supabase。

---

## 4. 现状盘点

### 4.1 数据访问层

| 层 | 现状 | 文件 |
|---|---|---|
| 公开只读 | `createPublicReadClient()`（anon key → REST） | `src/lib/supabase/server.ts:10` |
| 带会话读 | `createClient()`（Cookie → REST） | `src/lib/supabase/server.ts:25` |
| 后台写 | `createAdminClient()`（service_role → REST） | `src/lib/supabase/admin.ts:6` |
| 浏览器 | `createClient()`（`@supabase/ssr`） | `src/lib/supabase/client.ts:8` |
| 脚本 | `psql` 直连 5432 pooler | `scripts/psql-db.mjs` |

- 全仓库**没有 Prisma / Drizzle / tRPC / 原生 `pg`**；`CLAUDE.md` 的技术栈描述已过时。
- `src/` 内 Supabase 相关 import 共 **39 个文件**；`.from()/.auth./storage` 调用
  共 46 处（16 个文件直接调查询，其余是 client 封装与类型）。
- 线上 schema 与仓库 `supabase/schema.sql` **不一致**：线上 `mods` 还多出
  `game_key`、`drive_links`、`is_featured`、`featured_order`、`downloads_count`、
  `cover_width/cover_height/cover_source` 等列；仓库 SQL 已不能作为建库依据。

### 4.2 后台与认证

- 后台认证 = **Supabase Auth Cookie + `src/proxy.ts`（Next 16 中间件）+ 服务端 layout 守卫**：
  `proxy.ts:48-96` → `supabase.auth.getUser()` → `isAdminIdentity()`；
  `src/app/admin/layout.tsx:9` 再调 `requireAdminUser()`。
- 管理员判定靠 `ADMIN_EMAIL` / `ADMIN_PHONES` 白名单。
- 登录方式：邮箱 OTP、手机 OTP（阿里云 Dypns）、微信桥接（未激活）。
- 后台页面：`/admin/mods`、`/admin/mods/[id]/edit`、`/admin/upload`、`/admin/games`、
  `/admin/games/[game]/stats`、`/admin/tutorial`。
- 写库全部经 Server Actions，文件在 `src/actions/admin/*.ts` 与
  `src/actions/tutorial/tutorial-actions.ts`。

### 4.3 互动数据（**这次不碰**）

点赞 / 收藏 / 浏览 / 下载走香港机上已运行的 `deploy/hk-engagement/service.py`：

- 浏览器用 `localStorage` 设备号去重，无需登录；
- 落盘在 HK 本地文件 + COS 镜像，与 Supabase 无关；
- 收藏页 `FavoritesClient` 已经以设备收藏为主，登录收藏只是额外合并。

**结论**：迁移不影响这四项，`favorites/likes` 表数据仅作历史存档。

### 4.4 部署拓扑

```
访客 → go.sunnyrose.xyz（Cloudflare DNS only）
     → 香港反代 45.135.119.204（nginx + 缓存）
     → Vercel 函数 hkg1（Next.js 16）
     → Supabase Postgres（首尔）
     → 腾讯云 COS（浏览器直连，图片）
```

- 应用**不部署在香港机**；香港机只做 TLS 终止、缓存、维护页。
- 香港机与 Vercel 之间是公网 HTTPS。

### 4.5 仓库与线上偏差（迁移时必须纠正）

- `supabase/schema.sql` 缺列（见 4.1），迁移 schema 必须**从线上 dump 生成**，
  不能拿仓库 SQL 当真相。
- `docs/disaster-recovery.md:36` 仍写「本机没有连接串」，实际 `.env.local` 已有
  `DATABASE_URL`。
- `wrangler.jsonc` 仍写死旧域名 `wave-mod.top` 与 Supabase key。

---

## 5. 方案设计

### 5.1 目标架构

```
                         ┌──────────────────────── 香港机 45.135.119.204 ─┐
访客 → go.sunnyrose.xyz →│ nginx :443（缓存 / Basic Auth / 维护页）        │
                         │   └─→ Vercel hkg1（应用，出站连 6432）           │
                         │ pgbouncer :6432（TLS + SCRAM，公网）            │
                         │   └─→ PostgreSQL 17.6 :5432（仅本机）           │
                         │ cron: pg_dump → 本地 + COS 备份                  │
                         └──────────────────────────────────────────────────┘
                                        │
                                 腾讯云 COS（图片，不变）
```

- 应用仍部署在 Vercel hkg1，**不搬应用**。
- Vercel → 香港 pgbouncer 走公网 TLS；pgbouncer → Postgres 走本机回环，不加密。
- 每日上传脚本、备份脚本从本机/CI 直连 pgbouncer。

### 5.2 关键取舍

| 方案 | 结论 | 理由 |
|---|---|---|
| **A. 香港自建 PostgreSQL + 原生 `pg`** | **采用** | 29 MB 的库、单管理员、无用户体系；成本最低，彻底摆脱 REST 配额；符合用户选择。 |
| B. 继续用 Supabase（升级付费 / 等额度恢复） | 否 | 已被 402 锁死；付费也解决不了「后台恢复」的即时需求；仍受供应商约束。 |
| C. 在 HK 自建完整 Supabase 栈（GoTrue/PostgREST/Storage） | 否 | 为了不用登录却重装整套认证/网关，运维面最大；且要重写 RLS。 |
| D. 在 HK 自建一个 HTTP 数据 API（类似 PostgREST） | 否 | 等于自己再造 REST 层；每次查询多一跳，还得维护鉴权/限流。原生 `pg` 更直接。 |
| E. Prisma / Drizzle | 否 | 项目本来就没有 ORM；为 17 张表引入 ORM 与迁移工具违背「保持简单」。手写 SQL + 小工具即可。 |
| F. SQLite / 文件库 | 否 | 放弃 Postgres 类型与 JSONB（`drive_links` 依赖 jsonb）；并发与备份生态都更差。 |

### 5.3 数据访问层设计

新增最小数据层（不引入 ORM）：

```
src/lib/db/
├── pool.ts        # 全局单例 Pool（globalThis 防 HMR 重复创建）
├── query.ts       # query<T>(sql, params) / one<T>() / many<T>() / tx()
└── types.ts       # 手写行类型（从线上 schema 生成一次，后续手维护）
```

约束：

1. **只用参数化查询**（`$1, $2, ...`），禁止字符串拼接用户输入。
2. Pool 配置：`max: 5`、`idleTimeoutMillis: 10_000`、`connectionTimeoutMillis: 5_000`，
   `ssl: { rejectUnauthorized: true }`（证书链到 ISRG Root X1，Node 自带信任库）。
3. pgbouncer 用 **transaction 模式**：不使用命名 prepared statement、`LISTEN/NOTIFY`、
   会话级 `SET`，连接复用安全。
4. 所有 DB 模块保留 `import "server-only"`；不允许客户端 import。
5. **不改变公开读的算法**：`public.ts` 仍然是「整表分片拉取 → 内存 filter/sort/rank」，
   只把 `supabase.from("mods").select(...).range(...)` 换成 SQL `SELECT ... LIMIT/OFFSET`。
   这样角色别名、复合关键词、hot 排序、zh-CN 排序等语义零变化。
6. 快照兜底保留：`getSnapshotRows()` 不动；DB 不可用时仍回退 COS/打包快照。

### 5.4 后台防护（应用层登录态）

> 2026-11-05 更新：浏览器原生 Basic 弹框在关掉浏览器后不保留凭据，后台每天都要
> 重输密码，已改成**站内登录页 + 30 天签名 Cookie**。nginx 不再下 `auth_basic`
> challenge（否则浏览器仍会弹框），鉴权集中在应用层；curl 的 Basic 头继续支持。

1. **nginx 层**：只负责「不缓存 + 透传」，不再做 Basic Auth。
2. **应用层** `src/proxy.ts`：
   - 有有效 `wavemod_admin_session` Cookie（HMAC 签名，30 天）→ 放行；
   - 否则有有效 Basic 头（`ADMIN_BASIC_AUTH_USER/PASSWORD`）→ 放行（给 curl/脚本）；
   - 否则整页导航 302 到 `/admin/login`，接口/Server Action 返回
     `401 {"error":"unauthorized"}`，**不带 `WWW-Authenticate`**（不弹浏览器框）。
   - 使用 Web Crypto 计算 SHA-256 后**定长比较**，避免时序侧信道。
   - 凭据只存服务端 env，不进客户端 bundle。
   - matcher：`/admin/:path*`、`/api/cos/sign`、`/api/oss/sign`；
     `/visits` 继续走它自己的 `VISITS_TOKEN`。

> 为什么不是「nginx 注入一个请求头，应用只认头」：`*.vercel.app` 直连时没有 nginx，
> 头可以伪造；应用必须能独立验证凭据。

- 后台页面不再有登录/退出；`/admin` 根路径本来就没有页面，保持现状。
- 公共站点头部的「登录 / 个人中心 / 后台」入口移除；后台通过书签或直接 URL 进入。
- Basic Auth 只走 HTTPS；轮换凭据时同时改 Vercel env 与服务器 htpasswd，写进运维文档。

### 5.5 功能面变更

| 功能 | 处理 |
|---|---|
| 点赞 / 收藏 / 浏览 / 下载 | **保留**（HK engagement 服务，不依赖 DB） |
| 收藏页 `/favorites` | **保留**，改为纯设备收藏；移除「退出登录」与服务端合并 |
| 评论（含绝区零分区） | **下线**：删除页面组件、Server Action、API route、数据读取 |
| 评分 | **下线**：删除评分 Action 与残留类型；DB 列保留不删 |
| 登录 / 注册 / OTP / 个人中心 / 资料编辑 | **下线**：删除 `/auth/*`、`/api/auth/*`、`/profile`、`SessionProvider`、`profile-actions` |
| 布局风格（皮肤） | **保留**，只走 cookie + localStorage；删除 Supabase 同步 |
| 后台全部 | **保留**，去掉登录守卫与 `profiles` 写入 |
| 教程管理 | **保留**，数据层改 SQL |
| 图片上传 | **保留**，只走 COS；删除 Supabase Storage 兜底 |
| ZIP 上传 | **保留**，只走阿里云 OSS |

### 5.6 网络、TLS 与资源

- **暴露面**：只开 `6432`（pgbouncer）；Postgres `listen_addresses = '127.0.0.1'`。
- **TLS**：为 `db.sunnyrose.xyz` 签 Let's Encrypt 证书（DNS-01 或 HTTP-01），
  pgbouncer `client_tls_sslmode = require`；应用 `rejectUnauthorized: true`。
- **认证**：pgbouncer `auth_type = scram-sha-256`，应用角色 `wavemod_app`
  只拥有 `wavemod` 库的 DML/DDL 权限，**不是超级用户**。
- **防爆破**：fail2ban 监听 pgbouncer 日志；密码 32 位随机；不改默认端口之外不加复杂度。
- **腾讯云控制台防火墙**放行 6432（轻量的 ufw 是 inactive，改本机没用）。
- **内存预算**（1.9 GB）：Postgres `shared_buffers=256MB`、`work_mem=8MB`、
  `max_connections=100`；pgbouncer 常驻约 20MB。nginx 缓存已有占用，切换前
  `free -m` 与 `df -h` 必须留 ≥ 300 MB 内存、≥ 5 GB 磁盘。
- **连接风暴**：Vercel 每实例 Pool `max=5`，pgbouncer `default_pool_size=20`、
  `max_client_conn=200`。所有 DB 路由必须运行在 Node runtime（不能是 Edge）。
- **不做** SSH 隧道/Cloudflare Tunnel：Vercel 到本机没有稳定入口，TLS+强口令是
  可维护的最小方案。

---

## 6. 数据与接口变更

### 6.1 Schema 迁移

**以线上 dump 为准**，仓库 `supabase/schema.sql` 只作参考。

1. 线上 `pg_dump --schema=public --no-owner --no-privileges -Fc`。
2. 目标库预建 Supabase 桩对象，让 dump 能原样恢复：
   ```sql
   create role anon nologin; create role authenticated nologin;
   create role service_role nologin;
   create schema if not exists auth;
   create table if not exists auth.users (id uuid primary key);
   create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
   ```
   > 这样做是为了让 `profiles -> auth.users` 外键、RLS 策略、`handle_new_user()`
   > 触发器能创建成功；恢复后统一清理。
3. `pg_restore --no-owner --no-privileges -d wavemod`。
4. 执行 `db/cleanup-supabase-artifacts.sql`：
   - `alter table ... disable row level security`（所有 public 表）；
   - `drop policy ...`（全部 Supabase 策略）；
   - `drop trigger on_auth_user_created on auth.users`；
   - 删除 `public.is_admin()` / `public.handle_new_user()`；
   - 撤销 `anon/authenticated/service_role` 的授权；
   - **保留** `profiles`、`favorites`、`likes`、`comments`、`comment_reactions`、
     `ratings` 表与数据（存档；代码不再读写）。
5. 索引：保留现有索引；补一条列表主查询索引
   `(game_key, is_published, created_at desc)`（现有只有单列索引）。
6. 视图 `mod_character_counts` 原样恢复。
7. **不迁移**：`auth.*`、`storage.*`、`realtime.*`、`supabase_migrations.*`。
   其中 `engagement_totals/devices` 是历史表，保留但不写入。

**验收口径**：每张表行数一致 + `mods` 关键字段 md5 一致：

```sql
select count(*),
       md5(string_agg(id::text || title || character || created_at::text, '|' order by id))
from mods;
```

两边结果必须逐字相同。

### 6.2 代码改造映射

| 模块 | 现状 | 改造 |
|---|---|---|
| `src/lib/supabase/*` | 4 个客户端封装 | 删除，替换为 `src/lib/db/*` |
| `src/lib/mods-domain/public.ts` | 分片 REST 读取 + 快照兜底 | 分片 SQL 查询，缓存/排序/兜底逻辑不动 |
| `src/lib/mods-domain/admin.ts` | service_role 分页读 | SQL 分页查询 |
| `src/lib/mods-domain/daily.ts` | REST | SQL |
| `src/lib/mods-domain/creators.ts` | REST | SQL |
| `src/lib/mods-domain/favorites.ts` | 登录收藏 | 删除（收藏页走设备收藏） |
| `src/lib/mods-domain/viewer.ts` | 登录态点赞/收藏/评分 | 删除（`detail.ts` 不再取 viewer 状态） |
| `src/lib/mods-domain/comments.ts` | REST | 删除 |
| `src/actions/admin/*.ts`（6 个） | service_role 写 | SQL；守卫改为 Basic Auth |
| `src/actions/tutorial/tutorial-actions.ts` | REST 读写 | SQL |
| `src/app/api/cos/sign`、`oss/sign` | `requireAdminUser` | Basic Auth 校验 |
| `src/app/api/mods/[id]/view`、`download` | service_role 计数 | SQL 原子自增（或删除死路由） |
| `src/app/api/mods/[id]/comments` | REST | 删除 |
| `src/app/api/auth/*`、`src/app/auth/*` | Supabase Auth | 删除 |
| `src/proxy.ts` | Supabase 会话守卫 | Basic Auth 校验 |
| `src/components/features/auth/*` | 登录 UI / SessionProvider | 删除；消费方改为「恒定游客」 |
| `src/components/features/mods/detail/comments-panel|comment-form|comment-delete-button` | 评论 UI | 删除 |
| `src/features/games/zenless-zone-zero/components/zenless-comments-section.tsx` | 分区评论 | 删除 |
| `src/components/features/mods/detail/{mod-detail-drawer,game-mod-detail-content}.tsx` | 渲染评论/登录态 | 移除评论与登录分支 |
| `src/app/[game]/profile/*`、`src/app/(site)/profile/*` | 个人中心 | 删除 |
| `src/actions/user/profile-actions.ts` | 资料 + 皮肤同步 | 删除；`layout-style-provider` 改纯本地 |
| `src/lib/engagement/supabase-store.ts` | 已停用的旧后端 | 删除 |
| `src/types/supabase.ts` | 数据库类型 | 删除，改为 `src/lib/db/types.ts` |
| `scripts/backup-to-github.mjs` | dump + REST 行数 | 行数统计改 `psql` |
| `.github/workflows/backup.yml`、`quality.yml` | Supabase secrets | 改新连接串，移除 Supabase key |
| `docs/disaster-recovery.md` | Supabase 备份/恢复 | 按新架构重写 |
| `CLAUDE.md` 技术栈段 | 过时（Prisma/tRPC/NextAuth） | 同步纠正（单独 commit） |

### 6.3 环境变量

**Vercel（Production + Preview）**

| 变量 | 动作 |
|---|---|
| `DATABASE_URL` | 新增；`postgresql://wavemod_app:...@db.sunnyrose.xyz:6432/wavemod?sslmode=verify-full` |
| `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD` | 新增 |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` / anon / service role | 切换后移除 |
| `ADMIN_EMAIL` / `ADMIN_PHONES` / `ENABLE_SUPABASE_PHONE_OTP` | 移除 |
| `ALIYUN_DYPNS_*` / `ALIYUN_DYSMS_*` | 移除（登录短信不再使用） |
| `WECHAT_AUTH_BRIDGE_URL` | 移除 |
| `COS_*`、`ALIYUN_OSS_*`、`REVALIDATE_SECRET`、`VISITS_TOKEN` | **保留** |

**本机 `.env.local`**：`DATABASE_URL` 改为新串；删除 Supabase 相关键。

**GitHub Secrets**：`DATABASE_URL` 更新；删除 Supabase secrets；保留 COS/OSS。

### 6.4 脚本与 CI

- 新增 `scripts/migrate-supabase-to-hk.mjs`：dump → 桩对象 → restore → cleanup → 校验。
- 新增 `scripts/verify-migration.mjs`：行数 + md5 + 列/索引对比，退出码非 0 即失败。
- 新增 `deploy/hk-db/`：`install.sh`（PG17 + pgbouncer + 证书 + 防火墙提示）、
  `pgbouncer.ini`、`postgresql.conf.snippet`、`backup.sh`、`README.md`。
- 备份改为**香港机本地 cron 为主**（每天 03:00，`pg_dump -Fc` → `/var/backups/wavemod/`
  保留 30 份 → 上传 COS）；GitHub Actions 备份保留为第二份。
- 每日上传脚本**不需要改代码**：换 `DATABASE_URL` 即可；切换后必须跑
  `node scripts/upload-daily-by-date.mjs --dry-run`（不带 `--dates`），
  「待上传」必须为 0。
- 一次性 `scripts/apply-*.mjs` 仍用 supabase-js；旧库保留 30 天内可继续用，
  之后按需改写或删除（不影响主流程）。

---

## 7. 切换流程（含停机窗口）

> 用户接受「可停机几分钟，一次性切换」。目标是**写入冻结 ≤ 15 分钟**。

### Phase 0：基础设施（提前 1–2 天，不影响线上）

1. 香港机装 PostgreSQL 17 + pgbouncer，建库建角色，签 `db.sunnyrose.xyz` 证书。
2. 放行腾讯云防火墙 6432；本机 `psql` 用 `sslmode=verify-full` 连一次验证。
3. nginx 加 Basic Auth（模板 + 部署脚本），验证 `/admin` 返回 401、带凭据 200。
4. 配好每日 `pg_dump` cron 与 COS 上传，跑一次恢复演练到临时库。

### Phase 1：数据搬迁 + 校验（提前，不影响线上）

5. 从 Supabase dump/restore 到新库；跑 `scripts/verify-migration.mjs`。
6. 用**预览部署**（Vercel Preview，env 指向新库）做只读冒烟：
   首页、列表、详情、角色分类、`/api/updates`、`/api/mods`。
7. 抓一份生产基线：`/api/updates`、`/api/mods?sort=new&page=1`、`/api/characters`、
   `/api/home/lower` 的 JSON（归一化时间戳），迁移后逐项 diff。

### Phase 2：代码合入（提前合，默认不切流量）

8. 数据层 SQL 化、认证/评论/评分移除、Basic Auth、后台恢复，全部在分支完成。
9. 本地 `npm run build`、`npx tsc --noEmit`、`npm run lint`、`npm test` 全绿。
10. 用本地空库 + 一份 dump 跑 Vitest 集成测试（见 §10）。

### Phase 3：正式切换（冻结窗口）

11. 公告冻结：停每日上传、暂停后台编辑。
12. **最终增量同步**：重新 dump/restore（29 MB，秒级）；再跑一次 verifier。
13. 在 Vercel 设置新 env，部署/提升新版本。
14. 冒烟（见 §9 前 10 项）；**确认 `/admin` 能写库**、`/api/updates` 正常。
15. 解除冻结；跑一次每日 dry-run 确认「待上传 = 0」。
16. 观察 30 分钟：Vercel 函数错误率、pgbouncer 连接数、香港机 `free -m`。

### Phase 4：清理（30 天后）

17. 确认无回滚需求后：删除 Supabase 项目、移除 `@supabase/*` 依赖与残留代码、
    清理 Vercel env、更新 `docs/disaster-recovery.md` 与 `CLAUDE.md`。
18. 删除一次性 Supabase 脚本或改写。

---

## 8. 边界与异常

| 场景 | 行为 |
|---|---|
| 新库 / pgbouncer 不可用 | 公开读回退 COS/打包快照（现有逻辑）；后台写返回明确错误，不静默成功 |
| pgbouncer 连接数打满 | 应用 `connectionTimeoutMillis=5s` 快速失败；错误信息脱敏；监控连接数 |
| Vercel 直连 `*.vercel.app/admin` | 应用层 Basic Auth 返回 401 |
| 浏览器缓存了错误密码 | 返回 401 + 同一 realm，浏览器重新弹窗；文档写明清凭据方法 |
| 上传后图片 404 | 与迁移无关（COS）；保持现有 `reupload-mod-image.mjs` 流程 |
| 评论/评分入口残留 | 详情页、绝区零分区、类型定义全部清除；旧 URL 返回 404 |
| 收藏页 | 只读设备收藏；API `/api/engagement/favorites` 失败时静默降级为空 |
| 旧 Supabase 402 | 切换后不再调用；仅在回滚时使用 psql 直连恢复 |
| 香港机磁盘/内存不足 | Phase 0 检查阈值；不足先升配（2C4G 或加盘）再切 |
| 证书过期 | certbot 续期钩子 reload pgbouncer；续期失败告警 |
| `created_by` | 新上传为 `null`；列与历史数据保留，创作者页不受影响 |

---

## 9. 验收标准（逐条勾选）

### 前台

- [ ] 首页轮播、榜单、下半屏正常，无空白卡片
- [ ] `/mods` 首屏、分页、搜索、角色筛选、排序（default/latest/hot/favorites/rating）与迁移前一致
- [ ] 详情抽屉与独立详情页正常，安装说明完整
- [ ] 角色分类列表与迁移前一致（**不新增任何 character**）
- [ ] `/updates` 每日更新分组正确，`driveLinks` 完整
- [ ] 点赞、收藏、浏览、下载点击正常；收藏页只显示本设备收藏
- [ ] 页面上不存在登录/注册/评论/评分/个人中心入口
- [ ] 无 `sb-*-auth-token` Cookie 产生

### 后台

- [ ] `https://go.sunnyrose.xyz/admin/mods` 无凭据 401，带凭据 200
- [ ] `https://<vercel-deployment>.vercel.app/admin/mods` 无凭据 401
- [ ] 管理列表 5,578 条可见，筛选/分页正常
- [ ] 上传：COS 图片 + OSS ZIP + 写库成功，前台立即可见
- [ ] 编辑、批量上下架、批量推荐、排序、删除正常，缓存立即失效
- [ ] 教程章节/图片/工具/版本 CRUD 正常
- [ ] `/api/cos/sign`、`/api/oss/sign` 未带凭据返回 401

### 数据与脚本

- [ ] 每张表行数与源库一致；`mods` md5 一致
- [ ] `node scripts/upload-daily-by-date.mjs --dry-run`（不带 `--dates`）「待上传 = 0」
- [ ] `node scripts/check-mod-keys.mjs` 全绿（无 ⚠️）
- [ ] 真实上传一天的数据 → 出现在 `/api/updates` 对应分组，缓存已失效
- [ ] `scripts/backup-to-github.mjs` 与新库 cron 备份都能产出 dump
- [ ] 从备份恢复到临时库成功，verifier 通过

### 代码与构建

- [ ] `grep -r "@supabase" src/` 为 0
- [ ] `grep -r "SUPABASE_" src/ .github/ vercel.json` 为 0
- [ ] `npm run lint`、`npx tsc --noEmit`、`npm run build`、`npm test` 全绿
- [ ] CI `Quality Checks` 通过

---

## 10. 测试计划

### 单元测试（Vitest，不连库）

- 现有 `sorting`、`mappers`、`filter-params`、`shard-size`、`mod-cache` 测试必须原样通过。
- 新增 Basic Auth 解析/比较纯函数测试：正确凭据、错误凭据、缺失头、非 Basic 方案、
  密码含冒号/Unicode。
- 新增 SQL 构造辅助函数的快照测试（只测参数化占位符，不连库）。

### 集成测试（CI 可选 job，本地必备）

- 在 CI 起 `postgres:17` service container，跑 `db/schema.sql` + 测试数据。
- 覆盖：`getPublicMods` 分片读取、`getPublicModsPage` 过滤/排序、`getAdminMods` 分页、
  `getFeaturedMods` 排序、教程 CRUD、`view/download` 原子自增。
- 迁移校验脚本对同一份 fixture 跑一遍，断言行数/md5。

### 回归对比（发布前手工）

- 抓生产 4 个接口的 JSON，迁移后 diff（忽略时间字段、随机 id）。
- 首页/列表/详情用 Playwright 或手工截图对比（列表首屏、详情抽屉、角色页）。

### 冒烟（切换窗口内）

- `curl` 检查 200/401/关键字段；后台真实上传一条测试 mod 后删除；
- 每日脚本 dry-run；`/api/revalidate` 返回 200。

---

## 11. 风险与回滚

### 11.1 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 6432 暴露被爆破 | 数据泄露/删库 | TLS + SCRAM + 32 位随机密码 + fail2ban + 最小权限角色；不暴露 5432 |
| 香港机内存不足 | nginx/DB 被 OOM | 切换前检查余量；必要时升配；`shared_buffers=256MB` |
| 切换窗口内写入丢失 | 新内容消失 | 冻结写入 + 最终全量同步 + 切换后核对 `mods` 行数 |
| 连接风暴打满 pgbouncer | 前台 500 | Pool `max=5` + transaction pooling + 连接数监控 |
| SQL 改写引入行为差异 | 排序/筛选错乱 | 不改内存 pipeline，只换取数；回归 diff + 集成测试 |
| 忘记更新某个 Supabase 引用 | 运行时 500 | `grep` 闸门 + 构建期禁止 import（ESLint no-restricted-imports） |
| 备份没跑起来 | 回滚困难 | Phase 0 演练一次恢复；监控备份文件新鲜度（已有 `snapshot-freshness` 思路） |
| 证书过期 | 应用连不上 DB | certbot 续期钩子 + 到期告警 |

### 11.2 回滚

**前提**：旧 Supabase 项目在切换后**保持原样 30 天**，不删、不改。

| 场景 | 操作 | 目标时间 |
|---|---|---|
| 新库读写出错 | Vercel 回滚到上一个部署版本 + 恢复 Supabase env | ≤ 5 分钟 |
| 新库数据损坏 | 停写 → 从最近 dump 恢复 → 重放切换后写入（先导出） | ≤ 30 分钟 |
| 网络/TLS 问题 | 修复 pgbouncer/证书；必要时临时切回 Supabase | ≤ 10 分钟 |
| 后台 Basic Auth 故障 | nginx 回滚配置（`.bak`）或临时只留应用层校验 | 秒级 |

**回滚的数据代价**：切换后写入新库的数据（后台编辑、每日上传）不会自动回到
Supabase。回滚前必须先 `pg_dump` 新库，把差异补回旧库，否则会丢。
文档中要写清这条。

---

## 12. 分期

| 阶段 | 内容 | 产出 | 预估 |
|---|---|---|---|
| P0 | 香港机 PG/pgbouncer/证书/备份；nginx Basic Auth | 可连接的新库、可用的 401 | 0.5–1 天 |
| P1 | `src/lib/db` + 公开读 SQL 化 + 快照兜底 | 前台可在新库跑 | 1–1.5 天 |
| P2 | 后台 actions/tutorial/API 写库 SQL 化 + Basic Auth 守卫 | 后台可用 | 1 天 |
| P3 | 移除登录/评论/评分/个人中心；收藏页收尾 | 功能面清理 | 0.5–1 天 |
| P4 | 迁移脚本 + 校验脚本 + 集成测试 + 预览冒烟 | 可重复的搬迁流程 | 0.5–1 天 |
| P5 | 正式切换 + 观察 | 线上新库 | 1 小时窗口 |
| P6（30 天后） | 删 Supabase、清依赖、改文档 | 收尾 | 0.5 天 |

> 总计约 **4–5 个工作日**（不含 30 天观察期）。

---

## 13. 受影响文件清单

### 13.1 新增

- `src/lib/db/pool.ts`
- `src/lib/db/query.ts`
- `src/lib/db/types.ts`
- `src/lib/admin/basic-auth.ts`
- `db/schema.sql`（由线上 dump 生成并清理后的权威 schema）
- `db/cleanup-supabase-artifacts.sql`
- `scripts/migrate-supabase-to-hk.mjs`
- `scripts/verify-migration.mjs`
- `deploy/hk-db/install.sh`
- `deploy/hk-db/pgbouncer.ini`
- `deploy/hk-db/postgresql.conf.snippet`
- `deploy/hk-db/backup.sh`
- `deploy/hk-db/README.md`
- 测试：`src/lib/admin/basic-auth.test.ts`、`src/lib/db/query.test.ts`、
  `scripts/verify-migration.test.mjs`

### 13.2 修改

- `package.json`（+`pg`，−`@supabase/*`）
- `src/lib/mods-domain/public.ts`、`admin.ts`、`daily.ts`、`creators.ts`、`detail.ts`、`mappers.ts`、`types.ts`
- `src/actions/admin/` 下 6 个文件
- `src/actions/tutorial/tutorial-actions.ts`
- `src/app/api/cos/sign/route.ts`、`src/app/api/oss/sign/route.ts`
- `src/app/api/mods/[id]/view/route.ts`、`src/app/api/mods/[id]/download/route.ts`
- `src/proxy.ts`
- `src/app/admin/layout.tsx`
- `src/app/[game]/favorites/page.tsx`、`src/app/(site)/favorites/page.tsx`
- `src/components/features/mods/favorites/favorites-client.tsx`
- `src/components/features/mods/detail/{mod-detail-drawer,game-mod-detail-content}.tsx`
- `src/components/layout/{site-header-client,site-header,mobile-character-nav,client-providers,layout-style-provider}.tsx`
- `src/components/features/home/{hero-carousel,mobile-home-feed,lazy-lower-home}.tsx`
- `src/components/features/mods/list/{mods-page-client,mods-listing}.tsx`
- `src/app/(site)/updates/updates-grid.tsx`
- `src/app/[game]/mods/[id]/page.tsx`
- `src/lib/mods.ts`
- `src/lib/mod-cache.ts`（仅清理 Supabase 相关注释/类型，如涉及）
- `scripts/backup-to-github.mjs`
- `.github/workflows/backup.yml`、`.github/workflows/quality.yml`
- `deploy/hk-proxy/nginx/wavemod-proxy.conf.template`
- `docs/disaster-recovery.md`
- `CLAUDE.md`（技术栈与目录说明纠正，单独 commit）
- `wrangler.jsonc`（移除 Supabase vars；CF 流水线仍禁用）

### 13.3 删除

- `src/lib/supabase/`（全部）
- `src/lib/engagement/supabase-store.ts`
- `src/types/supabase.ts`
- `src/actions/auth/auth-actions.ts`
- `src/actions/mods/{comment,rating,like,favorite}-actions.ts`
- `src/actions/mods/engagement-actions.ts`（Supabase 版；设备版在 `/api/engagement`）
- `src/actions/user/profile-actions.ts`
- `src/app/auth/`、`src/app/api/auth/`
- `src/app/api/mods/[id]/comments/route.ts`
- `src/components/features/auth/`
- `src/components/features/mods/detail/{comments-panel,comment-form,comment-delete-button}.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-comments-section.tsx`
- `src/app/[game]/profile/`、`src/app/(site)/profile/`
- `src/lib/mods-domain/{favorites,viewer,comments}.ts`
- `src/lib/auth/session-state.ts`
- `supabase/` 下的 SQL 与补丁（迁移完成后归档，不随应用运行）

---

## 14. 实施进度（2026-11-01）

分支约定：

| 分支 | 用途 |
|---|---|
| `main` | 保持现网可发布状态，迁移完成前不动 |
| `rollback/pre-pg-migration` | 迁移前的快照分支（`d9dc0e76`，PRD 提交），随时可回退 |
| `feature/selfhosted-pg` | 迁移实现分支（已通过 CI） |

已完成（代码 + 本地演练）：

- [x] `src/lib/db`（pg Pool + 参数化查询）、公开读/后台/教程全部 SQL 化
- [x] 后台 Basic Auth（nginx 模板 + `src/proxy.ts` 应用层双层）
- [x] 下线登录/个人中心/评论/评分；收藏只走设备号
- [x] 删除 `src/lib/supabase/*`、`@supabase` 运行时引用
- [x] `deploy/hk-db/`（PG17 + pgbouncer + TLS + 备份）
- [x] `scripts/migrate-supabase-to-hk.mjs` + `scripts/verify-migration.mjs`
- [x] 本地演练：16 张表 / `mods` 5578 行 / checksum 与源库一致；公开接口与生产一致
- [x] lint 0 error、tsc 通过、build 通过、589 个测试通过、CI 绿

已在香港机完成：

- [x] 香港机装机：PostgreSQL 17.11 + pgbouncer 1.26.1（TLS/SCRAM），
      `127.0.0.1:5432` + `0.0.0.0:6432`，每日备份 cron
- [x] `db.sunnyrose.xyz` A 记录（Cloudflare，灰云）与 Let's Encrypt 证书
- [x] 6432 外网可达（实测本机与服务器两端均可连）
- [x] 正式迁移：16 张表、`mods` 5578 行、checksum 与源库一致
- [x] 新代码连生产库冒烟：`/api/mods` 5578、`/api/updates` 分组正确、
      `/admin` 带凭据可读、`wavemod_app` 写入/更新/删除（事务回滚）正常
- [x] nginx 已应用 Basic Auth：无凭据 401、带凭据 307（旧应用仍重定向登录）；
      `/api/cos/sign` 无凭据 401；公开页面不受影响

**凭据**：本机 `C:\Users\WINDOWS11\.wavemod-secrets\hk-db.env`（不在仓库内，
含 DB / Basic Auth / postgres 管理员密码）；服务器上为 `/root/hk-db.env`（600）。

已完成切换（2026-11-01 16:00 左右）：

- [x] Vercel Production + Preview 设置 `DATABASE_URL`、`ADMIN_BASIC_AUTH_USER`、
      `ADMIN_BASIC_AUTH_PASSWORD`（通过 Vercel API）
- [x] 合并 `feature/selfhosted-pg` → `main` 并部署（Vercel READY）
- [x] 验收：
  - `/api/mods` → 200、total=5578；`/api/updates` 分组与切换前一致
  - `/admin/mods` 无凭据 401、带凭据 200 且含 5578
  - 直连 `wave-mod.vercel.app/admin/mods` 无凭据 401（应用层 Basic Auth 生效）
  - `/auth/login` → 404（登录入口已移除）
  - **后台编辑保存通过真实鼠标点击验证**：改 description → POST 200 → 库里精确写入 → 再改回并确认
- [x] nginx 缓存已清空（31MB → 0），页面立即切到新应用
- [x] GitHub Secret `DATABASE_URL` 已更新为新库；手动跑通 `Daily Offsite Backup`
      （dump 1139KB、snapshot 5578 条、commit + tag 成功）
- [x] 香港机本地备份 + 恢复演练（5578 行）通过
- [ ] 30 天后删除旧 Supabase（保留期内可回滚）

### 切换后发现并修复的两个问题

1. **pgbouncer 默认跟踪 `search_path` 并下发空值**
   → 经 6432 的 `select ... from mods` 报 `relation "mods" does not exist`。
   修复：`track_extra_parameters = IntervalStyle, extra_float_digits, options`
   （去掉 `search_path`），并把 `scripts/mods-snapshot.sql` 改为 `from public.mods`。
2. **后台「保存修改」真实鼠标点击无反应**
   根因是 `onSubmit` 里在 submit 事件的 Promise 微任务中调用 `requestSubmit()`，
   被浏览器的防递归提交规则忽略。修复：挪到 `setTimeout(..., 0)` 宏任务。
   已在生产用 Playwright 真实点击验证写入与还原。

## 15. 已拍板

1. **Basic Auth 凭据**：已生成 32 位随机密码，用户名 `waveadmin`（见 §14 路径）。
2. **香港机配置**：用户明确**不升 4G**，按 1.9G 运行；PG 已压到 256MB shared_buffers。
3. **DNS 证书**：已用服务器上既有的 Cloudflare Token 创建 `db.sunnyrose.xyz` 并签证书。
4. **`/admin` 入口**：已**隐藏**（公共头部不显示后台链接）。
5. **切换窗口**：已于 2026-11-01 16:00 左右完成；旧 Supabase 保留 30 天。
