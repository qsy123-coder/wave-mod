"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { useSession } from "@/components/features/auth/session-provider";
import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import type { ModSort } from "@/lib/mods";
import { cn } from "@/lib/utils";

type CharactersResponse = { characters: string[] };

const SORT_OPTIONS: { label: string; value: ModSort }[] = [
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
];

/** 与 Tailwind 的 `md` 断点对齐（本组件只在手机端挂载，桌面端不拉任何数据） */
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/**
 * 手机端首页第二块：角色分类头像墙 + 排序 + 资源卡片流。
 *
 * 为什么整个组件在桌面端不挂载：它虽然被 `md:hidden` 的容器包着，但客户端组件
 * 在桌面端照样会 hydration、照样会发请求。这里先用 matchMedia 判断，桌面端只渲染
 * 骨架（被隐藏），不触发 `/api/characters` 与 `/api/mods`。
 *
 * 数据全部走已有的公开接口：
 * - `/api/characters`：库内 distinct character（权威口径，见 api/characters/route.ts）
 * - `/api/mods`：与 `/mods` 完全一致的分页/筛选参数
 *
 * 首页因此仍然可静态化：服务端不新增任何全表查询，卡片流由客户端按需拉取。
 */
export function MobileHomeFeed() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (!isMobile) {
    return <MobileHomeFeedSkeleton />;
  }

  return <MobileHomeFeedContent />;
}

function MobileHomeFeedContent() {
  const { isLoggedIn, isAdmin, user } = useSession();
  const [character, setCharacter] = useState<string | null>(null);
  const [sort, setSort] = useState<ModSort>("latest");
  const [openModId, setOpenModId] = useState<string | null>(null);

  const { data, isError } = useQuery({
    queryKey: ["home-mobile-characters"],
    queryFn: async () => {
      const response = await fetch("/api/characters");
      if (!response.ok) throw new Error("加载角色分类失败。");
      return (await response.json()) as CharactersResponse;
    },
    // 与 /api/characters 的 s-maxage=300 对齐
    staleTime: 5 * 60 * 1000,
  });

  const characters = data?.characters ?? [];

  return (
    <section className="px-4 pb-10">
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-lg font-black uppercase tracking-[0.08em] text-black">角色分类</h2>
        <Link
          href="/mods"
          prefetch={false}
          className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.14em] text-black/55"
        >
          全部资源
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* 单行横滑：第一格「全部」，其后是库内角色。
          隐藏滚动条是为了不出现一条横穿头像条的灰色横杠（iOS 上尤其明显）。 */}
      <div
        data-slot="mobile-character-rail"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <CharacterCell
          label="全部"
          active={character === null}
          onClick={() => setCharacter(null)}
        />
        {characters.map((name) => (
          <CharacterCell
            key={name}
            label={name}
            active={character === name}
            onClick={() => setCharacter(name)}
          />
        ))}
      </div>

      {isError ? (
        <p className="mb-2 text-[11px] font-black text-black/50">
          角色分类加载失败，可直接浏览下方资源。
        </p>
      ) : null}

      <div className="mb-3 mt-1 flex items-center gap-2">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setSort(option.value)}
            aria-pressed={sort === option.value}
            className={cn(
              "border-[3px] border-black px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
              sort === option.value
                ? "bg-[#ff7a7a] text-black"
                : "bg-white text-black/60",
            )}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto truncate text-[10px] font-black uppercase tracking-[0.12em] text-black/40">
          {character ?? "全部角色"}
        </span>
      </div>

      <ModsInfiniteGrid
        character={character ?? undefined}
        sort={sort}
        layoutMode="masonry"
        // 手机端固定 2 列：不传的话网格在水合首帧会按桌面 5 列铺骨架，随后才跳成 2 列。
        masonryColumns={2}
        isLoggedIn={isLoggedIn}
        onCardClick={setOpenModId}
      />

      {openModId ? (
        <ModDetailDrawer
          key={openModId}
          admin={isAdmin}
          currentUserId={user?.id}
          currentUserName={user?.displayName ?? "我"}
          isLoggedIn={isLoggedIn}
          modId={openModId}
          onClose={() => setOpenModId(null)}
        />
      ) : null}
    </section>
  );
}

function CharacterCell({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const avatarPath = label === "全部" ? null : getCharacterImagePath(label);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      data-slot="mobile-character-item"
      className={cn(
        "flex w-[60px] shrink-0 flex-col items-center gap-1 border-2 border-black p-1.5 text-center shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
        active ? "bg-[#ff7a7a] text-black" : "bg-white text-black/70",
      )}
    >
      {avatarPath ? (
        <Image
          src={avatarPath}
          alt={label}
          width={44}
          height={44}
          unoptimized
          className="size-11 shrink-0 rounded-full border-2 border-black object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#fff8ef] text-sm font-black text-black/55"
        >
          {label.slice(0, 1)}
        </span>
      )}
      <span className="w-full truncate text-[10px] font-black leading-none tracking-[0.02em]">
        {label}
      </span>
    </button>
  );
}

/**
 * 水合前的占位：与真实内容同构（头像条 + 排序 + 两列卡片），
 * 只出现在手机端容器里；桌面端它被 `md:hidden` 隐藏，且不会发起请求。
 */
function MobileHomeFeedSkeleton() {
  return (
    <section className="px-4 pb-10" aria-hidden>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="h-6 w-24 animate-pulse border-2 border-black bg-white/60" />
        <div className="h-4 w-16 animate-pulse border-2 border-black bg-white/60" />
      </div>
      <div className="flex gap-2 overflow-hidden pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-2 border-black bg-white p-1.5"
          >
            <div className="size-11 animate-pulse rounded-full bg-black/10" />
            <div className="h-2 w-8 animate-pulse bg-black/10" />
          </div>
        ))}
      </div>
      <div className="mb-3 mt-1 flex gap-2">
        <div className="h-7 w-14 border-[3px] border-black bg-white" />
        <div className="h-7 w-14 border-[3px] border-black bg-white" />
      </div>
      <div className="flex gap-4">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="flex flex-1 flex-col gap-4">
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="border-2 border-black bg-white p-2">
                <div className="aspect-[3/4] animate-pulse bg-black/10" />
                <div className="mt-2 h-3 w-3/4 animate-pulse bg-black/10" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
