/**
 * CDN 图片档位预热：把详情页真正会请求的 `?imageMogr2/thumbnail/...` 地址提前推进
 * 腾讯云 CDN 的缓存，消掉「第一次打开某张图要等 1.5–4s 回源转码」。
 *
 * 为什么需要：站内图片是 COS 原图 + 数据万象按需缩放，CDN 第一次收到某个档位地址时
 * 要回源 COS 现场转码（实测冷 1.5–4s、热 130–190ms）。20 多张图的帖子，首次浏览就是
 * 20 多次冷转码 —— 用户 2026-11-14 反馈的「多图预览很慢」。
 *
 * 预热任务由腾讯云侧异步执行，本脚本只负责提交（几十毫秒），不会拖慢上传。
 *
 * 用法（默认 dry-run，加 `--apply` 才真的提交）：
 *   node scripts/warm-cdn-images.mjs --date=2026.11.13           # 某天的上架记录
 *   node scripts/warm-cdn-images.mjs --ids=<uuid>,<uuid>
 *   node scripts/warm-cdn-images.mjs --since-days=3
 *   node scripts/warm-cdn-images.mjs --urls=urls.txt             # 每行一条完整 URL
 *
 * 选项：
 *   --widths=320,640,960,1280,1920   首图档位（默认见 IMAGE_VARIANT_WIDTHS）
 *   --thumb=320                      非首图只预热这个档位
 *   --max=800                        本次最多提交多少条（防误刷配额）
 *   --area=overseas                  域名是境外加速，别改成 mainland
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

import { psqlJson, requireDatabaseUrl } from "./psql-db.mjs";
import {
  CDN_IMAGE_BASE_DEFAULT,
  IMAGE_VARIANT_WIDTHS,
  buildWarmUrls,
  cdnCredentialsFromEnv,
  warmUrls,
} from "./tencent-cdn.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const getArg = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1)?.trim();

const widthsArg = getArg("--widths");
const widths = widthsArg
  ? widthsArg
      .split(",")
      .map((w) => Number(w.trim()))
      .filter((w) => Number.isFinite(w) && w > 0)
  : IMAGE_VARIANT_WIDTHS;
const thumbWidth = Number(getArg("--thumb") ?? 320) || 320;
const maxUrls = Number(getArg("--max") ?? 800) || 800;
const area = getArg("--area") ?? process.env.CDN_WARM_AREA?.trim() ?? "overseas";
const base = getArg("--base") ?? CDN_IMAGE_BASE_DEFAULT;

/** 直接读一行一个 URL 的文件（给手工场景用） */
function readUrlsFile(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 按日期/ID 从库里取 mod 记录（images + variant_images） */
async function loadMods() {
  requireDatabaseUrl();

  const dateArg = getArg("--date");
  const idsArg = getArg("--ids");
  const sinceDays = Number(getArg("--since-days") ?? 0);

  const where = [];
  if (dateArg) {
    const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(dateArg);
    if (!m) throw new Error(`--date 要写成 2026.11.13 这种格式：${dateArg}`);
    const iso = `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
    where.push(`(created_at AT TIME ZONE 'Asia/Shanghai')::date = DATE '${iso}'`);
  }
  if (idsArg) {
    const ids = idsArg.split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error(`--ids 里有不合法的 uuid：${id}`);
      }
    }
    where.push(`id IN (${ids.map((id) => `'${id}'`).join(", ")})`);
  }
  if (sinceDays > 0) {
    where.push(`created_at >= now() - interval '${Math.floor(sinceDays)} days'`);
  }
  if (!where.length) throw new Error("至少要给 --date / --ids / --since-days 之一（或 --urls 文件）");

  const rows = await psqlJson(`
    select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (
      select id, title, images, variant_images
      from mods
      where ${where.join(" AND ")}
        and array_length(images, 1) > 0
      order by created_at desc
    ) t;
  `);
  return Array.isArray(rows) ? rows : [];
}

async function main() {
  let urls = [];
  let sourceLabel = "";

  const urlsFile = getArg("--urls");
  if (urlsFile) {
    const path = resolve(process.cwd(), urlsFile);
    if (!existsSync(path)) throw new Error(`找不到 URL 文件：${path}`);
    urls = readUrlsFile(path);
    sourceLabel = `文件 ${urlsFile}（${urls.length} 行）`;
  } else {
    const mods = await loadMods();
    urls = buildWarmUrls(mods, { widths, thumbWidth, base });
    sourceLabel = `${mods.length} 条 mod / ${mods.reduce((n, m) => n + (m.images?.length ?? 0), 0)} 张图`;
  }

  const total = urls.length;
  const capped = urls.slice(0, maxUrls);

  console.log("=== CDN 预热计划 ===");
  console.log(`来源: ${sourceLabel}`);
  console.log(`档位: 首图 ${widths.join("/")}，缩略图 ${thumbWidth}`);
  console.log(`URL: ${total} 条${total > capped.length ? `（超过 --max=${maxUrls}，只提交前 ${capped.length} 条）` : ""}`);

  for (const url of capped.slice(0, 5)) console.log(`   ${decodeURIComponent(url)}`);
  if (capped.length > 5) console.log(`   … 共 ${capped.length} 条`);

  if (!capped.length) return;
  if (!apply) {
    console.log("\n🔍 DRY-RUN：未提交。确认无误后加 --apply。");
    return;
  }

  const credentials = cdnCredentialsFromEnv();
  if (!credentials.secretId) throw new Error("缺少 COS_SECRET_ID / COS_SECRET_KEY（本地在 .env.local）");

  const taskIds = await warmUrls(capped, { credentials, area });
  console.log(`\n🔥 已提交 ${capped.length} 条，Area=${area}，任务 ${taskIds.length} 个`);
  taskIds.forEach((id) => console.log(`   ${id}`));
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
});
