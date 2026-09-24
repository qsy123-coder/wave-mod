-- 页面级「图文教程配套视频」：给 tutorial_configs 加两列。
--
-- 背景：tutorial_chapters 上已有的 video_src/video_poster 是**章节视频**（每章一个）。
-- 但有一段 3:56 的录屏演示的是整篇图文教程的全流程（解压 → XXMI → JASM → 贴图修复），
-- 对应不到任何一章，所以挂在 config（= 整个版本）这一层，前台在 /guide 顶部单独出卡片。
--
-- 两列均可空、纯新增：不影响既有行，也不影响 tutorial_chapters 上原有的章节视频功能。
-- 现有行两列为 NULL，前台据此不渲染卡片（老版本教程没有配套视频是合法的）。
--
-- 执行方式：走直连 5432（scripts/psql-db.mjs），不走 Supabase HTTP 网关 —— 网关有出口配额锁，
-- 见 scripts/psql-db.mjs 头部注释。

alter table public.tutorial_configs
  add column if not exists video_src    text,
  add column if not exists video_poster text;

comment on column public.tutorial_configs.video_src is
  '页面级配套视频地址（整篇教程一个），与 tutorial_chapters.video_src 的章节视频不是一回事';
comment on column public.tutorial_configs.video_poster is
  '页面级配套视频封面图地址';
