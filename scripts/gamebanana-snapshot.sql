-- 导出「已发布的 GameBanana 搬运 mod」兜底快照的查询，
-- 供 scripts/publish-gamebanana-snapshot.mjs 与 scripts/sync-gamebanana.mjs 共用。
--
-- 这是**第二份**快照，与 scripts/mods-snapshot.sql 完全独立：
--   data/mods-snapshot.json.gz        ← `mods` 表，桌面端 JASM 共用同一个产物
--   data/gamebanana-snapshot.json.gz  ← `gamebanana_mods` 表（本文件）
-- 刻意不合并成一份：mods 那份的列清单是 `mods` 的形状，往共享产物里加一张表
-- 会连 JASM 一起改。读取侧见 src/lib/gamebanana-domain/snapshot.ts。
--
-- ⚠️ 列清单的真源是 src/lib/gamebanana-domain/mappers.ts 里 mapper 真正会读的字段。
--    改那边时必须同步改这里，否则快照行缺列，mapper 会静默产出 undefined
--    （表现为卡片字段空白，而不是报错，很难排查）。
--
-- 两处刻意的差异：
--   1. **不含 description** —— 实测 288 行：含它 142KB gz，不含它 33KB。
--      描述是自由文本、熵高，压缩比极差（其余列几乎都是重复度很高的 URL 结构），
--      是这份 payload 里最大的一块。而详情页**本来就不渲染它**（PRD AC 128 未开），
--      所以排除它今天零代价；将来要在详情页显示描述，再把它加回来即可
--      （同时要复核 Data Cache 的字符数余量，见 src/lib/snapshot/loader.ts）。
--   2. **含 gb_root_category / gb_subcategory 与 images** —— 这两个是详情页要用的
--      （来源分类展示 + 相册），而列表 mapper 读不到它们也不受影响。
--      与 mods 那份同理：一份产物同时供列表与详情兜底，否则网关被锁时
--      「列表有卡片、点进去 404」。
--
-- 排序：like_count desc + gb_id desc 兜底。**gb_id 这个兜底不能省** ——
-- 各条 like_count 大量相同，仅按 like_count 排的话 Postgres 不保证多次执行的顺序一致，
-- 而导出侧是靠「与上一份**逐字节**比对」判断要不要重写快照的：
-- 顺序抖一次就白重写一个二进制、白进一次 git 历史（见 decideSnapshotWrite 的注释）。
--
-- psql 需配合 -t -A 使用（只要元组、不要表头对齐），输出即单行 JSON 数组。

select json_agg(row_to_json(t) order by t.like_count desc, t.gb_id desc) from (
  select gb_id, title, character, gb_root_category, gb_subcategory,
         images, cover_url, download_url, author_name, author_url, version,
         visibility, like_count, view_count, download_count, file_size, av_status,
         gb_created_at
  from public.gamebanana_mods
  where is_published = true
) t;
