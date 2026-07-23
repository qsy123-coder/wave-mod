"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Heart } from "lucide-react";

type Props = {
  modId: string;
  isFavorited: boolean;
  isLoggedIn: boolean;
  inline?: boolean;
};

export function CardFavoriteButton({ modId, isFavorited, isLoggedIn, inline }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(false);

  // 水合后同步服务端状态，避免 SSR 与客户端渲染不一致
  useEffect(() => {
    setOptimistic(isFavorited);
  }, [isFavorited]);

  const sharedClass = inline
    ? "inline-flex items-center gap-0.5 border-[2px] border-black bg-[#fff8ef] px-1 py-0.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5"
    : "absolute bottom-12 right-2 z-20 inline-flex items-center gap-0.5 border-[2px] border-black bg-[#fff8ef] px-1 py-0.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5";

  if (!isLoggedIn) {
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(`/mods/${modId}`)}&mode=user`}
        className={sharedClass}
        onClick={(e) => e.stopPropagation()}
      >
        <Heart className="size-2.5 text-black/50" />
        <span className="text-[8px] font-black uppercase text-black/50">收藏</span>
      </Link>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={`${sharedClass} cursor-pointer`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const prev = optimistic;
        setOptimistic(!prev);
        startTransition(async () => {
          try {
            const formData = new FormData();
            formData.set("id", modId);
            const { toggleFavoriteAction } = await import("@/actions/mods/favorite-actions");
            await toggleFavoriteAction(formData);
            router.refresh();
          } catch {
            setOptimistic(prev);
          }
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          (e.target as HTMLElement).click();
        }
      }}
    >
      <Heart className={`size-2.5 ${optimistic ? "fill-[#ff7a7a] text-[#ff7a7a]" : "text-black/50"}`} />
      <span className={`text-[8px] font-black uppercase ${optimistic ? "text-[#ff7a7a]" : "text-black/50"}`}>收藏</span>
    </span>
  );
}
