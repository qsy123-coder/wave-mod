/**
 * 每日上传用到的 SQL 构造器。
 *
 * 单独拆出来是为了能写单测：`upload-daily-by-date.mjs` 在模块加载时就会要求
 * DATABASE_URL / COS 环境变量，vitest 直接 import 它会先 exit。这里的函数只做
 * 字符串拼接，跑测试时不需要连库。
 *
 * 所有 JSON 都走 `jsonb_populate_recordset(null::mods, …)`，让 Postgres 按真实列
 * 类型解析 text[] / jsonb / timestamptz / boolean，避免标题里的引号、反斜杠、换行
 * 把 SQL 拼坏（与旧实现保持同一套转义路径）。
 */
import { dollarQuote } from "./psql-db.mjs";

/** 与上传脚本 results 里的字段一一对应；其余列交给库表默认值 */
export const INSERT_COLUMNS = [
  "id",
  "title",
  "character",
  "game_key",
  "game_version",
  "version",
  "description",
  "download_url",
  "drive_links",
  "variant_images",
  "nsfw",
  "is_published",
  "is_available",
  "images",
  "xxmi_install_guide",
  "mod_author_url",
  "video_url",
  "created_by",
  "created_at",
];

/**
 * 插入一批记录。
 *
 * `where not exists` 是第二道去重：上游已用 existingSet 跳过重复，这里再兜一次，
 * 防止脚本重跑或两次运行撞车时插出双份。
 */
export function buildInsertSql(batch) {
  const columnList = INSERT_COLUMNS.join(", ");
  const selectList = INSERT_COLUMNS.map((column) => `j.${column}`).join(", ");

  return `
with incoming as (
  select * from jsonb_populate_recordset(null::mods, ${dollarQuote(JSON.stringify(batch))}::jsonb)
),
ins as (
  insert into mods (${columnList})
  select ${selectList}
  from incoming j
  where not exists (
    select 1
    from mods m
    where m.game_key = j.game_key
      and m.character = j.character
      and m.title = j.title
  )
  returning 1
)
select json_build_object('inserted', (select count(*) from ins))::text;
`;
}

/**
 * 重新上架：把库内已存在的行 `created_at` 推到本目录日期（只改这一列 + updated_at）。
 *
 * 只取 id 与 created_at 两列参与赋值，其余列保持原值。
 */
export function buildRedateSql(batch) {
  const rows = batch.map((r) => ({ id: r.id, created_at: r.createdAt }));
  return `
with incoming as (
  select j.id, j.created_at
  from jsonb_populate_recordset(null::mods, ${dollarQuote(JSON.stringify(rows))}::jsonb) j
),
upd as (
  update mods
  set created_at = incoming.created_at,
      updated_at = now()
  from incoming
  where mods.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

/**
 * 刷新已有行的预览图数组（`--refresh-images` 用）。
 *
 * 只改 images，不动标题/链接/created_at；封面尺寸由随后的 syncCoverSizes 按新首图重算。
 */
export function buildImageUpdateSql(batch) {
  const rows = batch.map((r) => ({ id: r.id, images: r.images, variant_images: r.variantImages ?? {} }));
  return `
with incoming as (
  select j.id, j.images, j.variant_images
  from jsonb_populate_recordset(null::mods, ${dollarQuote(JSON.stringify(rows))}::jsonb) j
),
upd as (
  update mods m
  set images = i.images,
      variant_images = coalesce(i.variant_images, '{}'::jsonb),
      updated_at = now()
  from incoming i
  where m.id = i.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

/**
 * 下架同一帖子被拆成多条卡片的重复行（自动合并当天拆分行时用）。
 * 只改 is_published，不删除，方便回滚。
 */
export function buildUnpublishSql(ids) {
  const list = ids.map((id) => dollarQuote(String(id))).join(", ");
  return `
with upd as (
  update mods
  set is_published = false,
      updated_at = now()
  where id in (${list})
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}

/**
 * 合并网盘链接（同帖多变体重新上传时用）。
 *
 * 关键点：
 * - `distinct on (variant, platform)`：同一变体同一网盘只保留一条，新链接（ord 更大）
 *   覆盖旧链接；不同变体的同一网盘是不同分享，必须各自保留；
 * - 旧行里本次没出现的变体原样保留（并集，不删除）；
 * - `created_at` 只前进，保持「重新上架」语义。
 */
export function buildMergeDriveLinksSql(batch) {
  const rows = batch.map((r) => ({
    id: r.id,
    created_at: r.createdAt,
    drive_links: r.driveLinks ?? [],
    base_label: r.baseLabel ?? "",
  }));
  return `
with incoming as (
  select x.id, x.created_at,
         coalesce(x.drive_links, '[]'::jsonb) as drive_links,
         nullif(x.base_label, '') as base_label
  from jsonb_to_recordset(${dollarQuote(JSON.stringify(rows))}::jsonb)
       as x(id uuid, created_at timestamptz, drive_links jsonb, base_label text)
),
-- 旧行里没有 variant 的链接（合并前那张单版本卡）归到基变体；
-- 与新链接完全相同的（同平台同 URL）直接丢掉，否则前台会多出一个「默认」分组。
existing as (
  select i.id,
         coalesce((
           select jsonb_agg(
                    case
                      when link->>'variant' is null and i.base_label is not null
                        then link || jsonb_build_object('variant', i.base_label)
                      else link
                    end
                  )
           from jsonb_array_elements(coalesce(m.drive_links, '[]'::jsonb)) as link
           where i.base_label is null
              or not exists (
                   select 1 from jsonb_array_elements(i.drive_links) as inc
                   where inc->>'platform' = link->>'platform' and inc->>'url' = link->>'url'
                 )
         ), '[]'::jsonb) as drive_links
  from incoming i
  join mods m on m.id = i.id
),
upd as (
  update mods m
  set drive_links = (
        select coalesce(jsonb_agg(link order by sort_key), '[]'::jsonb)
        from (
          select distinct on (coalesce(link->>'variant', ''), link->>'platform')
                 link,
                 coalesce(link->>'variant', '') as variant_key,
                 link->>'platform' as platform_key,
                 sort_key
          from (
            select value as link, 0 as dedupe_ord, 1000000 + idx as sort_key
            from existing e, jsonb_array_elements(e.drive_links) with ordinality as t(value, idx)
            where e.id = m.id
            union all
            select value as link, ord as dedupe_ord, ord as sort_key
            from incoming i, jsonb_array_elements(i.drive_links) with ordinality as t(value, ord)
            where i.id = m.id
          ) candidates
          order by coalesce(link->>'variant', ''), link->>'platform', dedupe_ord desc
        ) picked
      ),
      is_published = true,
      created_at = greatest(m.created_at, i.created_at),
      updated_at = now()
  from incoming i
  where m.id = i.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`;
}
