alter table public.profiles
  add column if not exists phone text unique;

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

update public.profiles p
set phone = u.phone
from auth.users u
where p.id = u.id
  and u.phone is not null
  and coalesce(p.phone, '') <> u.phone;
