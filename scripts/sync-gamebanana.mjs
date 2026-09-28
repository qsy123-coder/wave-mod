#!/usr/bin/env node
/**
 * GameBanana → gamebanana_mods 同步脚本。
 *
 * 用法:
 *   node scripts/sync-gamebanana.mjs --dry-run            # 只抓不下库，打印统计与样例
 *   node scripts/sync-gamebanana.mjs --seed=300           # 首次铺库：补 300 条新的
 *   node scripts/sync-gamebanana.mjs --all                # 全量补齐（约 28 分钟）
 *   node scripts/sync-gamebanana.mjs                      # 增量：抓到「整页都已入库」就停
 *   node scripts/sync-gamebanana.mjs --seed=5 --max-pages=3
 *
 * ── API 口径（2026-09-28 实测，几处与直觉相反，改动前务必先看）────────────
 *
 * 1. 列表用 `Game/20357/Subfeed?_nPage=N&_sSort=new`。
 *    - 混合流，必须按 `_sModelName === "Mod"` 过滤（里面还有 Sound / Screenshot 等）。
 *    - **分页参数 `_nPerPage` 之类全部无效，恒定 15 条/页**。405 页 = 3057 条 Mod。
 *    - **必须用 `_sSort=new`**。默认排序不确定，翻页会重复+漏取（实测 338 页里 18 条重复）。
 *
 * 2. Subfeed 记录里**没有文件信息**（无 `_sDownloadUrl`、无 `_aFiles`），
 *    只有 `_bHasFiles`（实测 3057 条全是 true，**没有过滤力，别拿它当条件**）。
 *    所以下载链接必须逐条拉 `Mod/{id}/ProfilePage` 才有。
 *
 * 3. 下载链接取 **`_aFiles[0]._sDownloadUrl`**（形如 https://gamebanana.com/dl/1828295），
 *    它会 302 到 `filecache4X.gamebanana.com/mods/xxx.rar|zip|7z`，是**真文件**，
 *    带个 UA 就能热链。
 *    ⚠️ **不要用 mod 级的 `_sDownloadUrl`** —— 它是 `/mods/download/{id}`，
 *    实测跟随重定向后是 **200 text/html 的 22KB 中转页**，不是文件。
 *    ⚠️ 也不是 `/mods/download/{modId}` 能构造出来的：那个形式对不用它的 mod 同样只回 HTML。
 *
 * 4. ProfilePage **会失败**（24 条抽样挂 3 条，12.5%），必须带重试，否则会静默漏条。
 *
 * 5. 图片：`_aPreviewMedia._aImages[]`，每项 `_sBaseUrl` + 各尺寸文件名。
 *    ⚠️ **只有首图有全套尺寸**（100/220/530/800），第 2 张起常常**只有 `_sFile100`**。
 *    所以取图必须逐级退化：530 → 220 → 100 → 原图 `_sFile`。写死 `_sFile530` 会拼出 404。
 *
 * ── 写库口径 ──────────────────────────────────────────────────────────────
 * 主键 `gb_id = _idRow`，`on conflict do update` 天然幂等。
 * 但 `is_published`（人工下架）与 `created_at` **不在更新列里** —— 重跑不许覆盖人工状态。
 * `character` 每次重算，这是故意的：分类规则改了以后重跑即生效。
 * 本表**不参与**每日上传脚本的去重键（那是 `mods.character|title`），两表互不影响；
 * 跑完仍会回归验证「每日脚本待上传 = 0」。
 *
 * ── 兜底快照 ──────────────────────────────────────────────────────────────
 * 真有写入时收尾会自动：重导本表快照 → 传 COS → ping /api/revalidate。
 * 网关被锁（全站 402）时 `/gamebanana` 读的就是那份快照，**不重发等于没同步**。
 * 这一份是**独立的产物**（data/gamebanana-snapshot.json.gz，对象键
 * snapshots/gamebanana-snapshot.json.gz），与 `mods` 那份互不覆盖 ——
 * 后者被桌面端 JASM 共用，不能往里加表。见 scripts/gamebanana-snapshot.mjs。
 */

