#!/usr/bin/env node
/**
 * 详情页预览图加载 —— 全自动验收脚本。
 *
 * 它检查的是 2026-11-24 这次优化的三件事，任何一条回退都会让脚本以非 0 退出：
 *
 *   1. **首图预载**：`/mods/<id>` 的 HTML 里必须有且只有一条「抽屉首图」的
 *      `<link rel="preload" as="image">`，`imageSrcSet` 覆盖 640/960/1280/1920，
 *      `imageSizes` 与抽屉画廊共用同一份描述（见 DRAWER_HERO_SIZES）。
 *   2. **列表卡片不再抢带宽**：详情页的列表整块被抽屉盖住，卡片图不应再发
 *      `fetchPriority=high` 的 preload（实测修复前 15 条）。
 *   3. **取流地址够快**：按移动端 / 桌面端真实会挑的档位逐个请求，量 TTFB 与
 *      总耗时 —— 境外 CDN 时代这里是 2.1–7.9s，COS 广州源站约 0.3–0.6s。
 *
 * 用法（默认打线上）：
 *   node scripts/verify-preview-image-perf.mjs
 *   node scripts/verify-preview-image-perf.mjs --base=http://localhost:3000
 *   node scripts/verify-preview-image-perf.mjs --id=<uuid> --expect-host=wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com
 *   node scripts/verify-preview-image-perf.mjs --json
 *
 * 阈值（可用参数覆盖）：
 *   --max-ttfb=1.2      热请求首字节上限（秒）
 *   --max-total=1.6     热请求总耗时上限（秒）
 *   --max-hero-bytes=260000   首图字节上限
 *   --max-thumb-bytes=40000   单张缩略图字节上限
 *
 * 退出码：0 = 全部通过；1 = 有断言失败；2 = 环境/网络错误（拿不到页面或接口）。
 */
import { performance } from "node:perf_hooks";

import { buildThumbUrl, computeRequiredWidth, parseAttrs, pickSrcsetCandidate } from "./preview-perf-lib.mjs";

const args = process.argv.slice(2);
const getArg = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1)?.trim();
const hasFlag = (name) => args.includes(name);

const BASE = (getArg("--base") ?? process.env.PREVIEW_PERF_BASE ?? "https://go.sunnyrose.xyz").replace(/\/+$/, "");
const EXPECT_HOST = getArg("--expect-host") ?? process.env.PREVIEW_PERF_EXPECT_HOST ?? "";
const MAX_TTFB = Number(getArg("--max-ttfb") ?? 1.2);
const MAX_TOTAL = Number(getArg("--max-total") ?? 1.6);
const MAX_HERO_BYTES = Number(getArg("--max-hero-bytes") ?? 260_000);
const MAX_THUMB_BYTES = Number(getArg("--max-thumb-bytes") ?? 40_000);
const JSON_OUT = hasFlag("--json");

const results = [];
const failures = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  failures.push(`${name}${detail ? `：${detail}` : ""}`);
}
function assert(condition, name, detail = "") {
  (condition ? pass : fail)(name, detail);
  return condition;
}

async function timedFetch(url) {
  const started = performance.now();
  const response = await fetch(url, {
    headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
    cache: "no-store",
  });
  const ttfb = (performance.now() - started) / 1000;
  const body = Buffer.from(await response.arrayBuffer());
  const total = (performance.now() - started) / 1000;
  return { status: response.status, bytes: body.length, ttfb, total, contentType: response.headers.get("content-type") };
}

