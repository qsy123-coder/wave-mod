/**
 * 批量上传「覆盖更新」的字段合并规则（纯函数，有单测）。
 *
 * ── 为什么需要这份规则（2026-11-13）──────────────────────────────────────
 *
 * 原来的更新分支有两个**数据丢失**级别的 bug：
 *
 * 1. **预览图被替换成占位图**。前端在没选本地图片时会往 payload 塞
 *    `[PLACEHOLDER_IMAGE_URL]`（`batch-upload-client.tsx` 的 payload 构造），
 *    而 SQL 的判据是 `cardinality(images) > 0` —— 占位图长度也是 1，
 *    于是恒为真、无条件覆盖，`else images` 那条分支是死代码。
 *    实测：一条有 3 张真图的记录，覆盖更新一次就只剩一张占位图。
 *
 * 2. **网盘链接被整体替换**。`drive_links = $1::jsonb` 没有合并逻辑，
 *    本次 CSV 只有夸克 ⇒ 库里原有的迅雷 / 百度链接**全部消失**。
 *
 * 修复后的语义（本文件描述的规则）：
 * - 本次没选新图（空数组 / 只有占位图）⇒ **保留库里原有的 images**；
 * - 网盘链接**按平台合并**：本次提供的平台覆盖旧值，没提供的平台原样保留；
 * - 简介 / 版本 / 游戏版本 / NSFW 只在用户显式改过时才覆盖（原有行为，不变）。
 */

/** COS 上的占位图。与 `src/lib/mods-domain/preview-image.ts` 保持同一个常量值。 */
export const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

/**
 * 这批 images 是否代表「用户真的选了图」。
 *
 * 只有占位图 ⇒ 视为没选。全空 ⇒ 没选。
 * 注意判据是**过滤掉占位图之后还有没有真图**，而不是数组长度 —— 长度正是原来的 bug。
 */
export function hasRealImages(images: readonly string[] | null | undefined): boolean {
  if (!images || images.length === 0) return false;
  return images.some((url) => Boolean(url) && url !== PLACEHOLDER_IMAGE_URL);
}

/**
 * 网盘链接按平台合并：本次提供的平台覆盖旧值，其余保留。
 *
 * 同一平台可能有多条（同帖多变体的不同分享），所以按 `variant|platform` 组合键去重：
 * 本次提供的组合键覆盖旧值，其余原样保留。旧链接的顺序在前，保持库里原有展示顺序。
 */
export function mergeDriveLinksByPlatform<T extends { platform: string; url: string; variant?: string }>(
  existing: readonly T[] | null | undefined,
  incoming: readonly T[] | null | undefined,
): T[] {
  const keyOf = (link: { platform: string; variant?: string }) =>
    `${link.variant ?? ""}|${link.platform}`;

  const incomingList = incoming ?? [];
  const incomingKeys = new Set(incomingList.map(keyOf));

  // 旧链接里、本次没提供的组合键原样保留
  const kept = (existing ?? []).filter((link) => !incomingKeys.has(keyOf(link)));

  return [...kept, ...incomingList];
}

/**
 * 决定这次更新要不要写 `variant_images`。
 *
 * 与 images 同理：空对象 = 用户没动变体画廊，保留库里原值。
 */
export function shouldUpdateVariantImages(
  variantImages: Record<string, string[]> | null | undefined,
): boolean {
  if (!variantImages) return false;
  return Object.values(variantImages).some((urls) => hasRealImages(urls));
}
