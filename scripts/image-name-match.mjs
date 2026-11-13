/**
 * 预览图名 → 「宽松匹配键」。
 *
 * 命名工坊把同一个 GameBanana 帖子的多个附件当成版本时，会给第 2 个附件的
 * **主名和预览图**加后缀（`（Free）` / `（Thicc NSFW）` / `-2`），插在 ` by 作者`
 * 前面。但分享导出的 CSV/txt 用的是基础名，例如：
 *
 *   图片：心月狐-狐之月（Free） by Ceeji-1.jpg
 *   分享：心月狐-狐之月 by Ceeji.exe
 *
 * 后台批量上传按名字找图时就会一张都对不上。这里给出一个「去掉版本后缀、去掉作者」
 * 的键，只在精确匹配失败时兜底用 —— 不能让宽松键盖过精确匹配。
 *
 * 只削末尾：版本后缀一定紧贴 ` by 作者` 或名字结尾；中段括号（如
 * `绯雪-…（3.5 texture fixed）`）是标题的一部分，不能按后缀处理。
 */

/** 命名工坊 `variantSuffix()` 会写进名字的版本词 */
const VARIANT_WORDS =
  "Thicc|Thick|Slim|Normal|Heavy|NSFW|SFW|Free|Alt|VIP|UHD|HD|4K|2K|VR";

/** `（Thicc NSFW）` / `(Free)` 这种整段都是版本词的括号 */
const VARIANT_PAREN_RE = new RegExp(
  `[（(]\\s*(?:${VARIANT_WORDS})(?:\\s+(?:${VARIANT_WORDS}))*(?![A-Za-z])\\s*[)）]\\s*$`,
  "i",
);

/** 没有版本词时的兜底后缀：`-2`、`–3` */
const VARIANT_NUMBER_RE = /[-–]\d{1,3}\s*$/;

/**
 * 只削**已知的文件扩展名**，不能用 `/\\.[^.]+$/` 这种「最后一个点之后全削」的写法。
 *
 * 2026-11-13 踩到的坑：分享名没有扩展名，但标题里有版本号小数（
 * `洛瑟菈-酒与花 3.6 贴图修正 by PebbleRox`）—— 旧正则把 `.6 贴图修正 by PebbleRox`
 * 整段当扩展名削掉，键变成 `洛瑟菈-酒与花 3`，于是 `postGalleryKey` 直接返回 null
 * （找不到 ` by 作者`），同帖的多个变体永远推断不成一组，后台只能靠传 JSON 合并。
 */
const FILE_EXT_RE = /\.(?:exe|zip|7z|rar|jpe?g|png|webp|gif|jfif|avif|bmp|mp4|mov|webm)$/i;

export function looseImageKey(value) {
  let text = String(value ?? "").trim();
  // 扩展名
  text = text.replace(FILE_EXT_RE, "");
  // 作者：` by xxx`（作者名里可能有括号，所以只在结尾匹配）
  text = text.replace(/\s+by\s+[^()（）]+$/i, "");
  // 版本后缀可能连着出现（`X（Free）-2`），循环削到不再变化
  for (;;) {
    const next = text.replace(VARIANT_NUMBER_RE, "").replace(VARIANT_PAREN_RE, "");
    if (next === text) break;
    text = next;
  }
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** 帖子级画廊名末尾的编号：`… by 作者-3`（命名工坊/爬虫给同一帖子的附加图编号） */
const POST_GALLERY_NUMBER_RE = /[-_]\d{1,3}\s*$/;

/** 命名工坊把变体序号插在 ` by 作者` 前面：`角色-名称 2 by 作者` */
const POST_VARIANT_SPACE_NUMBER_RE = /\s+\d{1,3}\s*$/;

/**
 * 预览图名 → 「帖子级」键：同一 GameBanana 帖子的所有图落到同一个键。
 *
 * 后台批量上传没有 `.mod-groups.json`，无法像每日脚本那样按清单分组，
 * 只能从名字推断。规则：
 *   - 必须有 ` by 作者`，否则返回 null（避免跨作者串图）；
 *   - 先削掉画廊编号 `-1` / `-2`…（在作者之后）；
 *   - 再削掉命名工坊插在作者前的变体后缀 `（Free）` / `-2` / ` 2`。
 *
 * 例（同一帖子）：
 *   `女漂-星界调制器 1 by Alunoop.jpg`        → `女漂-星界调制器 :: alunoop`
 *   `女漂-星界调制器 by Alunoop-7.jpg`         → `女漂-星界调制器 :: alunoop`
 *
 * 与 `looseImageKey` 的区别：后者会丢掉作者、只看名字，用于「分享名 vs 图片名」
 * 的精确匹配兜底；这里要保留作者，才敢把多行并进同一个帖子级画廊。
 */
export function postGalleryKey(value) {
  let text = String(value ?? "").trim();
  text = text.replace(FILE_EXT_RE, "");
  // 作者名里可能有括号，所以只在结尾匹配
  const authorMatch = /\s+by\s+([^()（）]+)$/i.exec(text);
  if (!authorMatch) return null;

  // 画廊编号有时挂在作者后面（`by Alunoop-7`），不属于作者名
  const author = authorMatch[1].replace(POST_GALLERY_NUMBER_RE, "").trim().toLowerCase();
  if (!author) return null;
  let stem = text.slice(0, authorMatch.index);
  // 后缀会连着出现（`X（Free）-2`、`mod_2-2`），循环削到不再变化。
  // 画廊编号必须放进循环：`mod_2-2` 只削一刀会剩 `mod_2`，和 `mod_1` 分成两个键。
  for (;;) {
    const next = stem
      .replace(POST_GALLERY_NUMBER_RE, "")
      .replace(VARIANT_NUMBER_RE, "")
      .replace(POST_VARIANT_SPACE_NUMBER_RE, "")
      .replace(VARIANT_PAREN_RE, "");
    if (next === stem) break;
    stem = next;
  }

  const cleanStem = stem.replace(/\s+/g, " ").trim();
  if (!cleanStem) return null;
  return `${cleanStem.toLowerCase()} :: ${author}`;
}
