/**
 * 后台「批量上传」页：把同一 GameBanana 帖子的多个附件合并成一条记录。
 *
 * 每日脚本靠 `.mod-groups.json`（命名工坊落盘）合并；后台页最好也传这份清单，
 * 这样变体标签与每日脚本完全一致（`Base SFW` / `Thicc NSFW` …）。
 * 没传清单时用**名字推断**兜底：同一作者、基础名去掉末尾编号后相同，才算同一个帖子。
 *
 * 纯函数：不碰文件系统、不依赖浏览器 API，Node 与 Next 都能 import。
 */

import { authorlessVariantKey, normalizeGroupKey, stripAuthorTag } from "./mod-groups-pure.mjs";
import { postGalleryKey } from "./image-name-match.mjs";
import { resolveCharacterAndTitle } from "./daily-classify.mjs";

/** 后台页单条 mod 的图片上限（与 batch-upload schema 的 max(20) 一致） */
const MAX_IMAGES = 20;

/**
/**
 * 清单索引。两级：
 * - `strict`：摘掉作者、保留 `_1`/`-2` 版本编号后逐字比对（主判据）；
 * - `loose`：`normalizeGroupKey` 兜底（会削掉末尾编号）。
 *
 * 2026-11-13 之前只有 `loose`，而夸克导出把分享名里的 ` by 作者` 去掉了：
 * 清单里是 `男漂-联动灵感服装_1 by Quzmick`，CSV 里是 `男漂-联动灵感服装_1`，
 * 两边都条条落空 ⇒ 整批退化成逐条入库，即使手工传了 JSON 也照样合不上。
 *
 * 同一个严格键命中**多个不同清单项**时不登记 —— 那是真的无法判断，不能猜。
 */
function manifestHitsByKey(manifest) {
  const hits = new Map();
  const loose = new Map();
  if (!manifest?.groups) return { strict: hits, loose };

  const conflicts = new Set();
  const remember = (map, key, value, onConflict) => {
    if (!key) return;
    if (map.has(key) && map.get(key) !== value) onConflict(key);
    else map.set(key, value);
  };

  const valueOf = (group, variant) => ({ group, variant });

  for (const group of Object.values(manifest.groups)) {
    const variants = Array.isArray(group?.variants) ? group.variants : [];
    for (const variant of variants) {
      const value = valueOf(group, variant);
      for (const raw of [variant.name, variant.localName, variant.sourceName]) {
        remember(hits, authorlessVariantKey(raw), value, (key) => conflicts.add(key));
        remember(loose, normalizeGroupKey(raw), value, () => {});
      }
    }
  }

  for (const key of conflicts) hits.delete(key);
  return { strict: hits, loose };
}

function rawCandidates(row) {
  return [row.sourceKey, row.title].filter(Boolean);
}

function hitForRow(row, hits) {
  if (!hits) return null;
  const { strict, loose } = hits;

  for (const raw of rawCandidates(row)) {
    const hit = strict.get(authorlessVariantKey(raw));
    if (hit) return hit;
  }
  for (const raw of rawCandidates(row)) {
    const hit = loose.get(normalizeGroupKey(raw));
    if (hit) return hit;
  }
  return null;
}

/**
 * 该行归到哪个帖子：清单模式用 postUrl，推断模式用 `postGalleryKey`。
 * 推断只接受带 ` by 作者` 的名字，否则 `夏空-校服-粉` 这类标题里带编号的
 * 完全可能是不同 mod，宁可不合并。
 */
function bucketFor(row, hits) {
  const hit = hits ? hitForRow(row, hits) : null;
  if (hit) return { key: `manifest::${hit.group.postUrl}`, hit, inferred: false };
  // 传了清单就只按清单合并：清单外的名字推断可能误并，宁可多一张卡
  if (hits) return null;

  const galleryKey = postGalleryKey(row.sourceKey) ?? postGalleryKey(row.title);
  if (galleryKey) return { key: `gallery::${galleryKey}`, hit: null, inferred: true };

  // 名字里没有 ` by 作者` 时 postGalleryKey 返回 null。夸克导出有时会把作者摘掉
  // （2026-11-13 就是这样），但同帖附件仍带着命名工坊的 `_1` `_2` 序号，
  // 按「去掉序号后的基础名」兜底分组；组内不足 2 条的会在下面被删掉。
  const baseKey = variantBaseKey(row);
  if (!baseKey) return null;
  return { key: `base::${baseKey}`, hit: null, inferred: true };
}

