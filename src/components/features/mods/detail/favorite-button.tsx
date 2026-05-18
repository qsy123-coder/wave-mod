"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Heart } from "lucide-react";

import { toggleFavoriteAction } from "@/actions/mods/favorite-actions";
import { Button } from "@/components/ui/button";

type FavoriteButtonProps = {
  className?: string;
  compact?: boolean;
  id: string;
  isFavorited: boolean;
  isLoggedIn: boolean;
  nextPath: string;
  loginLabel?: string;
  favoriteLabel?: string;
  unfavoriteLabel?: string;
  pendingLabel?: string;
  variant?: "outline" | "secondary" | "destructive";
  onSuccessMessage?: { favorite: string; unfavorite: string };
  onSuccessDescription?: { favorite: string; unfavorite: string };
};

export function FavoriteButton({
  className,
  compact = false,
  id,
  isFavorited,
  isLoggedIn,
  nextPath,
  loginLabel = "登录后收藏",
  favoriteLabel = "收藏 MOD",
  unfavoriteLabel = "取消收藏",
  variant,
}: FavoriteButtonProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const [optimisticFavorited, setOptimisticFavorited] = useState(isFavorited);

  const buttonClass = compact
    ? "h-11 border-4 border-black px-3 text-[11px] font-black uppercase tracking-[0.12em] shadow-[4px_4px_0px_0px_#000]"
    : "h-14 text-sm font-black uppercase tracking-[0.16em]";

  const handleToggle = () => {
    const previousFavorited = optimisticFavorited;
    const nextFavorited = !previousFavorited;
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    setOptimisticFavorited(nextFavorited);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);

      try {
        await toggleFavoriteAction(formData);
        router.refresh();
      } catch {
        if (requestIdRef.current === requestId) setOptimisticFavorited(previousFavorited);
      }
    });
  };

  if (!isLoggedIn) {
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(nextPath)}&mode=user`}
        className={`${compact ? "inline-flex w-full items-center justify-center gap-2 border-4 border-black bg-white text-black hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" : "neo-button-outline inline-flex"} ${buttonClass} ${className ?? "w-full justify-center"}`}
      >
        <Heart className="size-4" />
        {loginLabel}
      </Link>
    );
  }

  const resolvedVariant = variant ?? (optimisticFavorited ? "secondary" : "outline");

  return (
    <Button variant={resolvedVariant} size="lg" className={`${className ?? "w-full justify-center"} ${buttonClass}`} type="button" onClick={handleToggle}>
      <Heart className={`size-4 ${optimisticFavorited ? "fill-current" : ""}`} />
      {compact ? (optimisticFavorited ? "已收藏" : "收藏") : optimisticFavorited ? unfavoriteLabel : favoriteLabel}
    </Button>
  );
}
