-- 按角色聚合的已发布 mod 计数，供 JASM 市场侧边栏使用。
-- 起因：JASM 原先靠 1000 行/页 order=id.asc 全表扫（6 次请求、实测 109,270 字节）才能算出
-- 这份分组计数，且每客户端每 10 分钟重扫一次；本视图把同一份聚合压到 62 行 / 2,182 字节。
-- 表仅 5,277 行、character 上已有 mods_character_idx，实测 Seq Scan + HashAggregate 39.7ms，故不建新索引。
--
-- security_invoker = true 是必须的：本视图 owner 是 postgres，而 postgres 的 rolbypassrls = true，
-- 默认（security_invoker = false）会让视图以 owner 身份执行、完全绕过 mods 的 RLS。
-- 置 true（PG15+，本项目 17.6）后视图以调用者身份执行，继续受 mods_public_read 约束；
-- where 里再显式过滤一次 is_published 属纵深防御。
-- character 在库里是 NOT NULL，但客户端本地计数会跳过空白角色名，故这里一并排除，保证两侧 sum 相等。
create or replace view public.mod_character_counts
with (security_invoker = true)
as
select
  m.character,
  count(*)::integer as mod_count
from public.mods m
where m.is_published
  and m.is_available
  and m.character is not null
  and btrim(m.character) <> ''
group by m.character;

-- 显式授权（幂等）：Supabase 的 default privileges 只在对象 CREATE 那一刻生效，
-- 若本文件被别的角色执行或视图已存在，默认权限不会重放。
grant select on public.mod_character_counts to anon, authenticated, service_role;

-- 不重载 PostgREST 的 schema 缓存，/rest/v1/mod_character_counts 会一直是 404。
-- 必须经 5432 session 模式执行（6543 transaction 模式不保证 NOTIFY 送达）。
notify pgrst, 'reload schema';
