/**
 * 同一 GameBanana 帖子多附件的分组合并规则（纯函数，不碰文件系统）。
 *
 * 命名工坊落盘时用 `applyPostVariantLabels` 给每行打上帖子 URL / 变体标签，服务端
 * 据此写 `.mod-groups.json`；每日上传脚本再用 `matchRecordsToGroups` 把多个分享合并成
 * 一条 mod 记录。这里不能 import `node:fs`：它同时会被浏览器侧的重命名页面、每日脚本
 * 和 vitest 加载（tsconfig 也不会把它带进 Next 构建）。
 *
 * 设计原则：
 * - 只认 `gamebanana.com/mods/<id>`，别的来源（arca.live 等）保持原有多条记录；
 * - 任何不确定都返回「不合并」，宁可多一张卡，也不要把两个无关 mod 合错；
 * - 清单只是加速/去重用的元数据，坏掉时上传脚本必须能安全退回旧逻辑。
 */
import { resolveCanonicalKey, resolveCharacterAndTitle, stripRenameSuffix } from "./daily-classify.mjs";

export const MOD_GROUPS_FILE = ".mod-groups.json";
export const MOD_GROUPS_VERSION = 1;

const ARCHIVE_EXT_RE = /\.(?:exe|zip|7z|rar|jpe?g|png|webp)$/i;

/** 只保留 GameBanana 帖子 URL 的规范形式；不是帖子页一律 null */
export function normalizeGameBananaUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "gamebanana.com" && host !== "www.gamebanana.com") return null;
  const match = /^\/mods\/(\d+)\/?$/i.exec(parsed.pathname);
  return match ? `https://gamebanana.com/mods/${match[1]}` : null;
}

/**
 * 分享名归一化：夸克导出、改名前后、带 `.exe`/`(1)` 后缀的写法都落到同一个键。
 * 只去掉**末尾**编号，避免把名称里有意义的 `-2` 也吃掉（爬虫的重复下载后缀是 `_1`）。
 */
