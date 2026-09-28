/**
 * GameBanana 鸣潮专区分类普查（**只读，不写库**）。
 *
 * 为什么要先跑这个：docs/gamebanana-integration-prd.md 的 Phase 0 要求先把
 * 「GameBanana 英文子分类 → 站内中文角色」的映射表**查出来**，再写分类模块
 * gamebanana-classify.mjs。抽样时看到 `Skins >> Qingxiao` 这类子分类大约只覆盖
 * 70% 的记录，剩下 30% 没有子分类、只能靠标题猜 —— 而猜错的表现是**静默的**：
 * 前台凭空多一个角色分类，或某条 mod 挂到错的角色下，都不会有报错。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 跑之前实测踩到的四个坑（正式同步脚本必须照做，别再踩一遍）：
 *
 * 1. **Subfeed 是混合流，不只有 Mod。** 实测 4860 条里 Mod 仅 2432 条，另有
 *    Question 1649、Request 555，以及 Wip/Thread/Tool/Tutorial/Script/Blog/
 *    Concept/News/Poll 约 130 条。**必须按 `_sModelName === "Mod"` 过滤**，
 *    否则论坛提问与求物帖会混进映射表，整张表作废。
 *
 * 2. **`_nPerPage` 之类的分页参数全被忽略**（`_nPerPage` / `_nPerpage` /
 *    `_per_page` / `_nLimit` 四种写法实测都无效），Subfeed 硬编码 **15 条/页**。
 *    全量遍历 = 405 次请求，没有捷径。
 *
 * 3. **`_sSort=default` 不是时间序** —— 实测同页内 2026-09-27 与 2024-09-06 混排。
 *    只有 **`_sSort=new` 是严格时间倒序**；增量同步必须用 `new`。
 *    `_sSort=updated` 也可用但语义不同（记录数 1432，疑似近期有更新的子集）。
 *    `popular` / `likes` / `downloads` / `best` 一律返回 400。
 *
 * 4. **约 47% 的记录 `_bHasFiles=false`**，没有文件可下载，入库时应当跳过。
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 产出：
 *   scripts/logs/gamebanana/raw/page-*.json   原始分页缓存（重跑不重复打 API）
 *   docs/gamebanana-category-probe.md         普查报告，交主理人确认
 *
 * 用法：
 *   node scripts/probe-gamebanana-categories.mjs              # 用缓存，缺页才拉
 *   node scripts/probe-gamebanana-categories.mjs --refresh    # 忽略缓存全量重拉
 *
 * 本脚本不读 env、不碰数据库、不修改任何记录。
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CACHE_DIR = join(HERE, "logs", "gamebanana", "raw");
const REPORT_PATH = join(ROOT, "docs", "gamebanana-category-probe.md");
const CHARACTER_IMAGES_TS = join(ROOT, "src", "lib", "constants", "character-images.ts");

/** 鸣潮在 GameBanana 的 game id（实测：Util/Search 搜 "wuthering" 得 _idRow 20357） */
const GAME_ID = 20357;

/** Subfeed 硬编码 15/页，传什么分页参数都没用（见文件头第 2 条） */
const PER_PAGE = 15;

/** 单个 worker 两次请求之间的间隔。官方没有公开 rate limit 文档，按保守策略来 */
const REQUEST_GAP_MS = 500;

/**
 * 分页抓取的并发数。
 *
 * 为什么需要并发：这条国际链路单次往返实测约 7 秒，而顺序跑完 405 页要 ~50 分钟。
 * 瓶颈是**延迟**不是频率 —— 顺序跑每秒才 0.14 个请求，纯属浪费。4 并发也只有
 * 约 0.5 请求/秒，对一个只读公开接口依然是克制的。
 */
const CONCURRENCY = 4;

/** 请求重试上限（仅对 5xx / 网络错误重试，4xx 是确定性失败） */
const MAX_ATTEMPTS = 3;

const USER_AGENT = "WaveMod/1.0 (category probe; read-only)";

const refresh = process.argv.includes("--refresh");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 带重试的 JSON 请求。
 *
 * 4xx 是确定性失败（参数写错、资源不存在），重试没有意义 —— 直接抛，让调用方看见真原因。
 * 5xx 与网络抖动退避重试。
 */
async function fetchJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
      if (res.ok) return await res.json();
      const err = new Error(`HTTP ${res.status}`);
      err.retryable = res.status >= 500;
      throw err;
    } catch (err) {
      lastErr = err;
      // undici 的网络错误没有 status，按可重试处理
      if (err.retryable === false) throw err;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
  }
  throw lastErr;
}

