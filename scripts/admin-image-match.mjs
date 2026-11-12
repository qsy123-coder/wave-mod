/**
 * 后台「批量上传」页的预览图索引与查找（纯逻辑，浏览器/Node 都能 import）。
 *
 * 与每日脚本 `upload-daily-by-date.mjs` 的 `buildImageIndex` / `lookupImages` 同一套口径，
 * 区别只在数据来源：那边扫文件系统目录，这里拿的是浏览器 `File` 列表 —— 所以只能靠
 * 文件名推断，**没有目录层级信息**（`webkitdirectory` 给的相对路径没有传到这一层）。
 *
 * 2026-11-12 的 W-2026.11.12 暴露了两个问题，这里分别处理：
 *   1. 命名工坊给同帖附件加版本后缀，分享名没有 → `looseImageKey` 兜底；
 *   2. 同帖还有一组「帖子级附加图」（`角色-名称 by 作者-N.jpg`），不属于任何变体，
 *      每日脚本会并进每个版本，后台页以前完全没有 → `postGalleryKey` + `lookupSharedImages`。
 *
 * 抽成独立模块是为了能单测：这里判断错只会静默少图/串图，页面不会报错。
 */

import { resolveCanonicalKey, stripRenameSuffix } from "./daily-classify.mjs";
import { looseImageKey, postGalleryKey } from "./image-name-match.mjs";

/** 浏览器重复下载/改名留下的 ` (2)`。图片名常带，分享名很少带。 */
const UUID_SUFFIX_RE = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_NAME_RE = /\.(png|jpe?g|webp|gif)$/i;

/**
 * 索引结构：
 * - `exact`：图名 → 属于该 mod 自己的图（精确名 + 宽松键兜底）；
 * - `gallery`：帖子级键 → 同帖全部图（用来补变体之外附加图）。
 */
export function createEmptyImageIndex() {
  return { exact: new Map(), gallery: new Map() };
}

/**
 * 从 `File` 列表建索引。`files` 只要求有 `name` / `type`，
 * Node 测试里直接传 `{ name, type }` 对象即可。
 */
export function buildImageIndex(files) {
  const exact = new Map();
  const gallery = new Map();
  // 宽松键单独收集，最后只补在「没有精确同名图」的键上，保证不会盖过精确匹配。
  const loose = new Map();

  for (const file of files) {
    const name = String(file?.name ?? "");
    if (!IMAGE_NAME_RE.test(name) && !/^image\//i.test(String(file?.type ?? ""))) continue;

    const base = name.replace(/\.[^.]+$/, "");
    const withoutUuid = base.replace(UUID_SUFFIX_RE, "");
    const numbered = withoutUuid.match(/^(.*?)[-_](\d+)$/);
    const baseKey = numbered ? numbered[1] : withoutUuid;
    const order = numbered ? Number(numbered[2]) : 0;

    const keys = new Set([
      resolveCanonicalKey(stripRenameSuffix(baseKey)),
      stripRenameSuffix(baseKey),
      baseKey,
    ]);

    for (const rawKey of keys) {
      const key = rawKey.trim().toLowerCase();
      if (!key) continue;
      const list = exact.get(key) ?? [];
      list.push({ file, order });
      exact.set(key, list);
    }

    const looseKey = looseImageKey(baseKey);
    if (looseKey) {
      const list = loose.get(looseKey) ?? [];
      list.push({ file, order });
      loose.set(looseKey, list);
    }

    // 帖子级画廊：同一 GameBanana 帖子的所有图共用同一个键，
    // 用来补「不属于任何单个变体」的附加预览图。
    const galleryKey = postGalleryKey(base);
    if (galleryKey) {
      const list = gallery.get(galleryKey) ?? [];
      list.push({ file, order });
      gallery.set(galleryKey, list);
    }
  }

  for (const [key, list] of loose) {
    if (!exact.has(key)) exact.set(key, list);
  }

  for (const list of exact.values()) {
    list.sort((a, b) => a.order - b.order);
  }
  for (const list of gallery.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  return { exact, gallery };
}

/**
 * 找该 mod 自己的图（首图在前）。
 *
 * 先精确、后宽松：宽松键会去掉 `（Free）` / `-2` 这类版本后缀，可能把同一帖子的
 * 多个变体并到同一个键，所以只能作为精确匹配全部落空时的兜底。
 */
export function lookupImages(index, sourceKey, canonicalKey, title) {
  const candidates = [
    canonicalKey,
    sourceKey,
    title,
    stripRenameSuffix(canonicalKey),
    stripRenameSuffix(sourceKey),
    looseImageKey(canonicalKey),
    looseImageKey(sourceKey),
    looseImageKey(title),
  ];

  for (const candidate of candidates) {
    const list = index.exact.get(String(candidate).trim().toLowerCase());
    if (list?.length) return list.slice(0, MAX_IMAGES_PER_MOD).map((entry) => entry.file);
  }

  return [];
}

/** 与后台页面一致的单条 mod 图片上限（`images` 数组最大 20，见上传 action 的 schema） */
export const MAX_IMAGES_PER_MOD = 20;

/**
 * 该行除了自己的图以外，还能从同帖画廊里补的「帖子级预览图」。
 *
 * 与每日脚本 `uploadSharedImages` 同一口径：同帖的附加图（`… by 作者-1` 孤儿组）
 * 不属于任何一个变体，但都是这个 mod 的可用图，并进每个版本的画廊。
 *
 * `variantKeys` 是所有行自己的宽松键：画廊里属于别的变体的主图要排除，
 * 否则每个版本都会多出别的版本的封面。
 */
export function lookupSharedImages(index, sourceKey, title, ownFiles, variantKeys) {
  const galleryKey =
    postGalleryKey(sourceKey) ??
    postGalleryKey(title) ??
    postGalleryKey(stripRenameSuffix(sourceKey));
  if (!galleryKey) return [];

  const own = new Set(ownFiles);
  const shared = [];

  for (const entry of index.gallery.get(galleryKey) ?? []) {
    if (own.has(entry.file)) continue;
    const key = looseImageKey(entry.file.name);
    // 是别的变体自己的主图：跳过，避免串图
    if (key && variantKeys.has(key)) continue;
    shared.push(entry.file);
  }

  return shared;
}
