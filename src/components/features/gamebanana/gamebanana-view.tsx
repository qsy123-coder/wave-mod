"use client";

import { useCallback, type FormEvent, type MouseEvent } from "react";

import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { GamebananaDetailDrawer } from "@/components/features/gamebanana/gamebanana-detail-drawer";
import { GamebananaGrid } from "@/components/features/gamebanana/gamebanana-grid";
import {
  applyGamebananaFilters,
  buildGamebananaHref,
  countGamebananaCharacters,
  DEFAULT_GAMEBANANA_FILTERS,
  gamebananaListingKey,
  type GamebananaFilters,
} from "@/lib/gamebanana-domain/filter-params";
import type { GamebananaMod, GamebananaSort } from "@/lib/gamebanana-domain/types";
import { isPlainLeftClick } from "@/lib/navigation-url";
import { cn } from "@/lib/utils";

/**
 * 列表页的**呈现层**：拿到筛选条件就渲染，自己不读 URL、不持有状态。
 *
 * 这样服务端（预渲染的 fallback）与客户端（从 URL 读出来的那一份）用的是同一段
 * 渲染代码，不可能出现「HTML 一套、客户端一套」的错位 —— 与 `ModsListingView` 同理。
 */

const sortOptions: { label: string; value: GamebananaSort }[] = [
  { label: "热门", value: "hot" },
  { label: "最新", value: "latest" },
  { label: "下载最多", value: "downloads" },
  { label: "浏览最多", value: "views" },
];

type GamebananaViewProps = {
  /** 全库列表（服务端一次下发）。筛选与排序都在这里本地做。 */
  mods: GamebananaMod[];
  filters: GamebananaFilters;
  /**
   * 用户改筛选。**不传就是纯静态渲染**（预渲染的那份 fallback）——
   * 那时所有筛选控件退化为真链接，点击走浏览器原生导航。
   */
  onFilterChange?: (patch: Partial<GamebananaFilters>) => void;
  /**
   * 详情抽屉这一摊子。**不传就是纯静态渲染**（预渲染那份 fallback）：卡片是真链接，
   * 点击走浏览器原生导航到 `/gamebanana/<id>` 整页 —— 也就是抽屉出现之前的行为，
   * 所以这条路任何时候都还能用（水合前、禁 JS、分享链接）。
   *
   * 打包成一个对象而不是三个平铺的 prop：这三件事只在「抽屉开着」时有意义，
   * 平铺会让「只传了 onOpen 没传 onClose」这种半截状态在类型上成立。
   */
  detail?: {
    /** 当前打开的那条；null = 没开抽屉。整条数据从列表里来，见抽屉组件的注释。 */
    openMod: GamebananaMod | null;
    /** 点卡片：传 `gb_id` 字符串（与 ModCard 的 mod.id 同构） */
    onOpen: (gbId: string) => void;
    onClose: () => void;
    onCharacterClick: (character: string) => void;
  };
};

