alter table public.mods
  add column if not exists downloads_count integer not null default 0;

create index if not exists mods_downloads_count_idx on public.mods (downloads_count desc);
