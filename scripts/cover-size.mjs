/**
 * 封面尺寸（`mods.cover_width` / `cover_height`）的取数与同步。
 *
 * 为什么需要（2026-10-27）：瀑布流排版全靠图片宽高比，而比例原本只能等图片 load 后
 * 由客户端量出来 —— 首帧全部按兜底 3/4 竖屏打包，骨架屏结束后整版重排一次；横屏
 * 占比过半时列数还会 5→4 再跳一次。把尺寸存进库、随列表带下去，首帧就能排对。
 *
 * 两个导出：
 *   - `fetchCoverSize(url)`：读 COS `?imageInfo`（纯元数据，不下载图片），失败返回 null；
 *   - `syncCoverSizes({...})`：把「cover_source 与当前 images[1] 不一致」的行补齐。
 *     幂等 —— 重复跑只会处理真正变过的行，因此可以挂在每次上传之后。
 *
 * 用法:
 *   node scripts/cover-size.mjs                # dry-run，只统计待同步条数
 *   node scripts/cover-size.mjs --apply        # 真正写库
 *   node scripts/cover-size.mjs --apply --limit=200
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { config } from "dotenv";

import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

/** 单张图取元数据的超时；校园网到 COS 丢包严重（记忆 campus-net-cos-packet-loss） */
const INFO_TIMEOUT_MS = 20_000;
const DEFAULT_CONCURRENCY = 12;

/**
 * 读封面原始宽高。
 *
 * 用 COS 的 `imageInfo`（返回 JSON 元数据）而不是下载整张图：5500 条回填时
 * 差的是几十 GB 出口流量。URL 上已有的查询串（`?imageMogr2/...`）先剥掉，
 * 否则会拼出 `?imageMogr2/...&imageInfo` 这种非法组合。
 *
 * 非本桶 / 非 COS 的地址（Supabase Storage、unsplash 兜底图）一律返回 null：
 * 那些源没有 imageInfo，硬猜不如留空让前端退回兜底比例。
 */
export async function fetchCoverSize(url, { bucket, region } = {}) {
  if (!url) return null;
  const prefix = bucket && region ? `https://${bucket}.cos.${region}.myqcloud.com/` : null;
  if (prefix && !url.startsWith(prefix)) return null;
  if (!prefix && !/^https:\/\/[^/]+\.cos\.[^/]+\//.test(url)) return null;

  const clean = url.split("?")[0];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${clean}?imageInfo`, { signal: AbortSignal.timeout(INFO_TIMEOUT_MS) });
      if (!res.ok) {
        // 404 / 451（审核封禁）等：这张图本来就不该用它排版，留空即可
        return null;
      }
      const info = await res.json();
      const width = Number(info?.width);
      const height = Number(info?.height);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return { width, height };
      }
      return null;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

/** 待同步的行：封面换了（或从没算过） */
function pendingSql(limit) {
  return `
select coalesce(json_agg(t), '[]'::json)::text from (
  select id, images[1] as cover from mods
  where is_published = true
    and coalesce(images[1], '') <> ''
    and cover_source is distinct from images[1]
  order by updated_at desc
  limit ${Number(limit)}
) t;
`;
}

/**
 * 幂等同步封面尺寸。上传脚本写完 `images` 之后调它一次即可。
 *
 * 每行的 `cover_source` 存下「这两个数字是哪张封面算出来的」：封面 URL 一变
 * （换图脚本一律换新键）就自动重算，没变就完全跳过 —— 不需要调用方传 id。
 *
 * @returns {Promise<{ scanned:number, updated:number, skipped:number }>}
 */
export async function syncCoverSizes({
  bucket = process.env.COS_BUCKET?.trim(),
  region = process.env.COS_REGION?.trim(),
  limit = 5000,
  concurrency = DEFAULT_CONCURRENCY,
  log = () => {},
} = {}) {
  requireDatabaseUrl();
  const rows = await psqlJson(pendingSql(limit));
  if (!rows || rows.length === 0) return { scanned: 0, updated: 0, skipped: 0 };

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const size = await fetchCoverSize(row.cover, { bucket, region });
      results.push({ id: row.id, cover: row.cover, size });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));

  // 取不到尺寸的行也要写 cover_source：否则每次同步都会重试这两张永远取不到的图
  // （451 审核封禁、非本桶地址）。封面一换 URL 就会重新进待同步队列，不会漏。
  const updated = results;
  const skipped = results.filter((r) => !r.size).length;

  // 分批写：一次几百行的 values 已经够长，再大 psql 的命令行/内存都不划算
  const BATCH = 200;
  let applied = 0;
  for (let i = 0; i < updated.length; i += BATCH) {
    const slice = updated.slice(i, i + BATCH);
    const values = slice
      .map(
        (r) =>
          `(${dollarQuote(r.id)}::uuid, ${r.size ? r.size.width : "null"}::int, ${
            r.size ? r.size.height : "null"
          }::int, ${dollarQuote(r.cover)})`,
      )
      .join(",\n    ");
    const out = await psqlJson(`
with incoming(id, w, h, src) as (
  values
    ${values}
),
upd as (
  update mods m
  set cover_width = incoming.w, cover_height = incoming.h, cover_source = incoming.src
  from incoming
  where m.id = incoming.id
  returning 1
)
select json_build_object('updated', (select count(*) from upd))::text;
`);
    applied += Number(out?.updated ?? 0);
    log(`   批次 ${Math.floor(i / BATCH) + 1}: 更新 ${out?.updated ?? 0} 条`);
  }

  return { scanned: rows.length, updated: applied, skipped };
}

// ==================== CLI ====================

// Windows 下 process.argv[1] 是 `D:\…` 反斜杠路径，直接拼 `file://` 永远不相等
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const isApply = process.argv.includes("--apply");
  const limitArg = process.argv.slice(2).find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 5000;

  const rows = await psqlJson(pendingSql(limit));
  console.log(`🖼  待同步封面尺寸：${rows?.length ?? 0} 条`);
  if (!isApply) {
    console.log("🔍 DRY-RUN：未取尺寸、未写库。确认无误后加 --apply 执行。");
    process.exit(0);
  }
  const result = await syncCoverSizes({ limit, log: (m) => console.log(m) });
  console.log(
    `📊 扫描 ${result.scanned}，写入 ${result.updated}，跳过（取不到尺寸）${result.skipped}`,
  );
}
