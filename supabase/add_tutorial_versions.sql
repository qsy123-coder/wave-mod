-- ============================================================
-- Tutorial Version Switch — Database Schema
-- ============================================================
-- 把教程从「单发布版（published/draft 文本 id）」升级为「多版本并存」。
-- 新增 tutorial_versions 表存版本元数据；tutorial_configs 改为
--   id = '{versionKey}:{status}'（text 主键，既有 FK 的 types 不变，
--   避免重写 chapters/images/tools 的 uuid 级联）+ version_id + status 真列。
-- 公开侧只能读 is_visible=true 且 status='published' 的数据。
--
-- 迁移策略（幂等）：
--  1) 新建 tutorial_versions，插入默认版本 'default'（is_default=true, is_visible=true）
--  2) 把既有 published/draft 两行 config 归属到 'default' 版本，id 改为 'default:published'/'default:draft'
--  3) chapters 的 config_id 同步改写
--  4) 重写 5 张表的 RLS（tutorial_versions + 4 张既有表）
-- ============================================================

-- ── 1. tutorial_versions: 版本元数据 ──
create table if not exists public.tutorial_versions (
  id text primary key,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop index if exists tutorial_versions_sort_idx;
create index tutorial_versions_sort_idx on public.tutorial_versions (sort_order);

drop trigger if exists tutorial_versions_set_updated_at on public.tutorial_versions;
create trigger tutorial_versions_set_updated_at
  before update on public.tutorial_versions
  for each row execute procedure public.set_updated_at();

-- ── 2. 插入默认版本（幂等）──
insert into public.tutorial_versions (id, name, sort_order, is_visible, is_default)
values ('default', '默认版本', 0, true, true)
on conflict (id) do nothing;

-- ── 3. 给 tutorial_configs 加 version_id / status 列（幂等）──
alter table public.tutorial_configs add column if not exists version_id text;
alter table public.tutorial_configs add column if not exists status text;

-- ── 4. 去掉 id 的 'published'/'draft' 检查约束（用 version_id + status 真列替代）──
alter table public.tutorial_configs drop constraint if exists tutorial_configs_id_check;

-- ── 5. 迁移既有数据：published/draft → default 版本 ──
--    不能在子表仍引用时改父表主键（FK violation）。改为事务化三步：
--    1) INSERT 新的 default:{status} 行（保留旧行）
--    2) UPDATE tutorial_chapters.config_id 指向新 id
--    3) DELETE 旧的 published/draft 行（此时已无子表引用）
do $$
declare
  v_published_id text := 'default:published';
  v_draft_id text := 'default:draft';
  v_cfg record;
begin
  -- 1) 为每个旧 config 插入 default:{status} 新行（幂等：仅当目标 id 尚不存在）
  for v_cfg in
    select id, title, subtitle, image_base_path, updated_at
    from public.tutorial_configs
    where id in ('published', 'draft')
      and version_id is null
  loop
    if not exists (
      select 1 from public.tutorial_configs where id = 'default:' || v_cfg.id
    ) then
      insert into public.tutorial_configs
        (id, version_id, status, title, subtitle, image_base_path, updated_at)
      values
        ('default:' || v_cfg.id, 'default', v_cfg.id,
         v_cfg.title, v_cfg.subtitle, v_cfg.image_base_path, v_cfg.updated_at);
    end if;
  end loop;

  -- 2) 把 chapters.config_id 从旧文本 id 改到新的 default:{id}
  update public.tutorial_chapters
    set config_id = 'default:' || config_id
   where config_id in ('published', 'draft');

  -- 3) 删除旧的 config 行（此时子表已指向新 id，无引用）
  delete from public.tutorial_configs
   where id in ('published', 'draft');
end $$;

