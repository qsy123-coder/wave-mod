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

export function looseImageKey(value) {
  let text = String(value ?? "").trim();
  // 扩展名
  text = text.replace(/\.[^./\\]+$/, "");
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
