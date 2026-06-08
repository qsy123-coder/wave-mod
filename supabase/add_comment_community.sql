  -- Add real comment reactions and threaded replies.
  -- Safe to run multiple times.

  alter table public.comments
    add column if not exists parent_id uuid references public.comments (id) on delete cascade,
    add column if not exists is_pinned boolean not null default false;

  create table if not exists public.comment_reactions (
    id uuid primary key default gen_random_uuid(),
    comment_id uuid not null references public.comments (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    value smallint not null check (value in (-1, 1)),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (comment_id, user_id)
  );

  create index if not exists comments_parent_id_idx on public.comments (parent_id);
  create index if not exists comment_reactions_comment_id_idx on public.comment_reactions (comment_id);
  create index if not exists comment_reactions_user_id_idx on public.comment_reactions (user_id);
  create index if not exists comment_reactions_value_idx on public.comment_reactions (value);

  alter table public.comment_reactions enable row level security;

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

  drop trigger if exists comment_reactions_set_updated_at on public.comment_reactions;
  create trigger comment_reactions_set_updated_at
    before update on public.comment_reactions
    for each row execute procedure public.set_updated_at();