export function normalizeGroupKey(value) {
  return String(value ?? "")
    .replace(/[\\/]+$/, "")
    .replace(ARCHIVE_EXT_RE, "")
    .replace(/[(（]\d+[)）]\s*$/, "")
    .replace(/_\d+\s*$/, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 转义正则里的字面量；帖子标题里常带 `(` `)` `+` 等 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 变体标签里保持大写的常见缩写 */
const LABEL_ACRONYMS = new Set(["SFW", "NSFW", "VIP", "UHD", "HD", "4K", "2K", "VR"]);

/** `slim sfw` → `Slim SFW`；中文原样保留 */
function titleCaseVariant(label) {
  return label
    .split(/\s+/)
    .map((word) => {
      if (!word || /^\d/.test(word)) return word;
      const upper = word.toUpperCase();
      if (LABEL_ACRONYMS.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** GameBanana 下载名末尾会带一小段十六进制 id（`..._8e1ec`），不是版本描述 */
function looksLikeShortHash(word) {
  return /^(?=.*\d)[0-9a-f]{5,12}$/i.test(word);
}

/**
 * 从附件原始文件名里提取变体描述。
 *
 * `moonlight_mirage_mornye_thicc_heavy_nsfw_vip_c82f6.zip` + 帖子标题
 * `Moonlight Mirage Mornye` → `Thicc Heavy NSFW VIP`
 *
 * 现有 `variantSuffix` 只认 thicc/nsfw/sfw/free/alt，会把 `Normal`、`Heavy`、`VIP`
 * 这些真正区分版本的词丢掉；这里用「去掉帖子标题后剩下的部分」保留完整描述。
 * GameBanana 的原始文件名是下划线连接的小写形式，所以匹配标题时要允许分隔符差异。
 */
export function deriveVariantLabel(sourceName, postTitle, author = "") {
  let raw = String(sourceName ?? "").split(/[\\/]/).pop() ?? "";
  raw = raw.replace(ARCHIVE_EXT_RE, "").replace(/[(（]\d+[)）]\s*$/, "").trim();
  // 先统一分隔符：标题 "Augusta Champion of Sunlight" 要能匹配
  // 文件名里的 "augusta_champion_of_sunlight"
  let label = raw.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  const title = String(postTitle ?? "").trim();
  if (title) {
    const titlePattern = title.split(/\s+/).map(escapeRegExp).join("[\\s_\\-]+");
    label = label.replace(new RegExp(titlePattern, "gi"), " ");
  }
  const authorName = String(author ?? "").trim();
  if (authorName) {
    const authorPattern = authorName.split(/\s+/).map(escapeRegExp).join("[\\s_\\-]+");
    label = label.replace(new RegExp(`\\bby\\s+${authorPattern}`, "gi"), " ");
    label = label.replace(new RegExp(authorPattern, "gi"), " ");
  }
  label = label
    .replace(/\bby\b/gi, " ")
    .replace(/[·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 去掉末尾的下载 id（只在它确实像 hash 时）
  const words = label.split(" ").filter(Boolean);
  while (words.length > 0 && looksLikeShortHash(words[words.length - 1])) words.pop();
  label = words.join(" ").replace(/^[-–—:：|,，;；\s]+|[-–—:：|,，;；\s]+$/g, "");

  if (label) return titleCaseVariant(label);

  // 兜底：文件名里只剩 SFW/NSFW/Thicc 这类词时，至少给一个能看的标签
  const source = String(sourceName ?? "").toLowerCase();
  const fallback = [];
  if (/thicc|thick/.test(source)) fallback.push("Thicc");
  if (/nsfw/.test(source)) fallback.push("NSFW");
  else if (/(^|[^a-z])sfw($|[^a-z])/.test(source)) fallback.push("SFW");
  if (/free/.test(source)) fallback.push("Free");
  if (/alt(ernative)?($|[^a-z])/.test(source)) fallback.push("Alt");
  return fallback.join(" ");
}

/** 同一帖子里两个变体算出同一个标签时追加 ` #2`，保证前台能区分 */
export function uniqueVariantLabel(base, used) {
  const root = String(base ?? "").trim() || "附件";
  let label = root;
  let index = 2;
  while (used.has(label)) {
    label = `${root} #${index}`;
    index += 1;
  }
  used.add(label);
  return label;
}

/**
 * 给 `planAll` 的行补 `postUrl / variantLabel / isBaseVariant`。
 *
 * 和 `applySamePostSuffixes` 分开做是有意的：后者只处理「可应用且会改名」的行，
 * 而清单需要覆盖整批勾选里的所有附件（包括已经命名好的）。两处都按同一个帖子 URL
 * 分组，基行规则也保持一致 —— 组内第一条可应用的行保持无后缀。
 */
export function applyPostVariantLabels(rows) {
  const groups = new Map();
  for (const row of rows) {
    // 没有主文件的孤儿预览图不是帖子附件；把它们算进来会把图片行也标成「变体」
    if (row?.kind === "image") continue;
    const postUrl = normalizeGameBananaUrl(row?.url);
    if (!postUrl) continue;
    // 目录 + 同名压缩包/打包 exe 是同一个附件（解压/打包出来的），按本地 base 去重；
    // 不这么做会把压缩包当成第二个变体、给它和挂在它下面的预览图加 `-2`/`（Free）`
    // 后缀，导致分享导出（基础名）和图片名对不上。其余情况退回原始文件名。
    const identityOf = (item) =>
      String(item?.base ?? "").toLowerCase() || item?.src || item?.name || item?.from || "";
    const identity = identityOf(row);
    const list = groups.get(postUrl) ?? [];
    const existing = list.findIndex((item) => identityOf(item) === identity);
    // 爬虫有时把同一条链接下两遍：同一原始文件名只算一个变体
    if (existing === -1) list.push(row);
    // 同一附件优先保留带 `src` 的行（压缩包），变体标签和 sourceName 才能取到原始文件名
    else if (!list[existing].src && row.src) list[existing] = row;
    groups.set(postUrl, list);
  }

  for (const [postUrl, list] of groups) {
    if (list.length < 2) continue;
    const baseRow = list.find((row) => row.applicable && row.changed > 0) ?? list[0];
    // 基行是组内第一条可应用的行（`applySamePostSuffixes` 不给它加后缀），
    // 它的 title 就是基础标题
    const groupTitle = baseRow.title ?? baseRow.postTitle ?? "";
    const used = new Set();

    for (const row of list) {
      const postTitle = row.postTitle || baseRow.postTitle || "";
      const author = row.author || baseRow.author || "";
      row.postUrl = postUrl;
      row.groupTitle = groupTitle;
      row.variantLabel = uniqueVariantLabel(
        deriveVariantLabel(row.src || row.name, postTitle, author),
        used,
      );
      row.isBaseVariant = row === baseRow;
    }
  }

  return rows;
}

/** 把磁盘上的清单归一化；结构不对就返回 null（调用方按「没有清单」处理） */
export function normalizeManifest(raw) {
  if (!raw || typeof raw !== "object" || Number(raw.version) !== MOD_GROUPS_VERSION) return null;
  const groups = raw.groups && typeof raw.groups === "object" ? raw.groups : null;
  if (!groups) return null;

  const normalized = {};
  for (const [key, value] of Object.entries(groups)) {
    const postUrl = normalizeGameBananaUrl(value?.postUrl ?? key);
    if (!postUrl) continue;
    const variants = Array.isArray(value.variants)
      ? value.variants
          .map((variant) => {
            const name = String(variant?.name ?? "").trim();
            const label = String(variant?.label ?? "").trim();
            if (!name || !label) return null;
            return {
              label,
              name,
              localName: String(variant?.localName ?? "").trim(),
              sourceName: String(variant?.sourceName ?? "").trim(),
            };
          })
          .filter(Boolean)
      : [];
    if (variants.length < 2) continue;
    normalized[postUrl] = {
      postUrl,
      character: String(value.character ?? "").trim(),
      title: String(value.title ?? "").trim(),
      baseName: String(value.baseName ?? "").trim(),
      variants,
    };
  }

  return { version: MOD_GROUPS_VERSION, updatedAt: String(raw.updatedAt ?? ""), groups: normalized };
}

/** 变体身份：原始附件名优先，其次改名前后本地名，最后改后主名 */
function variantIdentity(variant) {
  return normalizeGroupKey(variant?.sourceName || variant?.localName || variant?.name);
}

/**
 * 合并新清单与旧清单。
 *
 * - 按帖子 URL 合并，同一帖子的变体取并集（一次只勾选部分变体也不会丢之前的）；
 * - 新数据的同身份变体覆盖旧数据；旧清单里本次没出现的变体保留；
 * - 少于 2 个变体的新组直接丢弃（单个附件不构成「多版本」）。
 */
export function mergeModGroups(existing, incoming, nowIso = new Date().toISOString()) {
  const base = normalizeManifest(existing) ?? {
    version: MOD_GROUPS_VERSION,
    updatedAt: "",
    groups: {},
  };
  const merged = {};
  for (const [key, group] of Object.entries(base.groups)) merged[key] = { ...group, variants: [...group.variants] };

  for (const raw of incoming ?? []) {
    const postUrl = normalizeGameBananaUrl(raw?.postUrl ?? raw?.key);
    if (!postUrl) continue;
    const variants = (Array.isArray(raw?.variants) ? raw.variants : [])
      .map((variant) => {
        const name = String(variant?.name ?? "").trim();
        const label = String(variant?.label ?? "").trim();
        if (!name || !label) return null;
        return {
          label,
          name,
          localName: String(variant?.localName ?? "").trim(),
          sourceName: String(variant?.sourceName ?? "").trim(),
          isBase: Boolean(variant?.isBase),
        };
      })
      .filter(Boolean);
    const unique = new Map();
    for (const variant of variants) unique.set(variantIdentity(variant), variant);
    if (unique.size < 2) continue;

    const previous = merged[postUrl];
    const byIdentity = new Map();
    if (previous) for (const variant of previous.variants) byIdentity.set(variantIdentity(variant), variant);
    for (const [identity, variant] of unique) byIdentity.set(identity, variant);

    const leftover = previous
      ? previous.variants.filter((variant) => !unique.has(variantIdentity(variant)))
      : [];
    const ordered = [...unique.values(), ...leftover];
    // 基行优先沿用旧清单的 baseName：后续批次可能只勾选非基变体，
    // 若此时把「第一个新变体」当基行，组标题会突然带上后缀，去重键就变了。
    const previousBase = previous?.baseName ? normalizeGroupKey(previous.baseName) : "";
    const baseVariant =
      (previousBase ? ordered.find((variant) => normalizeGroupKey(variant.name) === previousBase) : null) ??
      ordered.find((variant) => variant.isBase) ??
      ordered[0];
    const finalOrder = [baseVariant, ...ordered.filter((variant) => variant !== baseVariant)];
    const parsed = resolveCharacterAndTitle(baseVariant.name);
    merged[postUrl] = {
      postUrl,
      character: parsed.character,
      title: parsed.title,
      baseName: baseVariant.name,
      variants: finalOrder.map(({ isBase: _isBase, ...variant }) => variant),
    };
  }

  const groups = {};
  for (const key of Object.keys(merged).sort()) {
    const group = merged[key];
    if (group.variants.length >= 2) groups[key] = group;
  }
  if (Object.keys(groups).length === 0) return null;

  return { version: MOD_GROUPS_VERSION, updatedAt: nowIso, groups };
}

/**
 * 把 CSV 记录匹配到清单里的变体。
 *
 * 返回：
 * - `groups`: 只包含「至少匹配到 2 个不同变体」的组，附带按清单顺序排列的匹配项；
 * - `recordHits`: 命中的记录 → `{group, variant, isImageSource}`，供上传循环直接消费；
 * - `unmatched`: 清单里没在 CSV 出现的变体，用于日志。
 *
 * 记录按对象引用做 Map 键：CSV 解析器可能产生同名不同 URL 的两条记录，不能只按 key 去重。
 */
export function matchRecordsToGroups(records, manifest) {
  const normalized = normalizeManifest(manifest);
  const empty = { groups: [], recordHits: new Map(), unmatched: [] };
  if (!normalized) return empty;

  const index = new Map();
  const order = new Map(); // postUrl → 变体顺序（用于挑首图）
  for (const group of Object.values(normalized.groups)) {
    group.variants.forEach((variant, variantIndex) => {
      order.set(`${group.postUrl}|${variant.label}`, variantIndex);
      for (const raw of [variant.name, variant.localName, variant.sourceName]) {
        const key = normalizeGroupKey(raw);
        if (!key) continue;
        // 同一分享名对应多个变体时无法判断，保留第一个并让日志暴露（不在这里吞掉）
        if (!index.has(key)) index.set(key, { group, variant });
      }
    });
  }

  const hits = new Map(); // record → {group, variant}
  for (const record of records) {
    const candidates = new Set([
      normalizeGroupKey(record?.key),
      normalizeGroupKey(resolveCanonicalKey(String(record?.key ?? ""))),
      normalizeGroupKey(stripRenameSuffix(String(record?.key ?? ""))),
    ]);
    for (const key of candidates) {
      const hit = key ? index.get(key) : null;
      if (hit) {
        if (!hits.has(record)) hits.set(record, hit);
        break;
      }
    }
  }

  const perGroup = new Map();
  for (const [record, hit] of hits) {
    const list = perGroup.get(hit.group.postUrl) ?? [];
    list.push({ record, variant: hit.variant, group: hit.group });
    perGroup.set(hit.group.postUrl, list);
  }

  const groups = [];
  const recordHits = new Map();
  const unmatched = [];
  for (const group of Object.values(normalized.groups)) {
    const matches = perGroup.get(group.postUrl) ?? [];
    const labels = new Set(matches.map((match) => match.variant.label));
    if (labels.size < 2) {
      for (const variant of group.variants) {
        if (!labels.has(variant.label)) unmatched.push({ group, variant });
      }
      continue;
    }

    matches.sort(
      (a, b) =>
        (order.get(`${group.postUrl}|${a.variant.label}`) ?? 0) -
        (order.get(`${group.postUrl}|${b.variant.label}`) ?? 0),
    );
    // 首图只从清单里第一个变体取；它没匹配到就退到第一个命中的变体
    const imageLabel = group.variants[0]?.label;
    const imageMatch = matches.find((match) => match.variant.label === imageLabel) ?? matches[0];
    for (const match of matches) {
      recordHits.set(match.record, {
        group,
        variant: match.variant,
        isImageSource: match === imageMatch,
      });
    }
    groups.push({ group, matches });
  }

  return { groups, recordHits, unmatched };
}
