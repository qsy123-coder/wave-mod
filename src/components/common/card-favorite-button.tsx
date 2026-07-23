"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  const [optimistic, setOptimistic] = useState(isFavorited);

  const sharedClass = inline
    ? "inline-flex items-center gap-0.5 border-[2px] border-black bg-[#fff8ef] px-1 py-0.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5"
    : "absolute bottom-12 right-2 z-20 inline-flex items-center gap-0.5 border-[2px] border-black bg-[#fff8ef] px-1 py-0.5 shadow-[1px_1px_0px_0px_#000] transition hover:-translate-y-0.5";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isLoggedIn) {
      router.push(`/auth/login?next=${encodeURIComponent(`/mods/${modId}`)}&mode=user`);
      return;
    }

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
  };

  return (
    <span
      role="button"
      tabIndex={0}
      className={`${sharedClass} cursor-pointer`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          handleClick(e as unknown as React.MouseEvent);
        }
      }}
    >
      <Heart className={`size-2.5 ${optimistic ? "fill-[#ff7a7a] text-[#ff7a7a]" : "text-black/50"}`} />
      <span className={`text-[8px] font-black uppercase ${optimistic ? "text-[#ff7a7a]" : "text-black/50"}`}>收藏</span>
    </span>
  );
}
