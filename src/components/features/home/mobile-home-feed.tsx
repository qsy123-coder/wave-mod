"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Grid3X3 } from "lucide-react";

import { useSession } from "@/components/features/auth/session-provider";
import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import type { ModSort } from "@/lib/mods";
import { cn } from "@/lib/utils";

import { MobileCharacterDrawer } from "./mobile-character-drawer";

type CharactersResponse = { characters: string[] };

const SORT_OPTIONS: { label: string; value: ModSort }[] = [
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
];

/** 与 Tailwind 的 `md` 断点对齐（本组件只在手机端挂载，桌面端不拉任何数据） */
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/**
 * 手机端首页第二块：角色分类 + 排序 + 资源卡片流。
 *
 * 视觉上把「角色小卡片 / 排序 chips」收进一张奶油色硬阴影卡片里，而不是直接
 * 铺在深棕色页面背景上 —— 这是 <docs/样式参考.md> 的卡片规范（border-4 + 硬阴影 +
 * 高对比文字），也让「角色分类」标题在深色背景上不再糊成一片。
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

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

  /**
   * 选中角色后把横向角色条滚到该项。
   *
   * 从「全部角色」抽屉里选一个靠后的角色时，它在横条里可能在屏幕外 ——
   * 不滚过去的话，用户看不到自己刚选中的是哪一格。只滚横条本身，不动页面。
   */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    if (character === null) {
      rail.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    const active = rail.querySelector<HTMLElement>(
      '[data-slot="mobile-character-item"][aria-pressed="true"]',
    );
    if (!active) return;

    const railRect = rail.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset = activeRect.left - railRect.left + rail.scrollLeft;
    const target = offset - (rail.clientWidth - active.clientWidth) / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [character]);

  const selectCharacter = (next: string | null) => {
    setCharacter(next);
    setPickerOpen(false);
  };

  return (
    <section className="px-4 pb-10">
      <div
        data-slot="mobile-character-panel"
        className="border-4 border-black bg-[#fff8ef] p-3 shadow-[8px_8px_0px_0px_#000]"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="inline-flex -rotate-1 items-center border-[3px] border-black bg-[#ffd84f] px-3 py-1 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[3px_3px_0px_0px_#000]">
            角色分类
          </h2>
          <Link
            href="/mods"
            prefetch={false}
            className="inline-flex shrink-0 items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-black/70 shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            全部资源
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="flex items-stretch gap-2">
          {/* 单行横滑：第一格「全部」，其后是库内角色。
              隐藏滚动条是为了不出现一条横穿头像条的灰色横杠（iOS 上尤其明显）。 */}
          <div
            ref={railRef}
            data-slot="mobile-character-rail"
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
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

          {/* 固定在最右侧的「全部角色」卡片：打开全角色抽屉，不占用横滑列表的发现路径 */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            className="flex w-[64px] shrink-0 flex-col items-center justify-center gap-1 border-[3px] border-black bg-[#ffd84f] p-1.5 text-center shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <Grid3X3 className="size-6" strokeWidth={2.5} />
            <span className="text-[10px] font-black leading-none">全部角色</span>
          </button>
        </div>

        {isError ? (
          <p className="mt-2 text-[11px] font-black text-black/55">
            角色分类加载失败，可直接浏览下方资源。
          </p>
        ) : null}
        {!data && !isError ? (
          <p className="mt-2 text-[11px] font-black text-black/45">角色分类加载中…</p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              aria-pressed={sort === option.value}
              className={cn(
                "border-[3px] border-black px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                sort === option.value
                  ? "bg-[#ff7a7a] text-black"
                  : "bg-white text-black/60",
              )}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto truncate text-[10px] font-black uppercase tracking-[0.12em] text-black/55">
            {character ?? "全部角色"}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <ModsInfiniteGrid
          character={character ?? undefined}
          sort={sort}
          layoutMode="masonry"
          // 手机端固定 2 列：不传的话网格在水合首帧会按桌面 5 列铺骨架，随后才跳成 2 列。
          masonryColumns={2}
          isLoggedIn={isLoggedIn}
          onCardClick={setOpenModId}
        />
      </div>

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

      <MobileCharacterDrawer
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        characters={characters}
        activeCharacter={character}
        onSelect={selectCharacter}
      />
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
        "flex w-[64px] shrink-0 flex-col items-center gap-1 border-[3px] border-black p-1.5 text-center shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
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
 * 水合前的占位：与真实内容同构（浅色控制卡 + 两列卡片），
 * 只出现在手机端容器里；桌面端它被 `md:hidden` 隐藏，且不会发起请求。
 */
function MobileHomeFeedSkeleton() {
  return (
    <section className="px-4 pb-10" aria-hidden>
      <div className="border-4 border-black bg-[#fff8ef] p-3 shadow-[8px_8px_0px_0px_#000]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="h-8 w-24 animate-pulse border-[3px] border-black bg-[#ffd84f]" />
          <div className="h-6 w-20 animate-pulse border-2 border-black bg-white" />
        </div>
        <div className="flex items-stretch gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-hidden pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex w-[64px] shrink-0 flex-col items-center gap-1 border-[3px] border-black bg-white p-1.5"
              >
                <div className="size-11 animate-pulse rounded-full bg-black/10" />
                <div className="h-2 w-8 animate-pulse bg-black/10" />
              </div>
            ))}
          </div>
          <div className="flex w-[64px] shrink-0 flex-col items-center justify-center gap-1 border-[3px] border-black bg-[#ffd84f] p-1.5">
            <div className="size-6 animate-pulse bg-black/15" />
            <div className="h-2 w-10 animate-pulse bg-black/15" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-3 w-8 animate-pulse bg-black/10" />
          <div className="h-8 w-14 border-[3px] border-black bg-white" />
          <div className="h-8 w-14 border-[3px] border-black bg-white" />
        </div>
      </div>

      <div className="mt-4 flex gap-4">
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
