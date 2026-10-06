#!/usr/bin/env node
/**
 * 一次性回填：给存量 COS 对象补上 Cache-Control。
 *
 * 背景：预览图此前完全没设 Cache-Control，浏览器只能走启发式缓存，
 * 稍老的图每次浏览都要回源做条件请求。补上显式缓存头之后重复访问是 0 请求。
 * 策略值与 src/lib/cos/shared.ts 的 COS_IMAGE_CACHE_CONTROL 一致（脚本不能 import TS）。
 *
 * 为什么用 putObjectCopy 而不是原地改元数据：COS 改元数据的唯一途径就是"复制对象到自身"，
 * MetadataDirective=Replaced。**副作用是必须把原 ContentType 一起回填**，
 * 否则会变成 application/octet-stream 把前台图片全部打坏 ——
 * 注意键名后缀推不出 content-type（originals/carousel-2026-09-27/1.png 实际是 image/webp），
 * 所以每个对象都先 headObject 取真实值，不靠后缀猜。
 *
 * 用法：
 *   node scripts/backfill-cos-cache-control.mjs                       # dry-run，只列出将要改的
 *   node scripts/backfill-cos-cache-control.mjs --key=<对象键> --apply  # 金丝雀：先改单个
 *   node scripts/backfill-cos-cache-control.mjs --apply               # 全量执行（可重复跑，幂等）
 *   node scripts/backfill-cos-cache-control.mjs --verify              # 只读：报告各前缀现状
 *   node scripts/backfill-cos-cache-control.mjs --only=mods/ --limit=50
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";

/** 取 Cache-Control 里的 max-age；no-cache / no-store / 缺失都算 -1（意味着"随时可改"）。 */
function maxAgeOf(cc) {
  if (!cc) return -1;
  const m = /max-age=(\d+)/.exec(cc);
  return m ? Number(m[1]) : -1;
}

/** 只碰这些前缀。显式白名单，不做「全桶」。 */
const ALLOW_PREFIXES = ["mods/", "tutorial/", "troubleshooting/", "placeholder/", "originals/"];

/**
 * 硬黑名单：无论白名单怎么改都不碰。
 * - snapshots/ 兜底快照：读取端带 ?t= 并送 no-cache，长缓存会让它静默退回构建期快照
 * - engagement/ 互动计数镜像：必须实时
 * - storage/、videos/ 用途不明，不冒险
 */
const DENY_PREFIXES = ["snapshots/", "engagement/", "storage/", "videos/"];

const CONCURRENCY = 10;
const RETRIES = 3;

// ==================== 参数 ====================

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const APPLY = has("--apply");
const VERIFY = has("--verify");
// 对象键大多是原样中文，PowerShell 传参会把编码搞坏，所以金丝雀走文件：
//   --key-file=.tmp-audit\canary-key.txt
const KEY_FILE = val("key-file");
const ONLY_KEY = KEY_FILE ? readFileSync(KEY_FILE, "utf8").trim() : val("key");
const ONLY_PREFIX = val("only");
const LIMIT = Number(val("limit")) || 0;
/** 目标值可覆盖，用于把某些前缀改回更长的策略（见 upload-tutorial-companion-video.mjs 的口径）。 */
const TARGET = val("value") || CACHE_CONTROL;

// ==================== COS ====================

const SecretId = process.env.COS_SECRET_ID?.trim();
const SecretKey = process.env.COS_SECRET_KEY?.trim();
const Bucket = process.env.COS_BUCKET?.trim();
const Region = process.env.COS_REGION?.trim();
if (!SecretId || !SecretKey || !Bucket || !Region) {
  console.error("❌ 缺少 COS 环境变量（COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION）");
  process.exit(1);
}

const cos = new COS({ SecretId, SecretKey, Timeout: 30000 });
const sourceHost = `${Bucket}.cos.${Region}.myqcloud.com`;

const p = (fn, params) => new Promise((res, rej) => fn.call(cos, params, (e, d) => (e ? rej(e) : res(d))));

