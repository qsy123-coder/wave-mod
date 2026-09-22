import { fallbackCoverImage } from "@/lib/mods-domain/mappers";

/**
 * COS 上的占位图：入库那一刻源目录里没有预览图的 mod 会被写成它。
 *
 * 值必须与 scripts/*.mjs 里那一批同名常量一致（改一处就得全改）。对不上的话，
 * 「含预览图」筛出来的结果就跟着错 —— 而错法很隐蔽：只是多几张假图，不报错。
 */
export const PLACEHOLDER_PREVIEW_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

/**
 * 这个 URL 是不是「不是真图」。三种都算：
 *   - COS 占位图（入库脚本写的，见上）
 *   - mapMod 的兜底图（images 为空时拿一张 unsplash 顶替，见 mappers.ts）
 *   - 空值
 *
 * 除了比常量，再按子串兜一道 placeholder：bucket/region 以后若变，常量会失配，
 * 而占位图的对象键里恒含 `placeholder/` —— scripts 那边同样是这个判据。
 */
export function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return true;
  return url === PLACEHOLDER_PREVIEW_URL || url === fallbackCoverImage || url.includes("placeholder");
}

/**
 * 卡片首图是不是真图 ——「含预览图」筛选用它。
 *
 * 只看首图：列表卡片展示的就是首图（mapMod 里 coverImage = images[0]），
 * 首图是占位图的那张卡片，用户看到的就是一张假图，哪怕后面还挂着别的真图。
 */
export function hasPreviewImage(images: readonly string[] | null | undefined): boolean {
  return !isPlaceholderImage(images?.[0]);
}
