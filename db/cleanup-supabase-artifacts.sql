-- ============================================================================
-- 自建库清理：去掉从 Supabase dump 带过来的托管平台专属对象
-- ============================================================================
-- 用法（在新库 restore 完成之后执行一次）：
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/cleanup-supabase-artifacts.sql
--
-- 保留的东西：
--   - public 下所有业务表与数据（含 profiles/favorites/likes/comments/ratings 存档）
--   - set_updated_at() 与各表的 updated_at 触发器
--   - mod_character_counts 视图、所有索引、public 内外的业务外键
--
-- 去掉的东西：
--   - RLS 与全部 policy（自建库只有一个应用角色，没有 anon/authenticated 之分）
--   - auth.users 外键、auth.users 上的触发器、is_admin()/handle_new_user()
--   - 授予 anon/authenticated/service_role 的权限
-- ============================================================================

-- 1. 关闭 public 下所有表的 RLS
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I disable row level security', t);
  end loop;
end
$$;

-- 2. 删除 public 下所有 policy
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;

-- 3. auth.users 相关对象（profiles 数据保留，外键去掉）
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'profiles_id_fkey'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_id_fkey;
  end if;
end
$$;

-- 4. 撤销托管平台的三个内置角色（如果 dump 里带上了授权）
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all tables in schema public from %I', role_name);
      execute format('revoke all on all sequences in schema public from %I', role_name);
      execute format('revoke all on all functions in schema public from %I', role_name);
    end if;
  end loop;
end
$$;
