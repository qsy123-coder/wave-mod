"use client";

import { Eye, Heart, MessageCircle } from "lucide-react";

import { useEngagement } from "@/lib/engagement/use-engagement";
import type { SiteMod } from "@/lib/mods";

/**
 * 卡片底部的互动条。
 *
 * 收藏 / 浏览是**活的**：先用服务端快照里的值渲染，客户端批量拉到最新值后自动替换。
 * 点赞与评分入口已从站内移除，这里不再展示。
 */
type ModInteractionBarProps = {
  mod: Pick<SiteMod, "id" | "favorites" | "views" | "commentsCount">;
  className?: string;
};

export function ModInteractionBar({ mod, className = "" }: ModInteractionBarProps) {
  const { counts } = useEngagement(mod.id, {
    likes: 0,
    favorites: mod.favorites,
    views: mod.views,
  });

  return (
    <div className={`grid grid-cols-3 gap-2 border-t-4 border-black pt-3 text-xs font-black uppercase tracking-[0.12em] text-black/80 ${className}`.trim()}>
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_#000]">
        <Heart className="size-4" />收藏 {counts.favorites}
      </span>
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_#000]">
        <Eye className="size-4" />浏览 {counts.views}
      </span>
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_#000]">
        <MessageCircle className="size-4" />评论 {mod.commentsCount}
      </span>
    </div>
  );
}
