-- Backfill existing auth users into public.profiles
-- Safe to run multiple times.

insert into public.profiles (id, email, role, display_name, avatar_url)
select
  u.id,
  lower(u.email),
  case
    when lower(coalesce(u.email, '')) = lower(coalesce(current_setting('app.admin_email', true), '')) then 'admin'
    else 'user'
  end as role,
  coalesce(
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'full_name',
    split_part(lower(coalesce(u.email, 'user')), '@', 1)
  ) as display_name,
  u.raw_user_meta_data ->> 'avatar_url' as avatar_url
from auth.users u
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  display_name = coalesce(excluded.display_name, public.profiles.display_name),
  avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
  updated_at = timezone('utc', now());

-- Backfill aggregate rating fields on mods after ratings table is available.
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
