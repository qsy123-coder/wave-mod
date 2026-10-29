"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Grid3X3, Search } from "lucide-react";

import { useSession } from "@/components/features/auth/session-provider";
import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModsInfiniteGrid } from "@/components/features/mods/list/mods-infinite-grid";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import { buildModsFilterHref, isPlainLeftClick } from "@/lib/navigation-url";
import type { ModSort, SiteMod } from "@/lib/mods";
import { cn } from "@/lib/utils";

import { MobileCharacterDrawer } from "./mobile-character-drawer";

type CharactersResponse = { characters: string[] };

type MobileHomeFeedProps = {
  /** 服务端预渲染的角色清单（6 小时缓存），首屏头像直接进 HTML */
  initialCharacters: string[];
  /** 服务端预渲染的第一页资源，首屏卡片图不再等客户端 API */
  initialMods: SiteMod[];
  initialTotalCount: number;
};

const SORT_OPTIONS: { label: string; value: ModSort }[] = [
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
];

/** 横向角色条首屏只渲染这么多头像，其余在「全部角色」抽屉里看 */
const RAIL_AVATAR_LIMIT = 12;

/**
 * 打开详情抽屉只改 `openModId`，不该让 16+ 张卡片的瀑布流跟着重渲染。
 * 网格的其余 props（character / sort / isLoggedIn / onCardClick）此时都没变，
 * memo 会直接跳过；这是点击后「短暂卡顿才打开」的主要来源。
 */
const MemoizedModsInfiniteGrid = memo(ModsInfiniteGrid);

/**
 * 手机端首页第二块：角色分类 + 排序 + 资源卡片流。
 *
 * 视觉上把「角色小卡片 / 排序 chips」收进一张奶油色硬阴影卡片里，而不是直接
 * 铺在深棕色页面背景上 —— 这是 <docs/样式参考.md> 的卡片规范（border-4 + 硬阴影 +
 * 高对比文字），也让「角色分类」标题在深色背景上不再糊成一片。
 *
 * 首屏数据由页面服务端下发（`getAvailableCharacters` + `getPublicModsPage`，都走
 * 6 小时分片缓存），因此角色头像和第一页卡片图会直接出现在 HTML 里，浏览器解析到就
 * 开始下载 —— 不再等 JS 水合后再请求 `/api/characters` 与 `/api/mods`。
 *
 * 桌面端仍然靠 `md:hidden` 隐藏这份内容；网格用 `initialMods` 播种，不会重复请求第一页，
 * 隐藏的哨兵也不会触发无限滚动。
 */
export function MobileHomeFeed(props: MobileHomeFeedProps) {
  return <MobileHomeFeedContent {...props} />;
}