/** 拉一页 Subfeed，带磁盘缓存（--refresh 时忽略缓存） */
async function loadPage(page) {
  const cachePath = join(CACHE_DIR, `page-${String(page).padStart(3, "0")}.json`);
  if (!refresh && existsSync(cachePath)) {
    try {
      return { json: JSON.parse(readFileSync(cachePath, "utf8")), fromCache: true };
    } catch {
      // 缓存损坏就当没有，重新拉
    }
  }
  // 用 new 排序：default 不是时间序（见文件头第 3 条）。普查要全量，排序不影响覆盖度。
  const url = `https://gamebanana.com/apiv11/Game/${GAME_ID}/Subfeed?_nPage=${page}&_sSort=new`;
  const json = await fetchJson(url);
  writeFileSync(cachePath, JSON.stringify(json, null, 2), "utf8");
  await sleep(REQUEST_GAP_MS);
  return { json, fromCache: false };
}

/** 从 character-images.ts 里抠出站内全部标准角色 key（不 import TS，直接正则） */
function readStandardCharacters() {
  const src = readFileSync(CHARACTER_IMAGES_TS, "utf8");
  const keys = [];
  const re = /^\s*"([^"]+)":\s*"\/character-imgs\//gm;
  let m;
  while ((m = re.exec(src)) !== null) keys.push(m[1]);
  return keys;
}

/**
 * 从标题里取「首段」：`-` / `|` / `–` 之前那截。
 * 例：`Qingxiao - Crimson Blossom Decree` → `Qingxiao`
 *     `Project Gray Raven [PGR] | Lucia`   → `Project Gray Raven [PGR]`
 */
function titleHead(title) {
  const head = String(title ?? "").split(/[-|–—]/)[0];
  return head.replace(/\s+/g, " ").trim();
}