export function GamebananaView({ mods, filters, onFilterChange, detail }: GamebananaViewProps) {
  /**
   * 统一的筛选控件点击。
   *
   * 每个控件都是**真 `<a href>`**，这里只在水合之后把它接管掉：水合前点击走浏览器
   * 原生跳转（坏网络下水合可能晚十几秒，真链接自带加载指示，不会「点了没反应」——
   * 见 memory: prerender-click-dead-window）。
   *
   * 水合后**不调 router.push**，而是改本地状态 + `history.pushState`。刻意的：
   * `/mods` 上有一类「同路由只换 search」的导航被 App Router 丢掉（筛选页上再点
   * 分类整下没反应，见 memory: mods-listing-remount-filtered-nav-dead）。这里全部
   * 数据都在本地，根本不需要路由参与，绕开那一整类问题。URL 仍然同步更新，
   * 分享/刷新/前进后退都照常。
   */
  const handleNav = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, patch: Partial<GamebananaFilters>) => {
      // 没接状态（预渲染的那份）或带修饰键的点击 → 一律交给浏览器
      if (!onFilterChange || !isPlainLeftClick(event)) return;
      event.preventDefault();
      onFilterChange(patch);
    },
    [onFilterChange],
  );

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (!onFilterChange) return; // 未水合：让表单自己 GET 过去
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("query");
      onFilterChange({ query: typeof value === "string" && value.trim() ? value.trim() : undefined });
    },
    [onFilterChange],
  );

  const hrefFor = (patch: Partial<GamebananaFilters>) => buildGamebananaHref(filters, patch);

  const counts = countGamebananaCharacters(mods, filters);
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  /**
   * 角色顺序按**条数降序**。站内 `/mods` 用的是 characterImageMap 的固定顺序，
   * 但那是人工维护的站内角色表；这里是搬运库，条数分布差异极大（几十条 vs 一条），
   * 按条数排能让有内容的角色浮上来，而不是让用户在一串 1 条的条目里找。
   */
  const sidebarCharacters = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => ({
      label,
      count,
      href: hrefFor({ character: label }),
      isActive: label === filters.character,
    }));

  /**
   * 被 nsfw 开关挡掉的条数。不给这个数，用户会以为库里就这么点东西 ——
   * 实测 hide 占了全库 57%（165/288），是个会让人误判的比例。
   */
  const hiddenCount = mods.filter((m) => m.visibility === "hide").length;

  const visibleMods = applyGamebananaFilters(mods, filters);

  return (
    <>
      <div className="hidden w-[240px] shrink-0 flex-col lg:flex">
        <div
          className="flex-1 overflow-y-auto pr-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <CharacterSidebar
            allLabel="全部"
            allHref={hrefFor({ character: undefined })}
            allCount={totalCount}
            isAllActive={!filters.character}
            characters={sidebarCharacters}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2 border-4 border-black bg-[#fff8ef] p-2.5 shadow-[6px_6px_0px_0px_#000]">
          <form action="/gamebanana" method="get" onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            {/* 表单会把整个 query 换成自己的字段，所以其余维度必须显式带上，
                否则搜一次就把「当前角色」「NSFW 开关」全丢了 */}
            {filters.sort !== DEFAULT_GAMEBANANA_FILTERS.sort ? (
              <input type="hidden" name="sort" value={filters.sort} />
            ) : null}
            {filters.character ? <input type="hidden" name="character" value={filters.character} /> : null}
            {filters.nsfw ? <input type="hidden" name="nsfw" value="1" /> : null}
            <input
              // 非受控输入：key 跟着「生效的搜索词」变，才会在点「清除」时把框里
              // 那段旧文字也清掉（改 defaultValue 对已挂载的输入框无效）。
              key={filters.query ?? ""}
              type="search"
              name="query"
              defaultValue={filters.query ?? ""}
              placeholder="搜索标题…"
              maxLength={100}
              className="w-40 border-[3px] border-black bg-white px-2 py-1 text-xs font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none sm:w-56"
            />
            <button
              type="submit"
              className="border-[3px] border-black bg-[#ffd84f] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
            >
              搜索
            </button>
            {filters.query ? (
              <a
                href={hrefFor({ query: undefined })}
                onClick={(event) => handleNav(event, { query: undefined })}
                className="border-[3px] border-black bg-white px-2 py-1 text-xs font-black text-black/70 shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
              >
                清除
              </a>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {sortOptions.map((opt) => (
              <a
                key={opt.value}
                href={hrefFor({ sort: opt.value })}
                onClick={(event) => handleNav(event, { sort: opt.value })}
                className={cn(
                  "border-[3px] border-black px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5",
                  opt.value === filters.sort ? "bg-[#ff7a7a] text-black" : "bg-white text-black/75",
                )}
              >
                {opt.label}
              </a>
            ))}
          </div>

          {/*
            刻意**不加** `aria-pressed`：这是个 `<a>`（本质是导航，不是开关按钮），
            该属性在 link 角色上不合法、ESLint 会报。开关状态已经由文案本身表达了
            （「显示成人内容」↔「已显示成人内容」），屏幕阅读器读到的就是真实状态。
          */}
          <a
            href={hrefFor({ nsfw: !filters.nsfw })}
            onClick={(event) => handleNav(event, { nsfw: !filters.nsfw })}
            className={cn(
              "border-[3px] border-black px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5",
              filters.nsfw ? "bg-[#bcaeff] text-black" : "bg-white text-black/75",
            )}
          >
            {filters.nsfw ? "已显示成人内容" : `显示成人内容${hiddenCount > 0 ? ` (${hiddenCount})` : ""}`}
          </a>

          <span className="ml-auto text-xs font-black uppercase tracking-[0.14em] text-black/60">
            共 {visibleMods.length} 个
          </span>
        </div>

        <div className="flex-1 overflow-y-auto pt-4 scrollbar-minimal">
          <GamebananaGrid
            mods={visibleMods}
            listingKey={gamebananaListingKey(filters)}
            // 未接状态时是 undefined：卡片退化为真链接，水合前的点击照样能整页跳过去
            onCardClick={detail ? detail.onOpen : undefined}
          />
        </div>

        {/*
          抽屉挂**主列里面**，不是 `<>{...}</>` 的第三个孩子。
          外层布局（layout.tsx）是 `flex gap-6` 的横向 flex，多一个零宽子元素就会多出
          24px 的 gap，列表会被挤窄一截；而抽屉本体是 position:fixed，挂在哪儿都一样。
          与 /mods 把 ModDetailDrawer 放进主列是同一条。
        */}
        {detail?.openMod ? (
          <GamebananaDetailDrawer
            // key 用 gbId：换一条时让抽屉整个重挂 —— 否则 useQuery 的旧结果会先按
            // 上一条的标题渲染一帧（标题来自 props），图上线下不在同一件作品上。
            key={detail.openMod.gbId}
            mod={detail.openMod}
            onClose={detail.onClose}
            onCharacterClick={detail.onCharacterClick}
          />
        ) : null}
      </div>
    </>
  );
}