import { resolve } from "node:path";
import { config } from "dotenv";

import { assertCharacterInDomain, characterKeys, classify } from "./gamebanana-classify.mjs";
import { publishGamebananaSnapshotBestEffort } from "./gamebanana-snapshot.mjs";
import { notifyRevalidate } from "./mods-snapshot-export.mjs";
import { dollarQuote, psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

/** Wuthering Waves 在 GameBanana 的 game id */
const GAME_ID = 20357;
const API = "https://gamebanana.com/apiv11";

/**
 * 带身份信息的 UA。GameBanana 是免费公开 API，写清楚是谁、附上站点，
 * 出问题时对方能找得到人，比伪装成浏览器体面。
 */
const UA = { "User-Agent": "WaveMod/1.0 (+https://www.wave-mod.top)" };

/** 站点地址：默认线上域名；本地调试可设 WAVE_MOD_SITE_URL=http://localhost:3000 */
const SITE_URL = process.env.WAVE_MOD_SITE_URL?.trim() || "https://www.wave-mod.top";

/** 一页恒定 15 条，仅用于估算进度 */
const PER_PAGE = 15;

/**
 * 详情页图片最多存几张。实测有单条 50 张的，全存下来详情页要热链 50 个外部请求。
 * 8 张足够看清一个换装 mod，超出的靠「去 GameBanana 看全部」兜底。
 */
const MAX_IMAGES = 8;

/** ProfilePage 并发数。12 路时抽样失败率 12.5%，6 路 + 重试更稳也更礼貌 */
const CONCURRENCY = 6;

/** 单请求重试次数（ProfilePage 实测会间歇失败，不重试就是静默漏条） */
const RETRIES = 3;

const nowIso = () => new Date().toISOString();
const unixToIso = (sec) => (Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000).toISOString() : null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================== CLI ====================

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isAll = args.includes("--all");

/** 读 --name=value 形式的参数 */
function argValue(name) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : null;
}

const seedArg = argValue("seed");
const seedCount = seedArg === null ? null : Number(seedArg);
if (seedCount !== null && (!Number.isInteger(seedCount) || seedCount <= 0)) {
  console.error(`❌ --seed 需要一个正整数，实得「${seedArg}」`);
  process.exit(1);
}

/**
 * 增量模式最多翻多少页。默认 50 页（=750 条）是个安全网：
 * 正常增量第一页就该撞上「全已入库」而停；翻到 50 页还在进，说明去重或分页坏了。
 */
const maxPagesArg = argValue("max-pages");
const maxPages = isAll
  ? Number.POSITIVE_INFINITY
  : maxPagesArg
    ? Number(maxPagesArg)
    : seedCount !== null
      ? Math.ceil(seedCount / PER_PAGE) * 3 + 5
      : 50;

// ==================== HTTP ====================

/**
 * 取 JSON，失败重试。
 *
 * ProfilePage 实测会间歇性失败（24 条抽样里挂 3 条），一次失败就跳过等于静默漏条，
 * 而漏条**不会有任何报错**——所以这里必须退避重试，重试完还失败才计入 failed 清单。
 */