/** 计数 map 的自增 */
function bump(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

/** 按条数降序转成数组 */
function ranked(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  const first = await loadPage(1);
  const total = first.json?._aMetadata?._nRecordCount ?? 0;
  const perPage = first.json?._aMetadata?._nPerpage ?? PER_PAGE;
  const totalPages = Math.ceil(total / perPage);

  console.log(`[probe] GameBanana game ${GAME_ID} -> ${total} feed records, ${totalPages} pages @ ${perPage}/page`);

  // ---- 把 2..N 页并发读/拉到内存 ----
  // 缓存够的话这一段是纯磁盘 IO，不打 API —— 所以改统计口径后重跑几乎是瞬时的。
  const pages = new Array(totalPages + 1);
  pages[1] = first.json?._aRecords ?? [];
  const failedPages = [];
  let nextPage = 2;
  let done = 1;

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(totalPages - 1, 1)) }, async () => {
      for (;;) {
        const page = nextPage++;
        if (page > totalPages) return;
        try {
          const { json } = await loadPage(page);
          pages[page] = json?._aRecords ?? [];
        } catch (err) {
          // 单页失败不中断整批：405 页跑十几分钟，为了 1 页丢掉全部进度不划算。
          // 失败的页记下来，报告里如实写出覆盖率。
          failedPages.push(page);
          console.warn(`[probe] page ${page} FAILED: ${err?.message ?? err}`);
        }
        done++;
        if (done % 40 === 0) console.log(`[probe] ${done}/${totalPages} pages`);
      }
    }),
  );

  if (failedPages.length) {
    console.warn(`[probe] ${failedPages.length} page(s) failed: ${failedPages.sort((a, b) => a - b).join(", ")}`);
  }

  // ---- 按 id 去重 ----
  // 即使 `_sSort=new` 稳定，遍历期间若有新投稿，后面的页会整体位移一位、产生重复。
  // 用 id 归一，顺带把这种漂移的影响降到只有「可能漏 1-2 条最新」。
  const byId = new Map();
  for (let page = 1; page <= totalPages; page++) {
    for (const rec of pages[page] ?? []) {
      const id = rec?._idRow;
      if (id != null && !byId.has(id)) byId.set(id, rec);
    }
  }
  const records = [...byId.values()];
  console.log(`[probe] pages=${totalPages}  unique records=${records.length}  (feed 报告总数 ${total})`);

  // ---- 统计 ----
  // 口径：只有 `_sModelName === "Mod"` 且 `_bHasFiles !== false` 的才是可入库的真实 mod。
  // 见文件头第 1、4 条 —— 不过滤的话映射表里会混进 1600+ 条论坛提问。
  const byModel = new Map();
  const byRoot = new Map();
  const byCombo = new Map();
  const titleHeadsForNoSub = new Map();
  const noSubTitles = [];
  const noSubNoFiles = [];
  let modCount = 0;
  let modFileless = 0;

  for (const rec of records) {
    const model = rec._sModelName?.trim() || "(未知)";
    bump(byModel, model);
    if (model !== "Mod") continue;

    modCount++;

    // 没有文件的 mod（_bHasFiles=false）永远无法下载，入库时会被跳过。
    // 仍计入 root>>sub 统计（分类信息有效），但不进「标题清单」——否则清单里一半是死数据。
    const hasFiles = rec._bHasFiles !== false;
    const root = rec._aRootCategory?._sName?.trim() || "(无根分类)";
    const sub = rec._aSubCategory?._sName?.trim() || "";
    bump(byRoot, root);
    bump(byCombo, sub ? `${root} >> ${sub}` : `${root} >> (空)`);

    if (!hasFiles) {
      modFileless++;
      noSubNoFiles.push({ head: titleHead(rec._sName), root, title: rec._sName ?? "", id: rec._idRow });
      continue;
    }

    if (!sub) {
      bump(titleHeadsForNoSub, titleHead(rec._sName));
      noSubTitles.push({
        head: titleHead(rec._sName),
        root,
        title: rec._sName ?? "",
        likes: rec._nLikeCount ?? 0,
        id: rec._idRow,
      });
    }
  }

  const importable = modCount - modFileless;
  const standardChars = readStandardCharacters();

  // ---- 写报告 ----
  const lines = [];
  lines.push("# GameBanana 鸣潮专区 · 分类普查报告");
  lines.push("");
  lines.push("> 由 `node scripts/probe-gamebanana-categories.mjs` 生成，只读不改库。");
  lines.push("> 本报告是 `docs/gamebanana-integration-prd.md` 里 Phase 0 的产出物 ——");
  lines.push("> 写 `scripts/gamebanana-classify.mjs` 的映射表必须以它为准，不得靠猜。");
  lines.push("");
  lines.push("## 0. 口径说明（先读这一节）");
  lines.push("");
  lines.push("GameBanana 的 Subfeed 是一个**混合流**，里面不只有 MOD。统计前必须按 `_sModelName` 过滤，");
  lines.push("否则论坛提问与求物帖会混进映射表。下面所有统计（除本节外）**只针对**");
  lines.push("`_sModelName === \"Mod\"` **且** `_bHasFiles !== false` 的记录 —— 即真正可下载、可入库的那批。");
  lines.push("");
  lines.push("### 全量 feed 的类型分布（未过滤）");
  lines.push("");
  lines.push("| `_sModelName` | 条数 | |");
  lines.push("|---|---|---|");
  for (const [name, count] of ranked(byModel)) {
    const mark = name === "Mod" ? "✅ 正文口径" : "❌ 已排除";
    lines.push(`| ${name} | ${count} | ${mark} |`);
  }
  lines.push("");
  lines.push("### 其他实测结论（正式同步脚本必须照做）");
  lines.push("");
  lines.push("| 项 | 实测结果 |");
  lines.push("|---|---|");
  lines.push("| 分页参数 | `_nPerPage` / `_nPerpage` / `_per_page` / `_nLimit` **全部被忽略**，硬编码 15 条/页 |");
  lines.push("| 全量遍历成本 | 405 次请求，无捷径 |");
  lines.push("| `_sSort=default` | **不是时间序**（同页内 2026-09-27 与 2024-09-06 混排），不可用于增量 |");
  lines.push("| `_sSort=new` | **严格时间倒序**，增量同步用这个 |");
  lines.push("| `_sSort=updated` | 可用，但语义不同（记录数 1432，疑似近期有更新的子集） |");
  lines.push("| `_sSort=popular/likes/downloads/best` | **一律 400**，服务端不支持按热度排序 |");
  lines.push("| 下载链 | `https://gamebanana.com/mods/download/{_idRow}`，可由 id 直接构造 |");
  lines.push("| 列表接口缺字段 | Subfeed **不含** `_aContentRatings` / `_aFiles` / `_nDownloadCount`，要逐条调 `Mod/{id}/ProfilePage` |");
  lines.push("");
  lines.push("## 1. 概览");
  lines.push("");
  lines.push("| 项 | 值 |");
  lines.push("|---|---|");
  lines.push(`| GameBanana game id | \`${GAME_ID}\` |`);
  lines.push(`| feed 报告总数 | ${total} |`);
  lines.push(`| 抓取分页 | ${totalPages} 页 |`);
  lines.push(`| 抓取失败页 | ${failedPages.length ? failedPages.sort((a, b) => a - b).join(", ") : "无"} |`);
  lines.push(`| 去重后实际读到 | ${records.length}（覆盖 ${((records.length / Math.max(total, 1)) * 100).toFixed(1)}%） |`);
  lines.push(`| 其中 \`_sModelName=Mod\` | ${modCount} |`);
  lines.push(`| 其中无文件（跳过） | ${modFileless} |`);
  lines.push(`| **可入库（Mod + 有文件）** | **${importable}** |`);
  lines.push(`| 其中无子分类（只能靠标题猜） | ${noSubTitles.length}（${((noSubTitles.length / Math.max(importable, 1)) * 100).toFixed(1)}%） |`);
  lines.push(`| 站内现有标准角色（合法取值域） | ${standardChars.length} 个 |`);
  lines.push("");
  lines.push("## 2. 根分类分布（仅可入库记录）");
  lines.push("");
  lines.push("| 根分类 | 条数 |");
  lines.push("|---|---|");
  for (const [name, count] of ranked(byRoot)) lines.push(`| ${name} | ${count} |`);
  lines.push("");
  lines.push("## 3. 完整 `根分类 >> 子分类` 表（仅可入库记录）");
  lines.push("");
  lines.push("**这张表是映射模块的输入。** 每行都要在映射表里有记录，");
  lines.push("目标值**必须**是下面第 6 节里已有的角色 key。");
  lines.push("");
  lines.push("| 根分类 >> 子分类 | 条数 |");
  lines.push("|---|---|");
  for (const [name, count] of ranked(byCombo)) lines.push(`| ${name} | ${count} |`);
  lines.push("");
  lines.push("## 4. 无子分类记录的「标题首段」分布（仅可入库）");
  lines.push("");
  lines.push("首段 = 标题里第一个 `-` / `|` 之前的那一截。这批是标题关键词映射的候选词。");
  lines.push("");
  lines.push("| 标题首段 | 条数 |");
  lines.push("|---|---|");
  for (const [name, count] of ranked(titleHeadsForNoSub)) lines.push(`| ${name} | ${count} |`);
  lines.push("");
  lines.push("## 5. 无子分类记录的完整标题清单（仅可入库）");
  lines.push("");
  lines.push(`共 ${noSubTitles.length} 条，按点赞降序。人工判定这批属于哪个角色。`);
  lines.push("");
  lines.push("| gb_id | 点赞 | 标题首段 | 标题 |");
  lines.push("|---|---|---|---|");
  for (const r of noSubTitles.sort((a, b) => b.likes - a.likes)) {
    lines.push(`| ${r.id} | ${r.likes} | ${r.head} | ${r.title} |`);
  }
  lines.push("");
  lines.push("## 6. 站内现有标准角色（合法取值域，共 " + standardChars.length + " 个）");
  lines.push("");
  lines.push("来源：`src/lib/constants/character-images.ts` 的 `characterImageMap`。");
  lines.push("**任何映射的目标值都必须在这一节里**，否则前台角色分类页会长出计划外的新分类（CLAUDE.md 硬规则）。");
  lines.push("");
  lines.push(standardChars.map((c) => `\`${c}\``).join(" · "));
  lines.push("");
  lines.push("## 7. 附：无子分类但无文件的记录（仅留档，不参与映射）");
  lines.push("");
  lines.push(`共 ${noSubNoFiles.length} 条，入库时会因 \`_bHasFiles=false\` 被跳过。`);
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");

  // ---- 控制台摘要（纯 ASCII，避免 Windows 控制台代码页乱码）----
  console.log("");
  console.log("=== _sModelName (ALL feed records) ===");
  for (const [name, count] of ranked(byModel)) console.log(String(count).padStart(6), name);
  console.log("");
  console.log(`=== Mod only: ${modCount} total, ${modFileless} fileless, ${importable} importable ===`);
  console.log("");
  console.log("=== ROOT CATEGORIES (importable) ===");
  for (const [name, count] of ranked(byRoot)) console.log(String(count).padStart(6), name);
  console.log("");
  console.log("=== TOP 40  root >> sub (importable) ===");
  for (const [name, count] of ranked(byCombo).slice(0, 40)) console.log(String(count).padStart(6), name);
  console.log("");
  console.log("=== TOP 40  title-head, no subcategory (importable) ===");
  for (const [name, count] of ranked(titleHeadsForNoSub).slice(0, 40)) console.log(String(count).padStart(6), name);
  console.log("");
  console.log(`[probe] no-subcategory: ${noSubTitles.length} / ${importable} importable`);
  console.log(`[probe] report written -> ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error("[probe] FAILED:", err?.message ?? err);
  process.exitCode = 1;
});
