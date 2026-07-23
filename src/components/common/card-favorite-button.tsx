"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Heart } from "lucide-react";

type Props = {
  modId: string;
  isFavorited: boolean;
  isLoggedIn: boolean;
};

export function CardFavoriteButton({ modId, isFavorited, isLoggedIn }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(false);

  // 水合后同步服务端状态，避免 SSR 与客户端渲染不一致
  useEffect(() => {
    setOptimistic(isFavorited);
  }, [isFavorited]);

  if (!isLoggedIn) {
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(`/mods/${modId}`)}&mode=user`}
        className="absolute bottom-12 right-2 z-20 inline-flex size-7 items-center justify-center border-[2.5px] border-black bg-[#fff8ef] shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Heart className="size-3.5 text-black/50" />
      </Link>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className="absolute bottom-12 right-2 z-20 inline-flex size-7 cursor-pointer items-center justify-center border-[2.5px] border-black bg-[#fff8ef] shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5"
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
      <Heart className={`size-3.5 ${optimistic ? "fill-[#ff7a7a] text-[#ff7a7a]" : "text-black/50"}`} />
    </span>
  );
}