/** 响应头键名统一转小写（SDK 返回的大小写不保证）。 */
function lowerHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = v;
  return out;
}

function listAll(prefix) {
  return new Promise((res) => {
    const all = [];
    const step = (marker) =>
      cos.getBucket({ Bucket, Region, Prefix: prefix, MaxKeys: 1000, Marker: marker }, (err, d) => {
        if (err) return res({ err });
        for (const o of d.Contents || []) all.push({ Key: o.Key, Size: Number(o.Size) });
        if (d.IsTruncated === "true" && d.NextMarker) step(d.NextMarker);
        else res({ items: all });
      });
    step("");
  });
}

/** 带重试的 headObject，返回小写 headers。 */
async function head(key) {
  let last;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const d = await p(cos.headObject, { Bucket, Region, Key: key });
      return lowerHeaders(d.headers);
    } catch (e) {
      last = e;
      if (e?.statusCode && e.statusCode < 500) break; // 4xx（含 451）不必重试
    }
  }
  throw last;
}

/** 复制对象到自身，替换元数据。ContentType / ContentEncoding 等必须显式保留。 */
async function copySelf(key, preserve) {
  const params = {
    Bucket,
    Region,
    Key: key,
    CopySource: `${sourceHost}/${encodeURIComponent(key)}`,
    MetadataDirective: "Replaced",
    CacheControl: TARGET,
  };
  // 只回填 headObject 真实报出来的头，避免凭空发明值
  if (preserve["content-type"]) params.ContentType = preserve["content-type"];
  if (preserve["content-encoding"]) params.ContentEncoding = preserve["content-encoding"];
  if (preserve["content-disposition"]) params.ContentDisposition = preserve["content-disposition"];
  if (preserve["content-language"]) params.ContentLanguage = preserve["content-language"];
  if (preserve["expires"]) params.Expires = preserve["expires"];

  let last;
  for (let i = 0; i < RETRIES; i++) {
    try {
      await p(cos.putObjectCopy, params);
      return;
    } catch (e) {
      last = e;
      if (e?.statusCode && e.statusCode < 500) break;
    }
  }
  throw last;
}

// ==================== 主流程 ====================

function assertNotDenied(keys) {
  const bad = keys.filter((k) => DENY_PREFIXES.some((d) => k.startsWith(d)));
  if (bad.length) {
    console.error(`❌ 有 ${bad.length} 个对象落在黑名单前缀里，拒绝执行。示例：${bad[0]}`);
    process.exit(1);
  }
}

async function collect() {
  if (ONLY_KEY) return [{ Key: ONLY_KEY, Size: 0 }];

  const prefixes = ONLY_PREFIX ? [ONLY_PREFIX] : ALLOW_PREFIXES;
  for (const pre of prefixes) {
    // 必须被某个白名单前缀覆盖（允许更细的子前缀，如 tutorial/companion/）
    if (!ALLOW_PREFIXES.some((a) => pre.startsWith(a))) {
      console.error(`❌ --only=${pre} 不在白名单范围内。允许：${ALLOW_PREFIXES.join(" ")}`);
      process.exit(1);
    }
  }

  const all = [];
  for (const pre of prefixes) {
    const r = await listAll(pre);
    if (r.err) {
      console.error(`❌ 列取 ${pre} 失败：${r.err.message || r.err.code}`);
      process.exit(1);
    }
    all.push(...r.items);
  }
  // 跳过零字节的「目录占位」对象，它们不是真正的内容
  const items = all.filter((o) => o.Size > 0);
  return LIMIT ? items.slice(0, LIMIT) : items;
}