/**
 * 去掉末尾版本序号（`_1` / `-2` / ` 3` / `（NSFW）`）后的基础名。
 *
 * 括号只认**版本词**（`（NSFW）` / `(Thicc SFW)`）：`UI-安静HUD（UI开关）_1` 里的
 * `（UI开关）` 是标题的一部分，一起削掉会把基础名截成 `UI-安静HUD`，
 * 变体标签也就跟着变成 `(UI开关)` 这种残渣。
 */
const VARIANT_WORDS = "Thicc|Thick|Slim|Normal|Heavy|NSFW|SFW|Free|Alt|VIP|UHD|HD|4K|2K|VR";
const VARIANT_ORDINAL_RE = new RegExp(
  `(?:[\\s_-]\\d{1,3}|[（(]\\s*(?:${VARIANT_WORDS})(?:\\s+(?:${VARIANT_WORDS}))*(?![A-Za-z])\\s*[)）])+$`,
  "i",
);

function variantBaseKey(row) {
  let text = stripAuthorTag(row.sourceKey ?? row.title);
  for (;;) {
    const next = text.replace(VARIANT_ORDINAL_RE, "").trim();
    if (next === text || !next) break;
    text = next;
  }
  if (!text || text === stripAuthorTag(row.sourceKey ?? row.title)) return null;
  return text.replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/\s+/g, " ").trim().toLowerCase();
}

/** 存放于名字末尾的画廊编号（`X 3（NSFW）-4 by 作者` 里那个 `-4`） */
const GALLERY_NUMBER_TAIL_RE = /[-_]\d{1,3}$/;

/**
 * 变体标签（推断模式）：相对帖子基础名的差异部分。
 *
 * 先削掉末尾的画廊编号：命名工坊会把同一帖子的附加图命名成 `…-4`，分享名可能
 * 继承成 `莫宁-月光幻影 3（NSFW）-4`。只有削完还剩东西时才削，否则
 * `UI-通用油亮质感贴图 mod_1` 这类名字会整个变成「默认」。
 */
function inferredVariantLabel(name, galleryKey, stemOverride = "") {
  const [stemFromKey = ""] = String(galleryKey ?? "").split(" :: ");
  const stem = stemOverride || stemFromKey;
  let text = String(name ?? "").trim().replace(/\.[a-z0-9]{2,5}$/i, "");
  const authorAt = /\s+by\s+[^()（）]+$/i.exec(text);
  if (authorAt) text = text.slice(0, authorAt.index);
  // 全角括号统一成半角再比前缀：`UI-安静HUD（UI开关）_1` 与键里的 `(UI开关)` 才能对上，
  // 否则整段名字都「不属于前缀差异」，标签会变成 `（UI开关）_1` 这种残渣。
  const normalizeParens = (v) => v.replace(/（/g, "(").replace(/）/g, ")");
  // 先转半角再取长度：`（` 和 `(` 都是 1 个 UTF-16 码元，但混着比会算错。
  text = normalizeParens(text);
  const stemNormalized = normalizeParens(stem).toLowerCase();
  if (stemNormalized && text.toLowerCase().startsWith(stemNormalized)) {
    text = text.slice(stemNormalized.length);
  }
  text = text.replace(/^[\s\-–—_:：·]+|[\s\-–—_:：·]+$/g, "").trim();

  const withoutGallery = text.replace(GALLERY_NUMBER_TAIL_RE, "").trim();
  if (withoutGallery) text = withoutGallery;

  text = text.replace(/^[\s\-–—_:：·]+|[\s\-–—_:：·]+$/g, "").trim();
  // 上面为了比前缀把括号转成了半角，标签里请换回全角 —— 与命名工坊写出的
  // `（NSFW）` / `（Thicc SFW）` 保持同一种写法，前台的版本按钮才不会混风格。
  text = text.replace(/\(/g, "（").replace(/\)/g, "）");
  return text || "默认";
}

/** 同组内标签必须唯一，否则前台版本切换会串 */
function uniqueLabel(label, used) {
  const root = String(label ?? "").trim() || "默认";
  let next = root;
  let index = 2;
  while (used.has(next)) {
    next = `${root} #${index}`;
    index += 1;
  }
  used.add(next);
  return next;
}

/** 结尾的版本括号：`（NSFW）` / `(Thicc SFW)` / `（NSFW）-4` */
const TRAILING_PAREN_RE = /[（(][^()（）]*[)）]$/;

/**
 * 名字末尾的变体编号：` 1` / `-2` / `_3` / ` 3（NSFW）`。用于推断模式挑基变体、排顺序。
 *
 * 编号后面可能还跟着版本括号（`奥古斯塔-日光冠军 3（Thicc SFW）`），
 * 所以先把括号和画廊编号剥掉再取数字，否则这些行一律算「无编号」排到基变体前面。
 */