async function fetchJson(url, { retries = RETRIES } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      // 1s / 2s / 4s 退避。失败多半是对端限流或链路抖动，立刻重试只会更糟。
      if (attempt < retries) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${url} 重试 ${retries} 次仍失败: ${lastErr.message}`);
}

/**
 * 定长并发池。按序返回结果，某个任务抛错只在它自己的位置上变成 {error}，
 * 不拖垮整批 —— 单条失败不该让一次 28 分钟的全量同步白跑。
 */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        out[i] = await worker(items[i], i);
      } catch (err) {
        out[i] = { error: err.message, input: items[i] };
      }
    }
  });
  await Promise.all(runners);
  return out;
}

// ==================== 解析 ====================

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * 拼图片 URL，逐级退化 530 → 220 → 100 → 原图。
 *
 * ⚠️ 实测只有首图有全套尺寸，第 2 张起往往只有 `_sFile100`。
 * 写死 `_sFile530` 会拼出一个 404 的 URL（而且前台是坏图，不会报错）。
 */
function imageUrl(img) {
  const base = str(img?._sBaseUrl);
  if (!base) return null;
  const file = img._sFile530 ?? img._sFile220 ?? img._sFile100 ?? img._sFile;
  return str(file) ? `${base}/${file}` : null;
}

/** 首图的大图（800），列表/详情封面用；没有 800 就退到 530 */
function coverUrl(img) {
  const base = str(img?._sBaseUrl);
  if (!base) return null;
  const file = img._sFile800 ?? img._sFile530 ?? img._sFile220 ?? img._sFile;
  return str(file) ? `${base}/${file}` : null;
}

/**
 * HTML → 纯文本。
 *
 * 描述存纯文本而不是原 HTML：前台要渲染它，存 HTML 就等于给自己开一个 XSS 面。
 * 这里不追求完美还原排版，只要「人话读得通」。
 */
function stripHtml(html) {
  if (!html) return null;
  const text = String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "· ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

/**
 * GameBanana 自己的三级可见性 → 本表 visibility。
 *
 * 采信平台的分级而不是自己猜：实测标题含 nude/全裸/lewd/nsfw 的 147 条里 144 条(98%)
 * 被判 hide，反例只有 1 条。
 * ⚠️ **不要用 `_bHasContentRatings`**：太宽，101 条泳装里 77 条为 true，按它标会把半个库
 * 错标成成人内容（详见 supabase/add_gamebanana_mods.sql 的注释）。
 *
 * 取不到值时落 `warn` 而不是 `show`：分级缺失时**宁可多提示一次，不可漏放行**。
 */
function normalizeVisibility(v) {
  const s = str(v);
  return s === "show" || s === "warn" || s === "hide" ? s : "warn";
}

/** 从 Subfeed 记录抽出本表要用的字段（不含需要 ProfilePage 的那几列） */
function fromSubfeed(r) {
  const images = (r._aPreviewMedia?._aImages ?? []).map(imageUrl).filter(Boolean);
  return {
    gb_id: r._idRow,
    title: str(r._sName) ?? `(无标题 #${r._idRow})`,
    gb_root_category: str(r._aRootCategory?._sName),
    gb_subcategory: str(r._aSubCategory?._sName),
    images: images.slice(0, MAX_IMAGES),
    cover_url: coverUrl(r._aPreviewMedia?._aImages?.[0]) ?? images[0] ?? null,
    author_name: str(r._aSubmitter?._sName),
    author_url: str(r._aSubmitter?._sProfileUrl),
    version: str(r._sVersion),
    visibility: normalizeVisibility(r._sInitialVisibility),
    like_count: Number(r._nLikeCount) || 0,
    view_count: Number(r._nViewCount) || 0,
    gb_created_at: unixToIso(r._tsDateAdded),
    gb_updated_at: unixToIso(r._tsDateModified ?? r._tsDateUpdated),
    // 兜底：万一 ProfilePage 拿不到文件链接，至少指向 mod 页面，不留空
    profile_url: str(r._sProfileUrl) ?? `https://gamebanana.com/mods/${r._idRow}`,
  };
}

/**
 * 墓碑文件判定。
 *
 * GameBanana 删掉文件本体后**会留一条记录**：文件名变成
 * `the_file_has_been_deleted_with_only_a_record_retained.7z`（257 字节），
 * `_sDescription` 写「The file has been deleted, with only a record retained」。
 * 不滤掉的话，前台会挂一个 257 字节的「下载」按钮 —— 点下去下到一个说明文件。
 *
 * ⚠️ **`_bHasContents` 识别不出来**：实测墓碑文件上它**仍是 `true`**，`_bIsArchived`
 *    也是 `false`。两个直觉上该管用的字段都不管用，只能看文件名/说明。
 */
const TOMBSTONE_RE =
  /has_been_deleted|has been deleted|only_a_record_retained|only a record retained|file (?:has been )?removed/i;

/** 真实 mod 压缩包不可能小于 1KB（墓碑是 257B）。用来兜住没写说明的墓碑。 */
const MIN_USABLE_BYTES = 1024;