function formatSeconds(value) {
  return `${value.toFixed(2)}s`;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(0)}KB`;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.json();
}

/** 取一条「多图、首图不是占位图」的 mod 做样本 */
async function pickSampleMod(explicitId) {
  if (explicitId) {
    return fetchJson(`${BASE}/api/mods/${encodeURIComponent(explicitId)}`);
  }

  const page = await fetchJson(`${BASE}/api/mods?limit=24`);
  const items = Array.isArray(page?.items) ? page.items : [];
  const isPlaceholder = (url) => !url || url.includes("placeholder");

  const withMulti = items.find((m) => Array.isArray(m.images) && m.images.length >= 2 && !isPlaceholder(m.images[0]));
  const withOne = items.find((m) => Array.isArray(m.images) && m.images.length >= 1 && !isPlaceholder(m.images[0]));

  if (!withMulti && !withOne) {
    throw new Error("样本里没有带真预览图的 mod");
  }
  return withMulti ?? withOne;
}

async function main() {
  console.log(`=== 详情页预览图加载自动测试 ===`);
  console.log(`目标: ${BASE}`);

  const mod = await pickSampleMod(getArg("--id"));
  console.log(`样本: ${mod.id}（${Array.isArray(mod.images) ? mod.images.length : 0} 张图）${mod.title ? ` · ${mod.title}` : ""}\n`);

  // ── 1. HTML 里的首图预载 ────────────────────────────────────────────
  const htmlResponse = await fetch(`${BASE}/mods/${mod.id}`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!htmlResponse.ok) throw new Error(`详情页 HTTP ${htmlResponse.status}`);
  const html = await htmlResponse.text();

  const imagePreloads = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /rel="preload"/i.test(tag) && /as="image"/i.test(tag))
    .map((tag) => ({ tag, attrs: parseAttrs(tag) }));

  // 抽屉首图的标志：imageSizes 与 DRAWER_HERO_SIZES 相同。
  // 优先取带 href 的那条 —— React 会给画廊里那个隐藏的预载 <img> 也补一条 preload，
  // 但那条只有 srcset/sizes、没有 href。
  const heroPreloads = imagePreloads.filter((p) => (p.attrs.imagesizes ?? "").includes("720px"));
  const heroPreload = heroPreloads.find((p) => p.attrs.href) ?? heroPreloads[0] ?? imagePreloads[0] ?? null;

  assert(Boolean(heroPreload), "详情页输出首图 preload", heroPreload ? heroPreload.attrs.href?.slice(0, 90) : "缺失");

  if (heroPreload) {
    const srcSet = heroPreload.attrs.imagesrcset ?? "";
    const widths = [...srcSet.matchAll(/\s(\d+)w\b/g)].map((m) => Number(m[1]));
    assert(
      [640, 960, 1280, 1920].every((w) => widths.includes(w)),
      "preload 的 imageSrcSet 覆盖 640/960/1280/1920",
      widths.join("/") || "空",
    );
    assert(
      (heroPreload.attrs.imagesizes ?? "") === "(max-width: 640px) 100vw, 720px",
      "preload 的 imageSizes 与抽屉画廊一致",
      heroPreload.attrs.imagesizes ?? "空",
    );
    assert(
      Boolean(heroPreload.attrs.href) && (heroPreload.attrs.href ?? "").includes("imageMogr2/thumbnail/"),
      "preload href 带 imageMogr2 缩图参数",
      heroPreload.attrs.href ?? "空",
    );

    if (EXPECT_HOST) {
      let host = "";
      try {
        host = new URL(heroPreload.attrs.href).hostname;
      } catch {
        host = "<非法 URL>";
      }
      assert(host === EXPECT_HOST, "首图取流域名符合预期", `${host}（期望 ${EXPECT_HOST}）`);
    }
  }

  // 卡片图不应再发 high 优先级 preload：抽屉打开时列表整块不可见
  const highPriorityCardPreloads = imagePreloads.filter(
    (p) => p !== heroPreload && !heroPreloads.includes(p) && (p.attrs.fetchpriority ?? "").toLowerCase() === "high",
  );
  assert(
    highPriorityCardPreloads.length === 0,
    "列表卡片图不再发 high 优先级 preload",
    `${highPriorityCardPreloads.length} 条`,
  );

  // ── 2. 档位实测 ────────────────────────────────────────────────────
  const srcSetAll = heroPreload?.attrs.imagesrcset ?? "";
  const sizes = heroPreload?.attrs.imagesizes ?? "(max-width: 640px) 100vw, 720px";

  const viewports = [
    { name: "手机 393px @3x", cssWidth: 393, dpr: 3 },
    { name: "桌面 1280px @2x", cssWidth: 1280, dpr: 2 },
  ];

  const measurements = [];
  for (const vp of viewports) {
    const needed = computeRequiredWidth(sizes, vp.cssWidth, vp.dpr);
    const candidate = pickSrcsetCandidate(srcSetAll, needed);
    if (!candidate) {
      fail(`${vp.name} 找不到 srcset 候选`);
      continue;
    }

    // 第一次是冷请求（可能是 CDN/COS 现场转码），第二次才是用户重复访问的稳态
    const cold = await timedFetch(candidate.url);
    const warm = await timedFetch(candidate.url);
    measurements.push({ viewport: vp.name, width: candidate.width, needed, cold, warm });

    console.log(
      `[档位] ${vp.name} → 需要 ${needed}px，选 ${candidate.width}w：` +
        `冷 ${formatSeconds(cold.total)} / 热 ${formatSeconds(warm.total)}，${formatBytes(warm.bytes)}`,
    );

    assert(warm.status === 200, `${vp.name} 图片返回 200`, `HTTP ${warm.status}`);
    assert(
      warm.ttfb <= MAX_TTFB,
      `${vp.name} 热请求首字节 ≤ ${MAX_TTFB}s`,
      formatSeconds(warm.ttfb),
    );
    assert(
      warm.total <= MAX_TOTAL,
      `${vp.name} 热请求总耗时 ≤ ${MAX_TOTAL}s`,
      formatSeconds(warm.total),
    );
  }

  // 首图字节预算：桌面 2x 会挑 1920 档；原图直出 248KB 的时代这里会挂
  const desktop = measurements.at(-1);
  if (desktop) {
    assert(
      desktop.warm.bytes <= MAX_HERO_BYTES,
      `首图字节 ≤ ${formatBytes(MAX_HERO_BYTES)}`,
      formatBytes(desktop.warm.bytes),
    );
  }

  // ── 3. 缩略图条（20 图帖子最吃带宽的地方） ─────────────────────────
  const galleryImages = (Array.isArray(mod.images) ? mod.images : []).filter(
    (url) => typeof url === "string" && url.startsWith("http"),
  );
  const thumbUrls = galleryImages
    .slice(0, 12)
    .map((image) => buildThumbUrl(image, 160))
    .filter(Boolean);

  if (thumbUrls.length) {
    let thumbBytes = 0;
    let thumbWorst = 0;
    for (const url of thumbUrls) {
      const result = await timedFetch(url);
      thumbBytes += result.bytes;
      thumbWorst = Math.max(thumbWorst, result.bytes);
      if (result.bytes > MAX_THUMB_BYTES) {
        fail(`缩略图 ${url.slice(-40)} 字节超限`, `${formatBytes(result.bytes)} > ${formatBytes(MAX_THUMB_BYTES)}`);
      }
    }
    console.log(
      `[缩略图] ${thumbUrls.length} 张 160w，共 ${formatBytes(thumbBytes)}，单张最大 ${formatBytes(thumbWorst)}`,
    );
    if (thumbWorst <= MAX_THUMB_BYTES) {
      pass("缩略图条单张字节预算", `最大 ${formatBytes(thumbWorst)}`);
    }
  }

  // ── 汇总 ──────────────────────────────────────────────────────────
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n=== 汇总：${okCount}/${results.length} 通过 ===`);

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, mod: { id: mod.id, title: mod.title }, results }, null, 2));
  }

  if (failures.length) {
    console.error(`\n❌ 失败项：`);
    for (const failure of failures) console.error(`   - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("✅ 全部通过");
  }
}

main().catch((error) => {
  console.error(`❌ 测试无法执行：${error.message}`);
  process.exitCode = 2;
});
