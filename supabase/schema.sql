create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  phone text unique,
  role text not null default 'user' check (role in ('user', 'admin', 'vip')),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  character text not null,
  version text not null,
  game_version text not null,
  description text not null,
  images text[] not null default '{}',
  video_url text,
  download_url text not null,
  tags text[] not null default '{}',
  nsfw boolean not null default false,
  mod_author_url text,
  xxmi_install_guide text not null,
  views integer not null default 0,
  favorites_count integer not null default 0,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  rating_count integer not null default 0,
  rating_average numeric(3,2) not null default 0,
  is_published boolean not null default true,
  is_available boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mod_id uuid not null references public.mods (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, mod_id)
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, mod_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  is_pinned boolean not null default false,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (comment_id, user_id)
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null check (score between 1 and 5),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, mod_id)
);

create index if not exists mods_character_idx on public.mods (character);
create index if not exists mods_created_at_idx on public.mods (created_at desc);
create index if not exists mods_is_published_idx on public.mods (is_published);
create index if not exists favorites_user_id_idx on public.favorites (user_id);
create index if not exists favorites_mod_id_idx on public.favorites (mod_id);
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists likes_mod_id_idx on public.likes (mod_id);
create index if not exists comments_mod_id_idx on public.comments (mod_id);
create index if not exists comments_parent_id_idx on public.comments (parent_id);
create index if not exists comment_reactions_comment_id_idx on public.comment_reactions (comment_id);
create index if not exists comment_reactions_user_id_idx on public.comment_reactions (user_id);
create index if not exists comment_reactions_value_idx on public.comment_reactions (value);
create index if not exists ratings_mod_id_idx on public.ratings (mod_id);
create index if not exists ratings_user_id_idx on public.ratings (user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, role)
  values (
    new.id,
    new.email,
    new.phone,
    case
      when lower(coalesce(new.email, '')) = lower(coalesce(current_setting('app.admin_email', true), '')) then 'admin'
      else 'user'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists mods_set_updated_at on public.mods;
create trigger mods_set_updated_at
  before update on public.mods
  for each row execute procedure public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute procedure public.set_updated_at();

drop trigger if exists comment_reactions_set_updated_at on public.comment_reactions;
create trigger comment_reactions_set_updated_at
  before update on public.comment_reactions
  for each row execute procedure public.set_updated_at();

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.mods enable row level security;
alter table public.favorites enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
  on public.profiles
  for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "mods_public_read" on public.mods;
create policy "mods_public_read"
  on public.mods
  for select
  using (is_published = true);

drop policy if exists "mods_admin_all" on public.mods;
create policy "mods_admin_all"
  on public.mods
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
  on public.favorites
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
  on public.favorites
  for delete
  using (auth.uid() = user_id);

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

drop policy if exists "comments_public_read" on public.comments;
create policy "comments_public_read"
  on public.comments
  for select
  using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own"
  on public.comments
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "comments_update_own_or_admin" on public.comments;
create policy "comments_update_own_or_admin"
  on public.comments
  for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "comments_delete_own_or_admin" on public.comments;
create policy "comments_delete_own_or_admin"
  on public.comments
  for delete
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "comment_reactions_public_read" on public.comment_reactions;
create policy "comment_reactions_public_read"
  on public.comment_reactions
  for select
  using (true);

drop policy if exists "comment_reactions_insert_own" on public.comment_reactions;
create policy "comment_reactions_insert_own"
  on public.comment_reactions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "comment_reactions_update_own" on public.comment_reactions;
create policy "comment_reactions_update_own"
  on public.comment_reactions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "comment_reactions_delete_own" on public.comment_reactions;
create policy "comment_reactions_delete_own"
  on public.comment_reactions
  for delete
  using (auth.uid() = user_id);

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
