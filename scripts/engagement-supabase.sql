-- ============================================================================
-- 互动计数改存 Postgres（替代 COS 分片）
-- ============================================================================
-- 背景：2026-10-19 实测 Vercel 函数到广州 COS 的 TCP 连接不通（40s ETIMEDOUT），
-- 互动计数读写全部失效，`/api/engagement` 41 秒才返回。改为存 Supabase Postgres：
-- Vercel → Supabase（首尔）实测 0.94s 可用，且这里每次只读写几行，出口流量可忽略。
--
-- 模型与旧的 store-core 保持一致：
--   计数 = 基线（data/engagement-baseline.json，随代码部署）+ 增量（本表）
--   点赞/收藏：同一设备重复触发 = 抵消（toggle）
--   浏览：同一设备同一天只算一次（last_view_day 记在设备行上，不需要保留历史）
--   下载：同一设备同一天只算一次（last_download_day，2026-10-22 起；此前是每次点击都 +1）
--
-- 执行方式（会改库，先确认）：
--   node scripts/run-engagement-sql.mjs --dry-run
--   node scripts/run-engagement-sql.mjs --apply
--
-- 幂等：全部 create ... if not exists / create or replace。
-- ============================================================================

create table if not exists public.engagement_totals (
  mod_id      text primary key,
  views       bigint      not null default 0,
  likes       bigint      not null default 0,
  favorites   bigint      not null default 0,
  updated_at  timestamptz not null default now(),
  constraint engagement_totals_non_negative
    check (views >= 0 and likes >= 0 and favorites >= 0)
);

-- 2026-10-20：下载也走「基线 + 增量」。表是早先建的，create table if not exists
-- 不会补列，所以这里必须显式 alter（幂等）。
alter table public.engagement_totals
  add column if not exists downloads bigint not null default 0;

create table if not exists public.engagement_devices (
  mod_id        text        not null,
  device_id     text        not null,
  liked         boolean     not null default false,
  favorited     boolean     not null default false,
  favorited_at  timestamptz,
  last_view_day date,
  last_download_day date,
  updated_at    timestamptz not null default now(),
  primary key (mod_id, device_id)
);

-- 2026-10-22：下载改为「同设备同一天只算一次」。表是早先建的，create table if not exists
-- 不会补列，所以这里必须显式 alter（幂等）。
alter table public.engagement_devices
  add column if not exists last_download_day date;

-- 「我的收藏」只看某个设备收藏了哪些，走这个部分索引
create index if not exists engagement_devices_favorited_idx
  on public.engagement_devices (device_id, favorited_at desc)
  where favorited;

-- 只有 service_role 能访问：表数据是匿名设备级状态，绝不能给 anon 直接读
alter table public.engagement_totals  enable row level security;
alter table public.engagement_devices enable row level security;

revoke all on table public.engagement_totals  from anon, authenticated;
revoke all on table public.engagement_devices from anon, authenticated;
grant all on table public.engagement_totals  to service_role;
grant all on table public.engagement_devices to service_role;

