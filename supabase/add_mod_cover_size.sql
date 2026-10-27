-- 封面尺寸：让瀑布流**首帧**就能按真实宽高比排版。
--
-- 背景（2026-10-27）：`packMasonry` 依赖图片比例，而比例要等图片 load 后由客户端测量，
-- 于是首帧全部按兜底 3/4 竖屏打包 —— 骨架屏结束后整版重排一次；横屏占比 ≥55% 时
-- `colCount` 还会从 5 降到 4，再重排一次。用户看到的就是「卡片一直抖」，
-- 而骨架屏又是清一色竖屏，与最终横屏大卡对不上。
--
-- 代价：列表 payload 每条多 2 个整数；快照 gzip 增量可忽略。
-- 兼容：只加列、不动旧列。JASM 桌面端共用兜底快照，读不到未知字段即忽略。
--
-- `cover_source` 记录「这两个数字是哪张封面算出来的」，供 scripts/cover-size.mjs
-- 做**幂等**同步：只处理 cover_source 与当前 images[1] 不一致的行。它不进任何下发链路。

alter table mods add column if not exists cover_width int;
alter table mods add column if not exists cover_height int;
alter table mods add column if not exists cover_source text;

comment on column mods.cover_width is '封面图（images[0]）原始宽度，像素；瀑布流首帧排版用';
comment on column mods.cover_height is '封面图（images[0]）原始高度，像素';
comment on column mods.cover_source is '上面两个尺寸对应的封面 URL；与 images[1] 不一致即待重算';
