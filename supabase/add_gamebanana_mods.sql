-- GameBanana 搬运 MOD 的**独立表**（主理人 2026-09-28 决定：不并进 mods）。
--
-- 为什么不并进 public.mods：
--   1. `mods` 的模型是「国内网盘 + drive_links 数组」，GameBanana 是「单一外链跳转」，
--      语义对不上（download_url 在 mods 里是 NOT NULL 且被 ingest 脚本写成 null，本就在还债）；
--   2. `mods.character` 参与了每日上传脚本的去重键 `character|title`，往里灌 GameBanana 数据
--      会让那条已经很脆的链路出问题；
--   3. 前台 `/mods` 的查询、快照、备份链路一行都不用动。
--
-- 数据来源：GameBanana API v11，game id 20357（Wuthering Waves），405 页 Subfeed 全量普查
-- 得 3057 条可入库 Mod。字段口径见 docs/gamebanana-integration-prd.md。
--
-- ⚠️ 两张表的 character 都受同一条硬规则约束：值必须 ∈ `characterImageMap`（64 个 key）。
--    归一化由 scripts/gamebanana-classify.mjs 负责，它在模块层断言越界即抛错。

create table if not exists public.gamebanana_mods (
  -- `_idRow` 是 GameBanana 的稳定主键，直接拿来当主键：重跑同步天然幂等，
  -- 不需要另造 uuid，也不会因为标题改名而插出重复行。
  gb_id           integer primary key,

  title           text not null,              -- `_sName` 原文，不改写（来源是英文社区，保留原样便于回查）
  character       text not null,              -- 归一化后的站内角色，由 classify() 产出

  -- 保留 GameBanana 的原始分类：分类规则将来要改时，能拿这两个字段**离线重跑**，
  -- 不必重新爬一遍 API。
  gb_root_category text,
  gb_subcategory   text,

  description     text,
  images          text[] not null default '{}',   -- 预览图 URL，见下方「图片热链」说明
  cover_url       text,                            -- 列表/详情首图（800 变体）

  -- 取的是 **`_aFiles[0]._sDownloadUrl`**（形如 https://gamebanana.com/dl/1828295），
  -- 它会 302 到 filecache4X.gamebanana.com 的真文件。
  -- ⚠️ 有两个同名陷阱，实测踩过（2026-09-28）：
  --   1. mod 级的 `_sDownloadUrl` 返回的是 `/mods/download/{id}`，跟随重定向后是
  --      HTTP 200 + text/html 的 22KB 中转页，**不是文件**；
  --   2. 该中转页地址也**不能由 gb_id 构造** —— 对不用它的 mod 同样只回 HTML。
  -- 拿不到可用文件时（墓碑记录）本列退到 `_sProfileUrl`，见下方墓碑说明。
  download_url    text not null,
  author_name     text,
  author_url      text,
  version         text,

  -- GameBanana **自己**的三级可见性分级，直接采信，不自己猜 NSFW：
  --   show → 正常；warn → 需提示（去遮挡/暴露向）；hide → NSFW，前台需年龄门禁。
  -- 实测交叉验证（2026-09-28，全库 3057 条）：
  --   标题含 nude/全裸/lewd/nsfw 的 147 条中 144 条(98%)为 hide；
  --   明确功能类工具 19 条中 15 条(79%)为 show；
  --   反例各只有 1 条（`Aumento de FPS` 落 hide、`Chise evening dress` 落 show）。
  -- ⚠️ **不要用 `_bHasContentRatings` 当 NSFW 信号** —— 它太宽，
  --    101 条泳装/比基尼里 77 条为 true，按它标会把半数库错标成成人内容。
  visibility      text not null default 'show' check (visibility in ('show', 'warn', 'hide')),

  like_count      integer not null default 0,
  view_count      integer not null default 0,
  download_count  integer not null default 0,
  file_size       bigint,
  -- `_aFiles[]._sAvResult`：GameBanana 侧的文件扫描结果（实测样例为 "clean"）。
  -- 外链下载最缺的就是「这文件安不安全」，把平台自己的结论透出去比自己写免责声明有用。
  av_status       text,

  -- ⚠️ 墓碑记录不建列、在同步脚本侧就滤掉：GameBanana 删掉文件本体后会**留一条记录**，
  --    文件名变成 `the_file_has_been_deleted_with_only_a_record_retained.7z`（257 字节）。
  --    识别它只能靠文件名/说明文本 + 「小于 1KB」兜底 —— `_bHasContents` 在墓碑上**仍是 true**、
  --    `_bIsArchived` 也是 false，两个直觉字段都不管用。实测 300 条里命中 12 条 (4%)。

  gb_created_at   timestamptz,                -- `_tsDateAdded`（unix 秒）
  gb_updated_at   timestamptz,                -- `_tsDateModified`
  synced_at       timestamptz not null default timezone('utc', now()),

  is_published    boolean not null default true,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

-- 排序与筛选路径：按角色筛、按热度/时间排。三列都是前台真的会用的，不建多余的。
create index if not exists gamebanana_mods_character_idx on public.gamebanana_mods (character);
create index if not exists gamebanana_mods_like_count_idx on public.gamebanana_mods (like_count desc);
create index if not exists gamebanana_mods_gb_created_at_idx on public.gamebanana_mods (gb_created_at desc);

drop trigger if exists gamebanana_mods_set_updated_at on public.gamebanana_mods;
create trigger gamebanana_mods_set_updated_at
  before update on public.gamebanana_mods
  for each row execute procedure public.set_updated_at();

alter table public.gamebanana_mods enable row level security;

-- 与 mods_public_read 同形：匿名只读已发布的行。写入只走 service_role / 直连脚本，
-- 两者都不受 RLS 约束，所以**不建** insert/update 策略 —— 少一条策略就少一个越权面。
drop policy if exists "gamebanana_mods_public_read" on public.gamebanana_mods;
create policy "gamebanana_mods_public_read"
  on public.gamebanana_mods
  for select
  using (is_published = true);

drop policy if exists "gamebanana_mods_admin_all" on public.gamebanana_mods;
create policy "gamebanana_mods_admin_all"
  on public.gamebanana_mods
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- 显式授权（幂等）：Supabase 的 default privileges 只在表 CREATE 那一刻生效，
-- 若本文件被别的角色执行或表已存在，默认权限不会重放。
grant select on public.gamebanana_mods to anon, authenticated, service_role;

-- 不重载 PostgREST 的 schema 缓存，/rest/v1/gamebanana_mods 会一直是 404。
-- 必须经 5432 session 模式执行（6543 transaction 模式不保证 NOTIFY 送达）。
notify pgrst, 'reload schema';

-- ── 图片热链说明（2026-09-28 实测后决定）────────────────────────────────
-- `images` / `cover_url` 存的是 **images.gamebanana.com 的 URL**，不镜像到 COS。
-- 实测本机取 530 变体 36KB / 340~680ms、800 变体 71KB / 1.6s，通且快
-- （本机校园网到 COS 反而有 25-55% 丢包），且这些变体是 GameBanana 已经压好的尺寸，
-- 我们既不用存也不用转码，省下的是整个 COS 链路。
-- 代价：依赖对方 CDN 可用性，且对方删文件时我们会 404。
-- **可逆**：URL 只是列里的值，将来若国内访问变差，加一趟镜像脚本改写这两列即可，不用改表结构。
