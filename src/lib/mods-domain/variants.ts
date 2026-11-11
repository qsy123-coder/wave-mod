import type { DriveLink } from "./types";

/**
 * 按变体标签分组后的网盘链接。
 *
 * `label === null` 表示历史数据（没有 `variant` 字段），前台按旧逻辑平铺。
 * `key` 是稳定的分组键：有标签用标签，没有用空串，方便 React `key` 与状态比较。
 */
export type DriveVariantGroup = {
  key: string;
  label: string | null;
  links: DriveLink[];
};

export type DriveVariantSummary = {
  groups: DriveVariantGroup[];
  /** 去重后的变体标签，按首次出现顺序 */
  labels: string[];
  /** 标签数量（不含无标签组） */
  variantCount: number;
  /** ≥2 个变体时才需要版本切换 UI */
  hasVariants: boolean;
  /** 去重后的链接总数 */
  linkCount: number;
};

/** 变体标签统一 trim；空串视为「没有变体」，与历史数据同组 */
export function normalizeVariantLabel(value: string | null | undefined): string | null {
  const label = String(value ?? "").trim();
  return label ? label : null;
}

/**
 * 把 `drive_links` 按变体分组。
 *
 * 约束：
 * - 保持首次出现顺序，避免每次渲染按钮顺序乱跳；
 * - 同一个 `(变体, 平台, 链接)` 只保留一条（上传脚本可能重复拿到同一条分享）；
 * - **不同变体的同一平台不能合并** —— 夸克在 SFW 和 NSFW 下是两个不同的分享链接。
 */
export function groupDriveLinksByVariant(driveLinks: readonly DriveLink[] | null | undefined): DriveVariantSummary {
  const groups: DriveVariantGroup[] = [];
  const byKey = new Map<string, DriveVariantGroup>();
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const link of driveLinks ?? []) {
    const url = String(link?.url ?? "").trim();
    if (!url) continue;

    const label = normalizeVariantLabel(link.variant);
    const key = label ?? "";
    const dedupeKey = `${key}|${String(link.platform ?? "").trim()}|${url}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let group = byKey.get(key);
    if (!group) {
      group = { key, label, links: [] };
      byKey.set(key, group);
      groups.push(group);
      if (label) labels.push(label);
    }
    group.links.push({ platform: String(link.platform ?? "").trim(), url, ...(label ? { variant: label } : {}) });
  }

  return {
    groups,
    labels,
    variantCount: labels.length,
    hasVariants: labels.length >= 2,
    linkCount: groups.reduce((count, group) => count + group.links.length, 0),
  };
}

export function variantCountLabel(count: number): string {
  return `${Math.max(0, Math.trunc(count))} 个版本`;
}
