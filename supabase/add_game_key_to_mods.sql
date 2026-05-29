alter table public.mods
  add column if not exists game_key text not null default 'wuthering-waves';

create index if not exists mods_game_key_idx
  on public.mods (game_key);

update public.mods
set game_key = 'wuthering-waves'
where game_key is null;
