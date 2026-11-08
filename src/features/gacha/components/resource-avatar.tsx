"use client";

import { useState } from "react";

import { getCharacterImagePath } from "@/lib/constants/character-images";

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
 * 五星物品头像。
 *
 * 角色优先复用站内 `characterImageMap` 的头像（和 mod 卡片同源，COS 上同名对象）；
 * 武器或未收录的角色退回「品质色块 + 首字」，不额外分发任何游戏素材。
 */
export function ResourceAvatar({
  name,
  resourceType,
  qualityLevel,
  size = "sm",
}: {
  name: string;
  resourceType: ResourceType;
  qualityLevel: QualityLevel;
  size?: keyof typeof SIZE_CLASS;
}) {
  const [failed, setFailed] = useState(false);
  const src = resourceType === "role" ? getCharacterImagePath(name) : null;

  const baseClass = `shrink-0 border-2 border-black object-cover ${SIZE_CLASS[size]}`;

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
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
