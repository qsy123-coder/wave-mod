-- 导出「已发布 mod」兜底快照的查询。本地(export-mods-snapshot.ps1)与
-- CI(backup-to-github.mjs)共用本文件，避免两处列清单各自漂移。
--
-- ⚠️ 列清单的真源是 src/lib/mods-domain/mappers.ts 的 publicModColumns。
--    改那边时必须同步改这里，否则快照行缺列，mapMod 会静默产出 undefined
--    （表现为详情页字段空白，而不是报错，很难排查）。
--
-- 两处刻意的差异：
--   1. 不含 xxmi_install_guide —— 全库仅 2 个近似取值（= install-guide.ts 的静态
--      常量，只差一个换行），却占 payload 的 27%。读取时由 snapshot.ts 统一回填常量。
--   2. 含 featured_order —— publicModColumns 里没有它，但 mapMod 要读，
--      线上的 getFeaturedMods 也是单独 append 这一列。缺了它首页轮播排序失效。
--
-- 按 created_at 倒序：与线上列表接口的默认顺序一致。
-- psql 需配合 -t -A 使用（只要元组、不要表头对齐），输出即单行 JSON 数组。

select json_agg(row_to_json(t) order by t.created_at desc) from (
  select id, title, character, version, game_version, game_key, description,
         images, video_url, download_url, downloads_count, drive_links, nsfw,
         mod_author_url, views, favorites_count, likes_count, comments_count,
         rating_count, rating_average, is_published, is_featured, featured_order, created_at
  from mods
  where is_published = true
) t;