function trailingVariantNumber(name) {
  let text = String(name ?? "").trim().replace(/\.(?:exe|zip|7z|rar|jpe?g|png|webp|gif)$/i, "");
  // 编号在 ` by 作者` 前面：先去掉作者再找末尾编号
  const authorAt = /\s+by\s+[^()（）]+$/i.exec(text);
  if (authorAt) text = text.slice(0, authorAt.index);

  // 只剥版本括号（`（Thicc SFW）`）。**不能**把 `_1` 当画廊编号一起剥掉 ——
  // 命名工坊的附件序号就是 `_1` / `_2`，剥完就再也排不出顺序，
  // 实测会得到 `1 | 3 | 4 | 2` 这种原样顺序。
  for (;;) {
    const next = text.replace(TRAILING_PAREN_RE, "").trim();
    if (next === text) break;
    text = next;
  }

  const match = /^(.*?)(?:\s+(\d{1,3})|[-_](\d{1,3}))$/.exec(text);
  if (!match) return null;
  return { stem: match[1].trim(), order: Number(match[2] ?? match[3]) };
}

/** 行名（去扩展名、去作者）和帖子基础名是否完全一致 */
function isBaseNamedRow(row, stem) {
  const base = String(stem ?? "").trim();
  if (!base) return false;
  const text = stripAuthorTag(row.sourceKey ?? row.title ?? "");
  return text.trim().toLowerCase() === base.toLowerCase();
}

/**
 * 合并行的标题：与每日脚本同一条口径 —— 用清单的基础名过一遍
 * `resolveCharacterAndTitle`，剥掉角色前缀（`奥古斯塔-日光冠军 1` → `日光冠军 1`）。
 *
 * 直接用清单里的 `title` 字段是不安全的：它是命名工坊落盘时算好的，规则改过就会
 * 与库内既有写法差一个前缀，去重键 `character|title` 随之错位 ⇒ 重新上传变成插新行。
 */
function resolvedGroupTitle(bucket, base) {
  const raw = bucket.hit?.group?.title || bucket.hit?.group?.baseName || "";
  if (!raw) return base.title;
  const parsed = resolveCharacterAndTitle(raw);
  // 解析出的角色必须和清单一致，否则宁可保留原样（宁可不合并，也别改错标题）
  if (bucket.hit?.group?.character && parsed.character !== bucket.hit.group.character) return raw;
  return parsed.title || raw;
}

/** 推断分组的帖子基础名：gallery 键取 ` :: ` 前，base 键就是键本身 */
function bucketStem(bucket) {
  const key = String(bucket.key ?? "");
  if (key.startsWith("gallery::")) return key.slice("gallery::".length).split(" :: ")[0];
  if (key.startsWith("base::")) return key.slice("base::".length);
  return "";
}

/**
 * 把行按「同一帖子」合并。
 *
 * 返回新的行数组；没有可合并的行时原样返回。合并后的行：
 * - `title` / `character` 取基变体（清单 variants[0]，推断模式取无编号或编号最小的行）；
 * - `driveLinks` 并集，每条带 `variant` 标签；
 * - `previewImages` = 基变体自己的图（已含帖子级附加图）；
 * - `variantImages` = 各变体标签 → 该变体的图，基变体排第一。
 *
 * 清单里只匹配到 1 个变体的组不合并 —— 与每日脚本一致，宁可多一张卡，
 * 也不要把半组数据合成一张缺版本的卡。
 */
export function mergeVariantRows(rows, manifest) {
  if (!Array.isArray(rows) || rows.length < 2) return rows;

  const hits = manifest ? manifestHitsByKey(manifest) : null;
  if (manifest && hits.size === 0) return rows;

  const buckets = new Map();
  for (const row of rows) {
    const bucket = bucketFor(row, hits);
    if (!bucket) continue;
    const existing = buckets.get(bucket.key) ?? { ...bucket, rows: [] };
    existing.rows.push(row);
    buckets.set(bucket.key, existing);
  }

  for (const bucket of buckets.values()) {
    if (bucket.rows.length < 2) buckets.delete(bucket.key);
    else bucket.rows = orderBucketRows(bucket, hits);
  }
  if (buckets.size === 0) return rows;

  const mergedById = new Map();
  const result = [];

  for (const row of rows) {
    const bucket = bucketFor(row, hits);
    const group = bucket ? buckets.get(bucket.key) : null;

    if (!group) {
      if (!result.some((item) => item.id === row.id)) result.push(row);
      continue;
    }

    if (!mergedById.has(bucket.key)) {
      mergedById.set(bucket.key, buildMergedRow(group, hits));
    }
    const merged = mergedById.get(bucket.key);
    // 合并行只放一次，位置取该组第一行出现的位置
    if (!result.some((item) => item.id === merged.id)) result.push(merged);
  }

  return result;
}

