import { Eye, Heart, MessageCircle, Star, ThumbsUp } from "lucide-react";

import type { SiteMod } from "@/lib/mods";

type ModInteractionBarProps = {
  mod: Pick<SiteMod, "favorites" | "views" | "commentsCount" | "likes">;
  className?: string;
};

export function ModInteractionBar({ mod, className = "" }: ModInteractionBarProps) {
  return (
    <div className={`grid grid-cols-2 gap-2 border-t-4 border-black pt-3 text-xs font-black uppercase tracking-[0.12em] text-black/80 ${className}`.trim()}>
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_#000]">
        <Heart className="size-4" />收藏 {mod.favorites}
      </span>
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_#000]">
        <Eye className="size-4" />浏览 {mod.views}
      </span>
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_#000]">
        <MessageCircle className="size-4" />评论 {mod.commentsCount}
      </span>
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_#000]">
        <ThumbsUp className="size-4" />点赞 {mod.likes}
      </span>
    </div>
  );
}

type RatingStickerProps = {
  ratingAverage: number;
  ratingCount: number;
  className?: string;
};

export function RatingSticker({ ratingAverage, ratingCount, className = "" }: RatingStickerProps) {
  return (
    <div className={`absolute bottom-3 right-3 rotate-2 border-4 border-black bg-[#ffd84f] px-2 py-1.5 shadow-[4px_4px_0px_0px_#000] ${className}`.trim()}>
      <div className="flex items-center gap-1 text-black">
        <Star className="size-3 fill-[#ff7a00] text-[#ff7a00]" />
        <span className="text-sm font-black leading-none">{ratingAverage.toFixed(1)}</span>
      </div>
      <p className="mt-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black/70">{ratingCount} 人评分</p>
    </div>
  );
}
