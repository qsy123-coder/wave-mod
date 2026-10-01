"use client";

import { Heart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useEngagement } from "@/lib/engagement/use-engagement";

type FavoriteButtonProps = {
  className?: string;
  compact?: boolean;
  id: string;
  favoriteLabel?: string;
  favoriteCount?: number;
  unfavoriteLabel?: string;
  variant?: "outline" | "secondary" | "destructive";
  /** @deprecated 收藏不再要求登录——以下 props 仅为不改动调用方而保留 */
  isFavorited?: boolean;
  /** @deprecated 收藏不再要求登录 */
  isLoggedIn?: boolean;
  /** @deprecated 收藏不再要求登录 */
  nextPath?: string;
  /** @deprecated 收藏不再要求登录 */
  loginLabel?: string;
  /** @deprecated 收藏不再要求登录 */
  pendingLabel?: string;
  /** @deprecated 收藏不再要求登录 */
  onSuccessMessage?: { favorite: string; unfavorite: string };
  /** @deprecated 收藏不再要求登录 */
  onSuccessDescription?: { favorite: string; unfavorite: string };
};

/**
 * 收藏按钮。同 LikeButton：删掉登录分支与点击后的 `router.refresh()`，
 * 状态改由互动 store 管理（乐观更新 + 失败回滚）。
 */
export function FavoriteButton({
  className,
  compact = false,
  id,
  favoriteLabel = "收藏 MOD",
  favoriteCount,
  unfavoriteLabel = "取消收藏",
  variant,
}: FavoriteButtonProps) {
  const { counts, mine, favorite } = useEngagement(id, {
    likes: 0,
    favorites: favoriteCount ?? 0,
    views: 0,
  });
  const favorited = mine.favorited;

  const buttonClass = compact
    ? "h-11 border-4 border-black px-3 text-[11px] font-black uppercase tracking-[0.12em] shadow-[4px_4px_0px_0px_#000]"
    : "h-14 text-sm font-black uppercase tracking-[0.16em]";

  const handleToggle = () => {
    void favorite().then((ok) => {
      if (!ok) toast.error("收藏没存上，稍后再试一次");
    });
  };

  const countSuffix = typeof favoriteCount === "number" ? ` ${counts.favorites}` : "";

  return (
    <Button
      variant={variant ?? (favorited ? "secondary" : "outline")}
      size="lg"
      className={`${className ?? "w-full justify-center"} ${buttonClass}`}
      type="button"
      onClick={handleToggle}
    >
      <Heart className={`size-4 ${favorited ? "fill-current" : ""}`} />
      {compact ? (favorited ? `已藏${countSuffix}` : `收藏${countSuffix}`) : favorited ? unfavoriteLabel : favoriteLabel}
    </Button>
  );
}
