-- ============================================================
-- Tutorial Management System — Database Schema
-- ============================================================
-- Tables: tutorial_configs, tutorial_chapters, tutorial_images, tutorial_tools
-- RLS: Public can read published data; admin has full CRUD
-- ============================================================

-- ── tutorial_configs: top-level tutorial configuration ──
create table if not exists public.tutorial_configs (
  id text primary key check (id in ('published', 'draft')),
  title text not null,
  subtitle text not null,
  image_base_path text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

-- ── tutorial_chapters: individual chapters within a config ──
create table if not exists public.tutorial_chapters (
  id uuid primary key default gen_random_uuid(),
  config_id text not null references public.tutorial_configs (id) on delete cascade,
  sort_order integer not null default 0,
  chapter_key text not null,
  title text not null,
  type text not null check (type in ('text', 'images')),
  intro text,
  video_src text,
  video_poster text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ── tutorial_images: step images for image-type chapters ──
create table if not exists public.tutorial_images (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.tutorial_chapters (id) on delete cascade,
  sort_order integer not null default 0,
  url text not null,
  filename text not null,
  alt text,
  created_at timestamptz not null default timezone('utc', now())
);

-- ── tutorial_tools: tool download entries for text-type chapters ──
create table if not exists public.tutorial_tools (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.tutorial_chapters (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null,
  url text not null,
  description text,
  required boolean not null default false,
  cloud_baidu text,
  cloud_quark text,
  created_at timestamptz not null default timezone('utc', now())
);

-- ── Indexes ──
create index if not exists tutorial_chapters_config_idx on public.tutorial_chapters (config_id, sort_order);
create index if not exists tutorial_images_chapter_idx on public.tutorial_images (chapter_id, sort_order);
create index if not exists tutorial_tools_chapter_idx on public.tutorial_tools (chapter_id, sort_order);

-- ── updated_at triggers ──
drop trigger if exists tutorial_configs_set_updated_at on public.tutorial_configs;
create trigger tutorial_configs_set_updated_at
  before update on public.tutorial_configs
  for each row execute procedure public.set_updated_at();

drop trigger if exists tutorial_chapters_set_updated_at on public.tutorial_chapters;
create trigger tutorial_chapters_set_updated_at
  before update on public.tutorial_chapters
  for each row execute procedure public.set_updated_at();

-- ── Enable RLS ──
alter table public.tutorial_configs enable row level security;
alter table public.tutorial_chapters enable row level security;
alter table public.tutorial_images enable row level security;
alter table public.tutorial_tools enable row level security;

-- ── RLS: tutorial_configs ──
drop policy if exists "tutorial_configs_public_read" on public.tutorial_configs;
create policy "tutorial_configs_public_read"
  on public.tutorial_configs
  for select
  using (id = 'published' or public.is_admin());

drop policy if exists "tutorial_configs_admin_write" on public.tutorial_configs;
create policy "tutorial_configs_admin_write"
  on public.tutorial_configs
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── RLS: tutorial_chapters ──
drop policy if exists "tutorial_chapters_public_read" on public.tutorial_chapters;
create policy "tutorial_chapters_public_read"
  on public.tutorial_chapters
  for select
  using (config_id = 'published' or public.is_admin());

drop policy if exists "tutorial_chapters_admin_write" on public.tutorial_chapters;
create policy "tutorial_chapters_admin_write"
  on public.tutorial_chapters
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── RLS: tutorial_images ──
drop policy if exists "tutorial_images_public_read" on public.tutorial_images;
create policy "tutorial_images_public_read"
  on public.tutorial_images
  for select
  using (
    exists (
      select 1 from public.tutorial_chapters
      where id = public.tutorial_images.chapter_id
        and (config_id = 'published' or public.is_admin())
    )
  );

drop policy if exists "tutorial_images_admin_write" on public.tutorial_images;
create policy "tutorial_images_admin_write"
  on public.tutorial_images
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── RLS: tutorial_tools ──
drop policy if exists "tutorial_tools_public_read" on public.tutorial_tools;
create policy "tutorial_tools_public_read"
  on public.tutorial_tools
  for select
  using (
    exists (
      select 1 from public.tutorial_chapters
      where id = public.tutorial_tools.chapter_id
        and (config_id = 'published' or public.is_admin())
    )
  );

drop policy if exists "tutorial_tools_admin_write" on public.tutorial_tools;
create policy "tutorial_tools_admin_write"
  on public.tutorial_tools
  for all
  using (public.is_admin())
  with check (public.is_admin());