function isTombstone(f) {
  if (TOMBSTONE_RE.test(`${f?._sFile ?? ""} ${f?._sDescription ?? ""}`)) return true;
  return Number.isFinite(f?._nFilesize) && f._nFilesize < MIN_USABLE_BYTES;
}

/**
 * 取主文件：`_aFiles` 里第一个不是墓碑的。
 *
 * 用「第一个可用」而不是「最大的」：多文件时 index 0 实测就是主版本
 * （如 720744 的 535 次下载 vs 备选的 295 次），换版本时作者会新加一条而不是改旧的。
 *
 * @returns 文件对象；`null` 表示这个 mod 已经没有可下载的东西了
 */
function pickFile(files) {
  return (files ?? []).find((f) => !isTombstone(f)) ?? null;
}

/**
 * 拉 Detail 补 Subfeed 给不出的列。
 *
 * 返回的字段里 `download_url` 是**文件级**链接（`_aFiles[0]._sDownloadUrl`），
 * 不是 mod 级的 `/mods/download/{id}`（那个是 HTML 中转页，见文件头）。
 */
async function fetchProfile(gbId) {
  const j = await fetchJson(`${API}/Mod/${gbId}/ProfilePage`);

  // ⚠️ 必须校验 payload 确实是这个 id 的详情。
  // 实测 `Mod/undefined/ProfilePage` 这类请求会返回 **HTTP 200** 带一个没有 `_aFiles`
  // 的残缺 JSON —— 只看 status 的话既不报错也不重试，文件链接、大小、AV 结果全静默变空。
  if (j?._idRow !== gbId) {
    throw new Error(`payload 不是 #${gbId} 的详情（_idRow=${j?._idRow ?? "缺失"}），按失败重试`);
  }

  const file = pickFile(j._aFiles);
  return {
    description: stripHtml(j._sText ?? j._sDescription),
    // 文件级直链；没有可用文件时退到 mod 页面（仍可人工下载），绝不落 null（列是 NOT NULL）
    download_url: str(file?._sDownloadUrl),
    file_size: Number.isFinite(file?._nFilesize) ? file._nFilesize : null,
    av_status: str(file?._sAvResult),
    download_count: Number(j._nDownloadCount) || 0,
    // 详情拉成功了、但一个可用文件都没有（全是墓碑）→ 这条不该入库
    hasUsableFile: Boolean(file),
  };
}

/**
 * 合并成一行。character 在这里定，越界直接抛错 —— 写进库会让前台多出一个空分类。
 */
