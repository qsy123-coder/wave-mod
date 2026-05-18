-- Add ratings support to an existing database.
-- Safe to run multiple times.

alter table public.mods
  add column if not exists rating_count integer not null default 0;

alter table public.mods
  add column if not exists rating_average numeric(3,2) not null default 0;

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null check (score between 1 and 5),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, mod_id)
);

create index if not exists ratings_mod_id_idx on public.ratings (mod_id);
create index if not exists ratings_user_id_idx on public.ratings (user_id);

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute procedure public.set_updated_at();

alter table public.ratings enable row level security;

drop policy if exists "ratings_public_read" on public.ratings;
create policy "ratings_public_read"
  on public.ratings
  for select
  using (true);

drop policy if exists "ratings_insert_own" on public.ratings;
create policy "ratings_insert_own"
  on public.ratings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "ratings_update_own" on public.ratings;
create policy "ratings_update_own"
  on public.ratings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ratings_delete_own_or_admin" on public.ratings;
create policy "ratings_delete_own_or_admin"
  on public.ratings
  for delete
  using (auth.uid() = user_id or public.is_admin());

update public.mods m
set
  rating_count = coalesce(stats.rating_count, 0),
  rating_average = coalesce(stats.rating_average, 0)
from (
  select
    mod_id,
    count(*)::integer as rating_count,
    round(avg(score)::numeric, 2) as rating_average
  from public.ratings
  group by mod_id
) stats
where m.id = stats.mod_id;

update public.mods
set
  rating_count = 0,
  rating_average = 0
where id not in (select mod_id from public.ratings);