async function main() {
  const items = await collect();
  assertNotDenied(items.map((o) => o.Key));

  console.log(`桶 ${Bucket} / ${Region}`);
  console.log(`目标 Cache-Control: ${TARGET}`);
  console.log(`模式: ${VERIFY ? "verify（只读）" : APPLY ? "APPLY（会写）" : "dry-run（不写）"}`);
  console.log(`待处理对象: ${items.length}\n`);

  const changed = [];
  const already = [];
  const failed = [];
  const typeChanged = [];
  /**
   * 从 no-cache 改成 7 天的对象。这是本次唯一的行为变更：
   * no-cache 是 reupload-mod-image.mjs 为了「换图后立刻可见」而写的，
   * 但它让**每一次**访问都回源校验，正是要治的病。
   * 代价：换图后 7 天内，已缓存的读者看不到新图（换键可立刻生效）。
   */
  const convertedFromNoCache = [];
  /** 已有更长 max-age 的对象：跳过，不缩短。 */
  const longer = [];
  let cursor = 0;
  let processed = 0;

  async function worker() {
    while (cursor < items.length) {
      const { Key } = items[cursor++];
      try {
        const before = await head(Key);
        const current = before["cache-control"];
        if (current === "no-cache") convertedFromNoCache.push(Key);

        const isTarget = current === TARGET;
        // 绝不缩短已有更长的策略：教学配套视频、carousel 原图这些键带版本号、内容不覆盖，
        // 仓库刻意给了 max-age=31536000（见 upload-tutorial-companion-video.mjs:7-10），
        // 铺平成 7 天会让那个脚本的回读自检失败。
        const isLonger = !isTarget && maxAgeOf(current) >= maxAgeOf(TARGET);

        if (VERIFY) {
          (isTarget ? already : isLonger ? longer : changed).push(Key);
          console.log(`  ${isTarget ? "✓" : isLonger ? "=长" : "✗"} ${Key}  cache-control=${current ?? "(无)"}`);
          continue;
        }

        if (isTarget) {
          already.push(Key);
          continue;
        }

        if (isLonger) {
          longer.push(Key);
          continue;
        }

        if (!APPLY) {
          changed.push(Key);
          console.log(`  → ${Key}  cache-control=${current ?? "(无)"} → ${TARGET}`);
          continue;
        }

        await copySelf(Key, before);
        const after = await head(Key);
        if (after["cache-control"] !== TARGET) {
          failed.push({ Key, reason: "写入后读回不一致" });
          continue;
        }
        // 元数据替换最容易出事的就是 content-type 被冲掉，这里逐条守住
        const ctBefore = before["content-type"];
        const ctAfter = after["content-type"];
        if (ctBefore !== ctAfter) typeChanged.push({ Key, ctBefore, ctAfter });
        changed.push(Key);
      } catch (e) {
        failed.push({ Key, reason: `${e?.statusCode ?? ""} ${e?.code ?? e?.message ?? e}`.trim() });
      } finally {
        // 全量跑要十几分钟，没有进度输出会让人以为卡死了
        if (++processed % 250 === 0) console.log(`  …已处理 ${processed}/${items.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n=== 汇总 ===`);
  console.log(`  ${APPLY ? "已写入" : VERIFY ? "已是目标值" : "待写入"}: ${changed.length}`);
  console.log(`  本就符合: ${already.length}`);
  console.log(`  原有更长策略、已跳过（不缩短）: ${longer.length}`);
  console.log(`  其中原为 no-cache 的: ${convertedFromNoCache.length}（唯一的换图可见性让步，见脚本注释）`);
  console.log(`  失败/跳过: ${failed.length}`);

  if (typeChanged.length) {
    console.error(`\n❌ ${typeChanged.length} 个对象的 content-type 发生变化（必须回滚排查）：`);
    for (const t of typeChanged.slice(0, 20)) console.error(`   ${t.Key}  ${t.ctBefore} → ${t.ctAfter}`);
    process.exit(1);
  }

  if (failed.length) {
    console.log(`\n失败明细（重跑本脚本即可续做）：`);
    for (const f of failed.slice(0, 40)) console.log(`   ${f.Key}  ← ${f.reason}`);
    if (failed.length > 40) console.log(`   …还有 ${failed.length - 40} 条`);
  }

  if (!APPLY && !VERIFY) console.log(`\n以上为 dry-run。确认无误后加 --apply 执行。`);
}

await main();
