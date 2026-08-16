-- 推荐排序字段：前台轮播按 featured_order 升序展示（null 排最后，兜底按 created_at 倒序）
alter table public.mods
  add column if not exists featured_order integer;