-- ── 6. 新列定义 + 约束（幂等：先清空可能存在的旧约束再重建）──
alter table public.tutorial_configs
  alter column version_id set not null,
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tutorial_configs_version_id_fkey' and conrelid = 'public.tutorial_configs'::regclass
  ) then
    alter table public.tutorial_configs
      add constraint tutorial_configs_version_id_fkey
      foreign key (version_id) references public.tutorial_versions (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tutorial_configs_status_check' and conrelid = 'public.tutorial_configs'::regclass
  ) then
    alter table public.tutorial_configs
      add constraint tutorial_configs_status_check
      check (status in ('published', 'draft'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tutorial_configs_version_status_unique' and conrelid = 'public.tutorial_configs'::regclass
  ) then
    alter table public.tutorial_configs
      add constraint tutorial_configs_version_status_unique
      unique (version_id, status);
  end if;
end $$;

-- ============================================================
-- RLS
-- ============================================================

-- ── tutorial_versions: 公开只读可见版本；管理员全量 ──
alter table public.tutorial_versions enable row level security;

drop policy if exists "tutorial_versions_public_read" on public.tutorial_versions;
create policy "tutorial_versions_public_read"
  on public.tutorial_versions
  for select
  using (is_visible or public.is_admin());

drop policy if exists "tutorial_versions_admin_write" on public.tutorial_versions;
create policy "tutorial_versions_admin_write"
  on public.tutorial_versions
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── tutorial_configs: 公开只能读「可见版本 + published」；管理员全量 ──
drop policy if exists "tutorial_configs_public_read_v2" on public.tutorial_configs;
create policy "tutorial_configs_public_read_v2"
  on public.tutorial_configs
  for select
  using (
    status = 'published'
    and exists (
      select 1 from public.tutorial_versions v
      where v.id = public.tutorial_configs.version_id
        and v.is_visible = true
    )
    or public.is_admin()
  );

drop policy if exists "tutorial_configs_public_read" on public.tutorial_configs;
drop policy if exists "tutorial_configs_admin_write" on public.tutorial_configs;
create policy "tutorial_configs_admin_write"
  on public.tutorial_configs
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── tutorial_chapters: 公开只能读「可见版本 + published + 当前章节」；管理员全量 ──
drop policy if exists "tutorial_chapters_public_read" on public.tutorial_chapters;
create policy "tutorial_chapters_public_read"
  on public.tutorial_chapters
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.tutorial_configs c
      join public.tutorial_versions v on v.id = c.version_id
      where c.id = public.tutorial_chapters.config_id
        and c.status = 'published'
        and v.is_visible = true
    )
  );

drop policy if exists "tutorial_chapters_admin_write" on public.tutorial_chapters;
create policy "tutorial_chapters_admin_write"
  on public.tutorial_chapters
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── tutorial_images: cascade join 到 config → version ──
drop policy if exists "tutorial_images_public_read" on public.tutorial_images;
create policy "tutorial_images_public_read"
  on public.tutorial_images
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.tutorial_chapters ch
      join public.tutorial_configs c on c.id = ch.config_id
      join public.tutorial_versions v on v.id = c.version_id
      where ch.id = public.tutorial_images.chapter_id
        and c.status = 'published'
        and v.is_visible = true
    )
  );

drop policy if exists "tutorial_images_admin_write" on public.tutorial_images;
create policy "tutorial_images_admin_write"
  on public.tutorial_images
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── tutorial_tools: cascade join 到 config → version ──
drop policy if exists "tutorial_tools_public_read" on public.tutorial_tools;
create policy "tutorial_tools_public_read"
  on public.tutorial_tools
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.tutorial_chapters ch
      join public.tutorial_configs c on c.id = ch.config_id
      join public.tutorial_versions v on v.id = c.version_id
      where ch.id = public.tutorial_tools.chapter_id
        and c.status = 'published'
        and v.is_visible = true
    )
  );

drop policy if exists "tutorial_tools_admin_write" on public.tutorial_tools;
create policy "tutorial_tools_admin_write"
  on public.tutorial_tools
  for all
  using (public.is_admin())
  with check (public.is_admin());