/** 变体顺序：清单按 variants 顺序；推断按编号升序、无编号的最前 */
function orderBucketRows(bucket, hits) {
  const rank = new Map();
  if (bucket.hit) {
    bucket.hit.group.variants.forEach((variant, index) => rank.set(variant.label, index));
  }

  return [...bucket.rows].sort((a, b) => {
    if (bucket.hit) {
      const labelA = hitForRow(a, hits)?.variant?.label;
      const labelB = hitForRow(b, hits)?.variant?.label;
      return (rank.get(labelA) ?? Number.MAX_SAFE_INTEGER) - (rank.get(labelB) ?? Number.MAX_SAFE_INTEGER);
    }
    // 基变体优先：名字完全等于帖子基础名的那一行（`X by 作者`，没有编号）
    const stem = bucketStem(bucket);
    const baseA = isBaseNamedRow(a, stem);
    const baseB = isBaseNamedRow(b, stem);
    if (baseA !== baseB) return baseA ? -1 : 1;

    const infoA = trailingVariantNumber(a.sourceKey ?? a.title);
    const infoB = trailingVariantNumber(b.sourceKey ?? b.title);
    if (!infoA && infoB) return -1;
    if (infoA && !infoB) return 1;
    return (infoA?.order ?? 0) - (infoB?.order ?? 0);
  });
}

function buildMergedRow(bucket, hits) {
  const ordered = bucket.rows;
  const base = ordered[0];
  const usedLabels = new Set();
  /** 标签 → 该变体的图；没有图的变体也要留标签（简介/版本切换要用） */
  const imagesByLabel = new Map();
  const driveLinks = [];
  const seenSlots = new Set();
  const labelByRowId = new Map();

  for (const row of ordered) {
    const hit = hits ? hitForRow(row, hits) : null;
    const galleryKey = postGalleryKey(row.sourceKey) ?? postGalleryKey(row.title);
    const label = uniqueLabel(
      hit?.variant?.label ??
        inferredVariantLabel(row.sourceKey ?? row.title, galleryKey, bucketStem(bucket)),
      usedLabels,
    );
    labelByRowId.set(row.id, label);

    for (const link of row.driveLinks ?? []) {
      const slot = `${label}|${link.platform}`;
      if (seenSlots.has(slot)) continue;
      seenSlots.add(slot);
      driveLinks.push({ ...link, variant: label });
    }

    imagesByLabel.set(label, (row.previewImages ?? []).slice(0, MAX_IMAGES));
  }

  const labels = [...imagesByLabel.keys()];
  const baseLabel = labelByRowId.get(base.id);

  // 基变体排第一（与每日脚本一致：它决定封面与默认选中的版本）
  const variantImages = {};
  const orderedLabels = baseLabel
    ? [baseLabel, ...labels.filter((label) => label !== baseLabel)]
    : labels;
  for (const label of orderedLabels) {
    const images = imagesByLabel.get(label) ?? [];
    if (images.length > 0) variantImages[label] = images;
  }

  const platforms = [...new Set(driveLinks.map((link) => link.platform))];

  return {
    ...base,
    // 合并行用固定前缀的 id，重新上传时能稳定对应同一张卡
    id: `group:${base.id}`,
    // 角色前缀要按 `resolveCharacterAndTitle` 的规则剥掉（`奥古斯塔-日光冠军 1 by X`
    // 入库时是 `日光冠军 1 by X`），否则新建合并行的标题会和库内既有写法不一致，
    // 下次上传的去重键就对不上、重复插一行。
    title: resolvedGroupTitle(bucket, base),
    character: bucket.hit?.group?.character || base.character,
    driveLinks,
    previewImages: (base.previewImages ?? []).slice(0, MAX_IMAGES),
    variantImages,
    // 前台默认选中/封面用的基变体；上传时它复用表格里可编辑的那套图
    baseVariantLabel: baseLabel,
    description: `${bucket.hit?.group?.character || base.character} ${
      bucket.hit?.group?.title || base.title
    } MOD，共 ${orderedLabels.length} 个版本：${orderedLabels.join(" / ")}；${platforms.join(" / ")}下载。`,
    editedFields: [...new Set(ordered.flatMap((row) => row.editedFields ?? []))],
  };
}
