/**
 * 抽卡素材地址。
 *
 * 图标按 `resourceId` 命名（gacha-res/icons/<id>.webp），不依赖角色名 ——
 * 官方会出「漂泊者·衍射」这种带形态后缀的名字，站内头像表不可能一直跟得上。
 * 素材来源见同目录 NOTICE.md。
 */

const DEFAULT_ASSET_BASE = "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com";

export type GachaAssetKind = "icons" | "portraits";

/** 纯函数，便于单测；base 末尾的斜杠会被裁掉 */
export function buildGachaAssetUrl(
  base: string,
  kind: GachaAssetKind,
  resourceId: number,
): string | null {
  if (!Number.isInteger(resourceId) || resourceId <= 0) return null;
  return `${base.replace(/\/+$/, "")}/gacha-res/${kind}/${resourceId}.webp`;
}

function resolveAssetBase(): string {
  return (
    process.env.NEXT_PUBLIC_GACHA_ASSET_BASE?.trim() ||
    process.env.NEXT_PUBLIC_COS_IMAGE_BASE?.trim() ||
    DEFAULT_ASSET_BASE
  );
}

export function gachaIconUrl(resourceId: number): string | null {
  return buildGachaAssetUrl(resolveAssetBase(), "icons", resourceId);
}

/** 立绘目前只在成本档案里备用；没有对应文件时由 <img> 的 onError 兜底 */
export function gachaPortraitUrl(resourceId: number): string | null {
  return buildGachaAssetUrl(resolveAssetBase(), "portraits", resourceId);
}
