"use client";

import { useState } from "react";

import { getCharacterImagePath } from "@/lib/constants/character-images";

import { gachaIconUrl } from "@/features/gacha/lib/asset-urls";
import type { QualityLevel, ResourceType } from "@/features/gacha/lib/types";

const QUALITY_BG: Record<QualityLevel, string> = {
  5: "bg-[var(--neo-secondary)]",
  4: "bg-[var(--neo-muted)]",
  3: "bg-zinc-200",
};

const SIZE_CLASS = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

/**
 * 五星物品图标。
 *
 * 取图顺序：
 *   1. 开源资源包按 resourceId 取（gacha-res/icons/<id>.webp）—— 角色、武器都覆盖，
 *      不依赖角色名，官方新增形态（漂泊者·衍射 等）也能直接显示；
 *   2. 站内 characterImageMap（角色）—— 资源包缺图时的兜底；
 *   3. 品质色块 + 首字。
 *
 * 失败的地址会记住，避免同一张图反复触发 onError。
 */
export function ResourceAvatar({
  resourceId,
  name,
  resourceType,
  qualityLevel,
  size = "sm",
}: {
  resourceId: number;
  name: string;
  resourceType: ResourceType;
  qualityLevel: QualityLevel;
  size?: keyof typeof SIZE_CLASS;
}) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());

  const sources = [
    gachaIconUrl(resourceId),
    resourceType === "role" ? getCharacterImagePath(name) : null,
  ].filter((source): source is string => Boolean(source));

  const source = sources.find((candidate) => !failedSources.has(candidate));
  const baseClass = `shrink-0 border-2 border-black object-cover ${SIZE_CLASS[size]}`;

  if (source) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source}
        alt=""
        loading="lazy"
        onError={() =>
          setFailedSources((previous) => {
            const next = new Set(previous);
            next.add(source);
            return next;
          })
        }
        className={baseClass}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`flex items-center justify-center font-black text-black ${baseClass} ${QUALITY_BG[qualityLevel]}`}
    >
      {name.slice(0, 1)}
    </span>
  );
}