-- ----------------------------------------------------------------------------
-- 原子写入：点赞 / 取消 / 收藏 / 取消收藏 / 浏览
-- ----------------------------------------------------------------------------
-- 为什么必须在数据库里做：读-改-写放在应用层会丢更新（这正是 COS 分片方案的
-- 已知缺陷）。这里用「先插设备行、再 SELECT ... FOR UPDATE」把同一
-- (mod_id, device_id) 的并发请求串行化，计数只按实际状态变化增减。
create or replace function public.engagement_apply(
  p_mod_id    text,
  p_action    text,
  p_device_id text,
  p_day       date
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_liked           boolean;
  v_favorited       boolean;
  v_last_view_day   date;
  v_last_download_day date;
  v_delta_likes     integer := 0;
  v_delta_favorites integer := 0;
  v_delta_views     integer := 0;
  v_delta_downloads integer := 0;
  v_total_likes     bigint;
  v_total_favorites bigint;
  v_total_views     bigint;
  v_total_downloads bigint;
begin
  if p_device_id is null or length(p_device_id) = 0 then
    raise exception 'device_id required' using errcode = '22023';
  end if;

  -- 行不存在时先插入，保证下面的 SELECT ... FOR UPDATE 一定能锁住一行；
  -- 并发首次写入时，晚到的一方会卡在这里等锁，不会两条 INSERT 都成功。
  insert into public.engagement_devices (mod_id, device_id)
  values (p_mod_id, p_device_id)
  on conflict (mod_id, device_id) do nothing;

  select liked, favorited, last_view_day, last_download_day
    into v_liked, v_favorited, v_last_view_day, v_last_download_day
    from public.engagement_devices
   where mod_id = p_mod_id and device_id = p_device_id
   for update;

  if p_action = 'like' then
    if v_liked then
      v_liked := false;
      v_delta_likes := -1;
    else
      v_liked := true;
      v_delta_likes := 1;
    end if;

  elsif p_action = 'unlike' then
    if v_liked then
      v_liked := false;
      v_delta_likes := -1;
    end if;

  elsif p_action = 'favorite' then
    if v_favorited then
      v_favorited := false;
      v_delta_favorites := -1;
    else
      v_favorited := true;
      v_delta_favorites := 1;
    end if;

  elsif p_action = 'unfavorite' then
    if v_favorited then
      v_favorited := false;
      v_delta_favorites := -1;
    end if;

  elsif p_action = 'view' then
    -- 「今天看过」才计数；设备行的 last_view_day 就是去重键
    if v_last_view_day is distinct from p_day then
      v_delta_views := 1;
    end if;

  elsif p_action = 'download' then
    -- 与浏览同一套规则：同一设备同一天只算一次（2026-10-22 用户要求）。
    -- 连点多下、夸克迅雷各点一次，当天都只 +1；隔天再下载算新的一次。
    -- 不去重的话一个人一分钟就能刷出几十次下载，下载量就失去意义了。
    if v_last_download_day is distinct from p_day then
      v_delta_downloads := 1;
    end if;
  end if;

  update public.engagement_devices
     set liked         = v_liked,
         favorited     = v_favorited,
         favorited_at  = case
                           when v_favorited then coalesce(favorited_at, now())
                           else null
                         end,
         last_view_day = case
                           when p_action = 'view' then p_day
                           else last_view_day
                         end,
         last_download_day = case
                           when p_action = 'download' then p_day
                           else last_download_day
                         end,
         updated_at    = now()
   where mod_id = p_mod_id and device_id = p_device_id;

  insert into public.engagement_totals (mod_id, likes, favorites, views, downloads)
  values (
    p_mod_id,
    greatest(v_delta_likes, 0),
    greatest(v_delta_favorites, 0),
    v_delta_views,
    v_delta_downloads
  )
  on conflict (mod_id) do update
     set likes      = greatest(0, public.engagement_totals.likes + v_delta_likes),
         favorites  = greatest(0, public.engagement_totals.favorites + v_delta_favorites),
         views      = public.engagement_totals.views + v_delta_views,
         downloads  = public.engagement_totals.downloads + v_delta_downloads,
         updated_at = now();

  select likes, favorites, views, downloads
    into v_total_likes, v_total_favorites, v_total_views, v_total_downloads
    from public.engagement_totals
   where mod_id = p_mod_id;

  return jsonb_build_object(
    'likes',     coalesce(v_total_likes, 0),
    'favorites', coalesce(v_total_favorites, 0),
    'views',     coalesce(v_total_views, 0),
    'downloads', coalesce(v_total_downloads, 0),
    'liked',     v_liked,
    'favorited', v_favorited
  );
end;
$$;

-- 匿名端只该走 /api/engagement（那里有设备号校验和爬虫过滤），
-- 不能让 anon 直接拿 REST 调 RPC 刷计数
revoke all on function public.engagement_apply(text, text, text, date) from public;
revoke all on function public.engagement_apply(text, text, text, date) from anon, authenticated;
grant execute on function public.engagement_apply(text, text, text, date) to service_role;

-- ----------------------------------------------------------------------------
-- 批量读：一次查询拿回 ids 的增量 + 当前设备的点赞/收藏状态
-- ----------------------------------------------------------------------------
-- 为什么不直接用 REST 的 `.in("mod_id", ids)`：
--   `sort=hot` 要给整表（约 5300 条）算热度，拼成 URL 会超过 PostgREST/网关的
--   请求行上限。这里把 id 放进 **请求体**（RPC 的 text[] 参数），一次往返拿完。
create or replace function public.engagement_read(
  p_ids       text[],
  p_device_id text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return jsonb_build_object(
    'counts', coalesce(
      (
        select jsonb_object_agg(
                 mod_id,
                 jsonb_build_object('likes', likes, 'favorites', favorites, 'views', views, 'downloads', downloads)
               )
          from public.engagement_totals
         where mod_id = any (p_ids)
      ),
      '{}'::jsonb
    ),
    'mine', coalesce(
      (
        select jsonb_object_agg(
                 mod_id,
                 jsonb_build_object('liked', liked, 'favorited', favorited)
               )
          from public.engagement_devices
         where device_id = p_device_id
           and mod_id = any (p_ids)
           -- 没赞也没收藏的设备行不返回，payload 能小一个数量级
           and (liked or favorited)
      ),
      '{}'::jsonb
    )
  );
end;
$$;

revoke all on function public.engagement_read(text[], text) from public;
revoke all on function public.engagement_read(text[], text) from anon, authenticated;
grant execute on function public.engagement_read(text[], text) to service_role;

-- PostgREST 刚建的表/函数要重载 schema 才能立即被 REST 看到
notify pgrst, 'reload schema';

select json_build_object(
  'ok', true,
  'totals_table', to_regclass('public.engagement_totals') is not null,
  'devices_table', to_regclass('public.engagement_devices') is not null,
  'rpc_apply', exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'engagement_apply'
  ),
  'rpc_read', exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'engagement_read'
  )
)::text;