function MobileHomeFeedContent({
  initialCharacters,
  initialMods,
  initialTotalCount,
}: MobileHomeFeedProps) {
  const { isLoggedIn, isAdmin, user } = useSession();
  const [character, setCharacter] = useState<string | null>(null);
  const [sort, setSort] = useState<ModSort>("latest");
  const [openModId, setOpenModId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const { data, isError } = useQuery({
    queryKey: ["home-mobile-characters"],
    queryFn: async () => {
      const response = await fetch("/api/characters");
      if (!response.ok) throw new Error("加载角色分类失败。");
      return (await response.json()) as CharactersResponse;
    },
    // 服务端已经给了清单就先用着；只有清单为空（快照也拿不到）时才在客户端补拉
    initialData: initialCharacters.length > 0 ? { characters: initialCharacters } : undefined,
    // 与 /api/characters 的 s-maxage=300 对齐
    staleTime: 5 * 60 * 1000,
  });

  const characters = data?.characters ?? initialCharacters;

  // 水合标记：服务端直出的角色格在水合前只是真链接（点击会去 /mods），
  // 测试与排查都靠它区分「HTML 已到」和「交互已可用」。
  useEffect(() => {
    rootRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  // 首屏只渲染前 12 个头像；若当前选中的角色在 12 之后，把它追加进来保证高亮可见
  const railCharacters = characters.slice(0, RAIL_AVATAR_LIMIT);
  if (character && !railCharacters.includes(character)) {
    railCharacters.push(character);
  }

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
    <section ref={rootRef} className="px-4 pb-10">
      <div
        data-slot="mobile-character-panel"
        className="border-4 border-black bg-[var(--neo-panel)] p-3 shadow-[4px_4px_0px_0px_#000] md:shadow-[8px_8px_0px_0px_#000]"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="inline-flex -rotate-1 items-center border-[3px] border-black bg-[var(--neo-secondary)] px-3 py-1 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[3px_3px_0px_0px_#000]">
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

        {/*
         * 搜索框从首屏品牌卡挪到这里（用户要求：放在角色分类处）。
         *
         * 仍是原生 GET 表单（action=/mods，参数名 query），不依赖客户端 JS ——
         * 水合前也能提交，弱网下不会出现「点了没反应」的死窗口。
         */}
        <form
          action="/mods"
          method="get"
          role="search"
          data-slot="mobile-home-search"
          className="mb-3 flex items-stretch gap-1 border-[3px] border-black bg-white p-1 shadow-[3px_3px_0px_0px_#000]"
        >
          <input
            type="search"
            name="query"
            placeholder="搜索资源 / 角色 / 关键词"
            aria-label="搜索外观资源"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm font-bold text-black outline-none placeholder:text-black/35"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-1 border-[3px] border-black bg-[var(--neo-accent)] px-3 text-[11px] font-black uppercase tracking-[0.14em] text-black active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Search className="size-3.5" />
            搜索
          </button>
        </form>

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
              href="/mods"
              active={character === null}
              onClick={() => setCharacter(null)}
            />
            {railCharacters.map((name) => (
              <CharacterCell
                key={name}
                label={name}
                href={buildModsFilterHref("/mods", { character: name })}
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
            className="flex w-[64px] shrink-0 flex-col items-center justify-center gap-1 border-[3px] border-black bg-[var(--neo-secondary)] p-1.5 text-center shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
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
                  ? "bg-[var(--neo-accent)] text-black"
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
        <MemoizedModsInfiniteGrid
          character={character ?? undefined}
          sort={sort}
          // ⚠️ 种子只对应「全部角色 + 最新」这一组筛选。
          //
          // 网格把 initialMods 直接灌进 `initialData`，而 React Query 的 initialData
          // 对**每一个新 queryKey** 都生效：点角色后新 key 也会被种上这份全库第一页，
          // 配合 staleTime 5 分钟 ⇒ 页面永远不拉该角色的第一页，只会在无限滚动时
          // 拉到带筛选的第 2 页（实测：点「爱弥斯」后第一页仍是心月狐，列表变成
          // 16 条旧的 + 16 条新的）。所以换筛选时必须把种子撤掉，让网格自己拉。
          initialMods={character === null && sort === "latest" ? initialMods : undefined}
          initialTotalCount={character === null && sort === "latest" ? initialTotalCount : undefined}
          layoutMode="masonry"
          // 手机端固定 2 列。必须传：网格量不到视口时（SSR / 水合首帧）会直接采信
          // 这个值（见 resolvePreferredColumns）。不传的话 HTML 第一版会按桌面口径
          // 铺 5 列卡片 / 骨架，等水合后才跳成 2 列（2026-10-29 用户报的就是这个）。
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
  href,
  active,
  onClick,
}: {
  label: string;
  /** 水合前是真链接；水合后 preventDefault，只在首页原地筛选 */
  href: string;
  active: boolean;
  onClick: () => void;
}) {
  const avatarPath = label === "全部" ? null : getCharacterImagePath(label);

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={(event) => {
        // 修饰键/中键放行给浏览器（新标签页），其余拦截成原地筛选
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        onClick();
      }}
      aria-pressed={active}
      title={label}
      data-slot="mobile-character-item"
      className={cn(
        "flex w-[64px] shrink-0 flex-col items-center gap-1 border-[3px] border-black p-1.5 text-center shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
        active ? "bg-[var(--neo-accent)] text-black" : "bg-white text-black/70",
      )}
    >
      {avatarPath ? (
        <Image
          src={avatarPath}
          alt={label}
          width={44}
          height={44}
          unoptimized
          loading="lazy"
          // 头像不是首屏主内容：让位给第一页卡片图（前 4 张是 eager/high）
          fetchPriority="low"
          className="size-11 shrink-0 rounded-full border-2 border-black object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[var(--neo-panel)] text-sm font-black text-black/55"
        >
          {label.slice(0, 1)}
        </span>
      )}
      <span className="w-full truncate text-[10px] font-black leading-none tracking-[0.02em]">
        {label}
      </span>
    </Link>
  );
}

/**
 * 水合前的占位：与真实内容同构（浅色控制卡 + 两列卡片），
 * 只出现在手机端容器里；桌面端它被 `md:hidden` 隐藏，且不会发起请求。
 */
export function MobileHomeFeedSkeleton() {
  return (
    <section className="px-4 pb-10" aria-hidden>
      <div className="border-4 border-black bg-[var(--neo-panel)] p-3 shadow-[4px_4px_0px_0px_#000] md:shadow-[8px_8px_0px_0px_#000]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="h-8 w-24 animate-pulse border-[3px] border-black bg-[var(--neo-secondary)]" />
          <div className="h-6 w-20 animate-pulse border-2 border-black bg-white" />
        </div>
        {/* 搜索框占位：与真实表单同高（边框 3 + 内边距 + 输入行 ≈ 46px），避免加载完成时跳动 */}
        <div className="mb-3 h-[46px] w-full animate-pulse border-[3px] border-black bg-white" />
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
          <div className="flex w-[64px] shrink-0 flex-col items-center justify-center gap-1 border-[3px] border-black bg-[var(--neo-secondary)] p-1.5">
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
