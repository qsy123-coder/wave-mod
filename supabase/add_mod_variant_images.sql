-- 同帖多变体各自的预览图。
--
-- 结构：{ "<变体标签>": ["https://.../preview.webp", ...], ... }
-- 历史行 / 单版本 mod 保持 '{}'，前台回退到 mods.images。
-- 上传脚本在合并同一 GameBanana 帖子的多个附件时写入；详情页按当前选中的版本切换画廊。
alter table public.mods
  add column if not exists variant_images jsonb default '{}'::jsonb;

comment on column public.mods.variant_images is
  '同帖多变体预览图：variant label -> 图片 URL 数组；历史行为空对象，前台回退到 images';
