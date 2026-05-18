-- Add likes support to an existing database.
-- Safe to run multiple times.

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, mod_id)
);

create index if not exists likes_mod_id_idx on public.likes (mod_id);
create index if not exists likes_user_id_idx on public.likes (user_id);

alter table public.likes enable row level security;

drop policy if exists "likes_public_read" on public.likes;
create policy "likes_public_read"
  on public.likes
  for select
  using (true);

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own"
  on public.likes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own"
  on public.likes
  for delete
  using (auth.uid() = user_id);

update public.mods m
set likes_count = coalesce(stats.likes_count, 0)
from (
  select mod_id, count(*)::integer as likes_count
  from public.likes
  group by mod_id
) stats
where m.id = stats.mod_id;

update public.mods
set likes_count = 0
where id not in (select mod_id from public.likes);