function buildRow(sub, profile) {
  const { character, via } = classify({
    title: sub.title,
    subcategory: sub.gb_subcategory,
    rootCategory: sub.gb_root_category,
  });
  assertCharacterInDomain(character);

  return {
    row: {
      gb_id: sub.gb_id,
      title: sub.title,
      character,
      gb_root_category: sub.gb_root_category,
      gb_subcategory: sub.gb_subcategory,
      description: profile?.description ?? null,
      images: sub.images,
      cover_url: sub.cover_url,
      download_url: profile?.download_url ?? sub.profile_url,
      author_name: sub.author_name,
      author_url: sub.author_url,
      version: sub.version,
      visibility: sub.visibility,
      like_count: sub.like_count,
      view_count: sub.view_count,
      download_count: profile?.download_count ?? 0,
      file_size: profile?.file_size ?? null,
      av_status: profile?.av_status ?? null,
      gb_created_at: sub.gb_created_at,
      gb_updated_at: sub.gb_updated_at,
      // 以下三列是 NOT NULL 且有 default，但 jsonb_populate_recordset 对缺失的 key 给 NULL
      // 而不是 default，所以必须显式带上，否则 insert 直接违反非空约束。
      synced_at: nowIso(),
      is_published: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    via,
  };
}

// ==================== 写库 ====================

/** 与表定义一致的列清单。NOT NULL 列一个都不能少，理由见 buildRow 的注释。 */
const INSERT_COLUMNS = [
  "gb_id",
  "title",
  "character",
  "gb_root_category",
  "gb_subcategory",
  "description",
  "images",
  "cover_url",
  "download_url",
  "author_name",
  "author_url",
  "version",
  "visibility",
  "like_count",
  "view_count",
  "download_count",
  "file_size",
  "av_status",
  "gb_created_at",
  "gb_updated_at",
  "synced_at",
  "is_published",
  "created_at",
  "updated_at",
];

/**
 * 编 upsert 语句。
 *
 * 用 jsonb_populate_recordset 让 Postgres 按真实列类型自己解析 —— text[]、
 * timestamptz 都不必手写转义，标题里的引号 / 反斜杠 / 换行都不会把 SQL 拼坏。
 *
 * `xmax = 0` 区分本次是新插还是更新，用来汇报「新增 N / 刷新 M」。
 * `is_published` 与 `created_at` **故意不在 do update 里**：前者是人工下架状态，
 * 后者是首次入库时间，重跑都不该覆盖。
 */
function buildUpsertSql(batch) {
  const columnList = INSERT_COLUMNS.join(", ");
  const selectList = INSERT_COLUMNS.map((c) => `j.${c}`).join(", ");
  const updateList = INSERT_COLUMNS.filter((c) => c !== "gb_id" && c !== "is_published" && c !== "created_at")
    .map((c) => `${c} = excluded.${c}`)
    .join(",\n      ");

  return `
with incoming as (
  select * from jsonb_populate_recordset(null::gamebanana_mods, ${dollarQuote(JSON.stringify(batch))}::jsonb)
),
up as (
  insert into gamebanana_mods (${columnList})
  select ${selectList} from incoming j
  on conflict (gb_id) do update set
      ${updateList}
  returning (xmax = 0) as is_insert
)
select json_build_object(
  'inserted', count(*) filter (where is_insert),
  'updated',  count(*) filter (where not is_insert)
)::text from up;
`;
}

// ==================== 主流程 ====================

async function main() {
  const t0 = Date.now();
  const mode = isDryRun
    ? "DRY-RUN"
    : isAll
      ? "全量补齐"
      : seedCount !== null
        ? `铺库 seed=${seedCount}`
        : "增量";
  console.log(`🍌 GameBanana 同步 — 模式: ${mode}${isDryRun ? "（不写库）" : ""}`);
  console.log(`   game=${GAME_ID} 页数上限=${maxPages === Infinity ? "不限" : maxPages}\n`);

  const databaseUrl = requireDatabaseUrl();

  // ── 1. 先读库内已有 id ────────────────────────────────────────────────
  // 增量模式的停机条件、以及「新增 vs 刷新」的汇报都靠这个集合。
  const existingIds = new Set(
    (await psqlJson(`select coalesce(json_agg(gb_id), '[]'::json)::text from public.gamebanana_mods;`)) ?? []
  );
  console.log(`🗄  库内已有 ${existingIds.size} 条\n`);

  // ── 2. 翻 Subfeed，收集待处理的 Mod ───────────────────────────────────
  // 按 `_sSort=new` 从新到旧翻。停机条件分三种模式，见下。
  const collected = [];
  const seen = new Set();
  let page = 1;
  let stopReason = "";

  for (; page <= maxPages; page++) {
    let json;
    try {
      json = await fetchJson(`${API}/Game/${GAME_ID}/Subfeed?_nPage=${page}&_sSort=new`);
    } catch (err) {
      console.error(`❌ 第 ${page} 页拉取失败: ${err.message}`);
      break;
    }

    const records = json._aRecords ?? [];
    if (records.length === 0) {
      stopReason = `第 ${page} 页无记录，已到末页`;
      break;
    }

    // 混合流：只留 Mod。Sound / Screenshot / 其它模型都不是我们要搬运的对象。
    const mods = records.filter((r) => r._sModelName === "Mod");

    // `_bIsObsolete` 是**唯一**有过滤力的字段（`_bHasFiles` 实测 3057 条全 true）。
    // 先用原始记录算去重，再统一映射成待写入的形状。
    const freshRaw = mods.filter((r) => r._bIsObsolete !== true && !seen.has(r._idRow));
    for (const r of freshRaw) seen.add(r._idRow);

    const newOnPage = freshRaw.filter((r) => !existingIds.has(r._idRow));
    collected.push(...freshRaw.map(fromSubfeed));

    const collectedNew = collected.filter((r) => !existingIds.has(r.gb_id)).length;
    if (page % 10 === 0 || page === 1) {
      console.log(`   …第 ${page} 页：本页 Mod ${mods.length}，累计 ${collected.length}，其中新 ${collectedNew}`);
    }

    if (seedCount !== null && collectedNew >= seedCount) {
      stopReason = `已凑够 ${seedCount} 条新的`;
      break;
    }

    // 增量模式：一整页的 Mod **全都已入库** → 说明已经追平，后面的只会更旧。
    // 注意判据是「本页有 Mod 且全是旧的」；某页恰好没有 Mod 时不能据此停机。
    if (!isAll && seedCount === null && mods.length > 0 && newOnPage.length === 0) {
      stopReason = `第 ${page} 页起无新内容，已追平`;
      break;
    }
  }

  const targets = collected.filter((r) => !existingIds.has(r.gb_id));
  const limited = seedCount !== null ? targets.slice(0, seedCount) : targets;

  console.log(`\n📄 已翻 ${Math.min(page, maxPages)} 页，收集 Mod ${collected.length} 条`);
  console.log(`   其中库内没有的 ${targets.length} 条${stopReason ? `（${stopReason}）` : ""}`);
  if (limited.length !== targets.length) console.log(`   本次只处理 ${limited.length} 条（seed 上限）`);

  if (limited.length === 0) {
    console.log("\n✅ 没有新内容，无需写库。");
    return;
  }

  // ── 3. 逐条拉 ProfilePage 补下载链接等 ────────────────────────────────
  // 只需给「新的」拉：已入库的旧记录下载链接上轮就有了。
  console.log(`\n🔎 拉取 ${limited.length} 条 ProfilePage（并发 ${CONCURRENCY}，最多重试 ${RETRIES} 次）…`);
  const profiles = await pool(limited, CONCURRENCY, (r) => fetchProfile(r.gb_id));

  const failed = profiles.filter((p) => p?.error);
  if (failed.length) {
    console.warn(`⚠️  ${failed.length} 条 ProfilePage 拉取失败，这些行会用 mod 页面兜底 download_url：`);
    for (const f of failed.slice(0, 10)) console.warn(`     #${f.input}: ${f.error}`);
    if (failed.length > 10) console.warn(`     …另有 ${failed.length - 10} 条`);
  }

  // ── 4. 分类 + 编行 ───────────────────────────────────────────────────
  const built = [];
  const skipped = [];
  for (const [i, sub] of limited.entries()) {
    const profile = profiles[i]?.error ? null : profiles[i];
    // 详情拉成功、却一个可用文件都没有 → 是墓碑记录，不入库。
    // 注意只在**拉成功**时才据此丢弃：拉失败的走 mod 页面兜底，那是「没拿到」不是「不存在」。
    if (profile && !profile.hasUsableFile) {
      skipped.push(sub);
      continue;
    }
    built.push({ sub, ...buildRow(sub, profile) });
  }

  if (skipped.length) {
    console.warn(`⚠️  跳过 ${skipped.length} 条：GameBanana 上文件已被删除（只剩墓碑记录），没有可下载的东西`);
    for (const s of skipped.slice(0, 8)) console.warn(`     #${s.gb_id} ${s.title.slice(0, 56)}`);
    if (skipped.length > 8) console.warn(`     …另有 ${skipped.length - 8} 条`);
  }

  if (built.length === 0) {
    console.log("\n✅ 没有可入库的内容（全部被跳过）。");
    return;
  }

  const byCharacter = {};
  const byVia = {};
  const byVisibility = {};
  let noDownload = 0;
  for (const b of built) {
    byCharacter[b.row.character] = (byCharacter[b.row.character] ?? 0) + 1;
    byVia[b.via] = (byVia[b.via] ?? 0) + 1;
    byVisibility[b.row.visibility] = (byVisibility[b.row.visibility] ?? 0) + 1;
    // 兜底到 mod 页面的（不是文件级直链）
    if (b.row.download_url === b.sub.profile_url) noDownload++;
  }

  console.log("\n=== 角色分布（本次）===");
  for (const [k, n] of Object.entries(byCharacter).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
  console.log("\n=== 可见性分布 ===");
  for (const [k, n] of Object.entries(byVisibility).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
  console.log("\n=== 判定依据分布 ===");
  for (const [k, n] of Object.entries(byVia).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
  if (noDownload) console.log(`\n⚠️  ${noDownload} 条拿不到文件级直链，download_url 落的是 mod 页面`);

  // 值域终检：classify 已经断言过，这里再按整批复查一次 —— 写库前的最后一道闸。
  const domain = new Set(characterKeys());
  const outOfDomain = built.map((b) => b.row.character).filter((c) => !domain.has(c));
  if (outOfDomain.length) {
    console.error(`\n❌ 有 ${outOfDomain.length} 行的 character 越界: ${[...new Set(outOfDomain)].join(", ")}`);
    console.error("   绝不写库 —— 会在前台长出计划外的角色分类（CLAUDE.md 硬规则）。");
    process.exit(1);
  }

  console.log("\n=== 样例 ===");
  for (const b of built.slice(0, 5)) {
    const mb = b.row.file_size ? `${(b.row.file_size / 1048576).toFixed(1)}MB` : "大小未知";
    console.log(`   ${b.row.character} | ${b.row.title.slice(0, 48)}`);
    console.log(`      GB分类: ${b.row.gb_root_category ?? "-"} >> ${b.row.gb_subcategory ?? "-"}`);
    console.log(`      ${b.row.visibility} | ${mb} | av=${b.row.av_status ?? "-"} | 图 ${b.row.images.length} | ${b.via}`);
    console.log(`      ${b.row.download_url}`);
  }

  if (isDryRun) {
    console.log(`\n🔍 DRY-RUN 结束，未写库。用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  // ── 5. 写库 ─────────────────────────────────────────────────────────
  // 分批 upsert：一条语句塞 3000 行会让 JSON 与 SQL 文本都过大。
  const BATCH = 200;
  let inserted = 0;
  let updated = 0;
  console.log(`\n💾 写入 ${built.length} 条（每批 ${BATCH}）…`);
  for (let i = 0; i < built.length; i += BATCH) {
    const batch = built.slice(i, i + BATCH).map((b) => b.row);
    const res = await psqlJson(buildUpsertSql(batch));
    inserted += Number(res?.inserted ?? 0);
    updated += Number(res?.updated ?? 0);
    console.log(`   ${Math.min(i + BATCH, built.length)}/${built.length}（新增 ${inserted} / 刷新 ${updated}）`);
  }

  console.log(`\n✅ 写库完成：新增 ${inserted} 条，刷新 ${updated} 条`);

  // ── 6. 刷新并发布兜底快照 ────────────────────────────────────────────
  // 这一步是**必须的**，不是顺手补的：网关被锁（exceed_egress_quota → 全站 402）时
  // /gamebanana 读的就是这份快照，不重发等于「同步成功了但锁定期内前台看不到」。
  // 只告警不翻红（数据已经入库），细节见 gamebanana-snapshot.mjs。
  await publishGamebananaSnapshotBestEffort();

  // ── 7. 通知前台刷缓存 ────────────────────────────────────────────────
  // 顺序不能反：**先发布快照、再 ping**。ping 会清掉快照缓存条目，若先 ping 后上传，
  // ping 之后第一个走到回退的请求会把 COS 上的旧对象重新拉下来缓存一整个 TTL。
  //
  // ping 无论如何都要打：列表缓存（tag `gamebanana`）与快照缓存是两条独立的条目，
  // 快照发送失败时列表那份照样得失效 —— 而那时没有新对象，也就不存在上面说的顺序问题。
  await notifyRevalidate({ siteUrl: SITE_URL, secret: process.env.REVALIDATE_SECRET?.trim() });

  const total = await psqlJson(`select count(*)::text from public.gamebanana_mods;`);
  console.log(`🗄  库内总计 ${total} 条。用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(`\n❌ 同步失败: ${err.message}`);
  process.exit(1);
});
