"use client";

import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useEngagement } from "@/lib/engagement/use-engagement";

type LikeButtonProps = {
  className?: string;
  compact?: boolean;
  modId: string;
  likeCount: number;
  /** @deprecated 点赞不再要求登录——保留仅为不改动十余处调用方 */
  isLiked?: boolean;
  /** @deprecated 点赞不再要求登录 */
  isLoggedIn?: boolean;
  /** @deprecated 点赞不再要求登录 */
  nextPath?: string;
};

/**
 * 点赞按钮。
 *
 * 改动要点：删掉了整条「未登录 → 跳登录页」分支，也删掉了每次点击后的 `router.refresh()`
 * （那会重新拉一次全站列表，代价很大）。现在状态由互动 store 管理：
 * 点击立即生效，失败自动回滚，服务端结果回来后再校准。
 */
export function LikeButton({ className, compact = false, modId, likeCount }: LikeButtonProps) {
  const { counts, mine, like } = useEngagement(modId, { likes: likeCount, favorites: 0, views: 0 });
  const liked = mine.liked;

  const buttonClass = compact
    ? "h-11 border-4 border-black px-3 text-[11px] font-black uppercase tracking-[0.12em] shadow-[4px_4px_0px_0px_#000]"
    : "h-14 text-sm font-black uppercase tracking-[0.16em]";

  const handleToggle = () => {
    void like().then((ok) => {
      if (!ok) toast.error("点赞没存上，稍后再试一次");
    });
  };

  return (
    <Button
      variant={liked ? "secondary" : "outline"}
      size="lg"
      className={`${className ?? "w-full justify-center"} ${buttonClass}`}
      type="button"
      onClick={handleToggle}
    >
      <ThumbsUp className={`size-4 ${liked ? "fill-current" : ""}`} />
      {compact
        ? liked
          ? `已赞 ${counts.likes}`
          : `点赞 ${counts.likes}`
        : liked
          ? `取消点赞 · ${counts.likes}`
          : `点赞支持 · ${counts.likes}`}
    </Button>
  );
}
