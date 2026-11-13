/**
 * 后台「批量上传」页：把同一 GameBanana 帖子的多个附件合并成一条记录。
 *
 * 每日脚本靠 `.mod-groups.json`（命名工坊落盘）合并；后台页最好也传这份清单，
 * 这样变体标签与每日脚本完全一致（`Base SFW` / `Thicc NSFW` …）。
 * 没传清单时用**名字推断**兜底：同一作者、基础名去掉末尾编号后相同，才算同一个帖子。
 *
 * 纯函数：不碰文件系统、不依赖浏览器 API，Node 与 Next 都能 import。
 */

import { normalizeGroupKey } from "./mod-groups-pure.mjs";
import { postGalleryKey } from "./image-name-match.mjs";

/** 后台页单条 mod 的图片上限（与 batch-upload schema 的 max(20) 一致） */
const MAX_IMAGES = 20;

/**
 * 从清单里拿每个名字对应的 `{ group, variant }`。
 * 与 `matchRecordsToGroups` 同一套归一化（name / localName / sourceName 都登记），
 * 但这里按名字返回，方便直接落到表格行上。
 */
function manifestHitsByKey(manifest) {
  const hits = new Map();
  if (!manifest?.groups) return hits;

  for (const group of Object.values(manifest.groups)) {
    const variants = Array.isArray(group?.variants) ? group.variants : [];
    for (const variant of variants) {
      for (const raw of [variant.name, variant.localName, variant.sourceName]) {
        const key = normalizeGroupKey(raw);
        if (!key) continue;
        if (!hits.has(key)) hits.set(key, { group, variant });
      }
    }
  }
  return hits;
}

function hitForRow(row, hits) {
  for (const raw of [row.sourceKey, row.title]) {
    const key = normalizeGroupKey(raw);
    const hit = key ? hits.get(key) : null;
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
  if (!galleryKey) return null;
  return { key: `gallery::${galleryKey}`, hit: null, inferred: true };
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
function inferredVariantLabel(name, galleryKey) {
  const [stem = ""] = String(galleryKey ?? "").split(" :: ");
  let text = String(name ?? "").trim().replace(/\.[a-z0-9]{2,5}$/i, "");
  const authorAt = /\s+by\s+[^()（）]+$/i.exec(text);
  if (authorAt) text = text.slice(0, authorAt.index);
  if (stem && text.toLowerCase().startsWith(stem.toLowerCase())) {
    text = text.slice(stem.length);
  }
  text = text.replace(/^[\s\-–—_:：·]+|[\s\-–—_:：·]+$/g, "").trim();

  const withoutGallery = text.replace(GALLERY_NUMBER_TAIL_RE, "").trim();
  if (withoutGallery) text = withoutGallery;

  text = text.replace(/^[\s\-–—_:：·]+|[\s\-–—_:：·]+$/g, "").trim();
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

  for (;;) {
    const next = text
      .replace(GALLERY_NUMBER_TAIL_RE, "")
      .replace(TRAILING_PAREN_RE, "")
      .trim();
    if (next === text) break;
    text = next;
  }

  const match = /^(.*?)(?:\s+(\d{1,3})|[-_](\d{1,3}))$/.exec(text);
  if (!match) return null;
  return { stem: match[1].trim(), order: Number(match[2] ?? match[3]) };
}

/** 行名（去扩展名、去作者）和帖子键里的基础名是否完全一致 */
function isBaseNamedRow(row, galleryKey) {
  const [stem = ""] = String(galleryKey ?? "").split(" :: ");
  if (!stem) return false;
  let text = String(row.sourceKey ?? row.title ?? "")
    .trim()
    .replace(/\.(?:exe|zip|7z|rar)$/i, "");
  const authorAt = /\s+by\s+[^()（）]+$/i.exec(text);
  if (authorAt) text = text.slice(0, authorAt.index);
  return text.trim().toLowerCase() === stem.trim().toLowerCase();
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
    const galleryKey = bucket.key.replace(/^gallery::/, "");
    const baseA = isBaseNamedRow(a, galleryKey);
    const baseB = isBaseNamedRow(b, galleryKey);
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
      hit?.variant?.label ?? inferredVariantLabel(row.sourceKey ?? row.title, galleryKey),
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
    title: bucket.hit?.group?.title || base.title,
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
