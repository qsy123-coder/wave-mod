"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Heart, ThumbsUp } from "lucide-react";

import { toggleLikeAction } from "@/actions/mods/like-actions";
import { Button } from "@/components/ui/button";

type LikeButtonProps = {
  className?: string;
  compact?: boolean;
  modId: string;
  isLiked: boolean;
  isLoggedIn: boolean;
  likeCount: number;
  nextPath: string;
};

export function LikeButton({ className, compact = false, modId, isLiked, isLoggedIn, likeCount, nextPath }: LikeButtonProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const [optimisticLiked, setOptimisticLiked] = useState(isLiked);
  const [optimisticLikeCount, setOptimisticLikeCount] = useState(likeCount);

  const buttonClass = compact
    ? "h-11 border-4 border-black px-3 text-[11px] font-black uppercase tracking-[0.12em] shadow-[4px_4px_0px_0px_#000]"
    : "h-14 text-sm font-black uppercase tracking-[0.16em]";

  const handleToggle = () => {
    const previousLiked = optimisticLiked;
    const previousCount = optimisticLikeCount;
    const nextLiked = !previousLiked;
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    setOptimisticLiked(nextLiked);
    setOptimisticLikeCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));

    startTransition(async () => {
      const formData = new FormData();
      formData.set("modId", modId);

      try {
        await toggleLikeAction(formData);
        router.refresh();
      } catch {
        if (requestIdRef.current === requestId) {
          setOptimisticLiked(previousLiked);
          setOptimisticLikeCount(previousCount);
        }
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
        {compact ? "登录后点赞" : `登录后点赞 · ${likeCount}`}
      </Link>
    );
  }

  return (
    <Button variant={optimisticLiked ? "secondary" : "outline"} size="lg" className={`${className ?? "w-full justify-center"} ${buttonClass}`} type="button" onClick={handleToggle}>
      <ThumbsUp className={`size-4 ${optimisticLiked ? "fill-current" : ""}`} />
      {compact ? (optimisticLiked ? `已赞 ${optimisticLikeCount}` : `点赞 ${optimisticLikeCount}`) : optimisticLiked ? `取消点赞 · ${optimisticLikeCount}` : `点赞支持 · ${optimisticLikeCount}`}
    </Button>
  );
}
