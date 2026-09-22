"use client";

import { ChevronDown, Columns2, LayoutGrid, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import type { MasonryColumns } from "@/components/features/mods/list/use-layout-preference";
import { buildModsFilterHref, isCurrentNavigationUrl } from "@/lib/navigation-url";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ModsToolbarProps = {
  gameModsPath: string;
  initialQuery?: string;
  sort: string;
  sortOptions: { label: string; value: string }[];
  sortHrefs: Record<string, string>;
  /** 当前 URL 上的「含直链」开关（服务端过滤，见 applyModQueryFilters） */
  activeDirect?: boolean;
  /** 当前 URL 上的「含预览图」开关 */
  activePreview?: boolean;
  activeCharacter?: string;
  activeQuery?: string;
  modCount?: number;
  className?: string;
  layoutMode?: "grid" | "masonry";
  onLayoutChange?: (mode: "grid" | "masonry") => void;
  masonryColumns?: MasonryColumns;
  onMasonryColumnsChange?: (cols: MasonryColumns) => void;
  onFilterChange?: () => void;
};

/**
 * 筛选下拉里的三行。「全部」= 两个开关都关，另外两行各自独立、可同时勾选。
 *
 * 文案是「含」不是「仅」：底层判据是有没有，不是「只有直链的那种」
 * （`m.downloadUrl` 有值即留下，挂着网盘链接的 mod 同样算数）。
 */
const filterOptions = [
  { key: "all" as const, label: "全部", color: "bg-white" },
  { key: "direct" as const, label: "含直链", color: "bg-[#4ade80]" },
  { key: "preview" as const, label: "含预览图", color: "bg-[#bcaeff]" },
];

function isFilterOptionActive(
  key: "all" | "direct" | "preview",
  { direct, preview }: { direct: boolean; preview: boolean },
) {
  if (key === "all") return !direct && !preview;
  if (key === "direct") return direct;
  return preview;
}

/**
 * 筛选条上的一枚卡片。给了 onClear 才在右上角挂一个叉。
 *
 * 叉是绝对定位的，**不参与排版**，所以卡片必须自己把它的位置留出来：
 * 带叉的一侧固定留 pr-6（24px，叉 16px + 右边距 4px），否则叉会直接压在文字上
 * （2026-09-22 用户报告）。
 */
function FilterChip({
  children,
  className,
  onClear,
  clearLabel,
}: {
  children: ReactNode;
  className?: string;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1 border-[3px] border-black py-1.5 pl-2.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]",
        onClear ? "pr-6" : "pr-2.5",
        className
      )}
    >
      {children}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-1 top-1 inline-flex size-4 items-center justify-center border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition hover:bg-[#ff7a7a]"
        >
          <X className="size-2.5" strokeWidth={4} />
        </button>
      ) : null}
    </span>
  );
}

export function ModsToolbar({
  gameModsPath,
  initialQuery = "",
  sort,
  sortOptions,
  sortHrefs,
  activeDirect = false,
  activePreview = false,
  activeCharacter,
  activeQuery,
  modCount,
  className,
  layoutMode = "grid",
  onLayoutChange,
  masonryColumns = 5,
  onMasonryColumnsChange,
  onFilterChange,
}: ModsToolbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  // 本地已提交搜索词：提交瞬间用于渲染「搜索: xxx」筛选条，随后与服务端 activeQuery 对齐
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);

  // 本地 sort state：点击时立即更新，服务端数据到达时同步
  const [localSort, setLocalSort] = useState(sort);
  // 本地已选角色：同上，点叉取消筛选时先让卡片消失，等服务端 props 回来再对齐
  const [localCharacter, setLocalCharacter] = useState(activeCharacter);
  // 两个开关同理：勾上/取消的瞬间先让勾和筛选条变过去，不等服务端。
  // 它们是**服务端**筛选（见 applyModQueryFilters），结果要等服务端 props 回来。
  const [localDirect, setLocalDirect] = useState(activeDirect);
  const [localPreview, setLocalPreview] = useState(activePreview);
  useEffect(() => { setLocalSort(sort); }, [sort]);
  useEffect(() => { setSubmittedQuery(activeQuery ?? ""); }, [activeQuery]);
  useEffect(() => { setLocalCharacter(activeCharacter); }, [activeCharacter]);
  useEffect(() => { setLocalDirect(activeDirect); }, [activeDirect]);
  useEffect(() => { setLocalPreview(activePreview); }, [activePreview]);

  // 排序列表的第一项就是「默认」（两个父组件都这么排），取消排序即复位到它
  const defaultSortValue = sortOptions[0]?.value ?? "default";

  /**
   * 拼筛选链接：参数约定（不传的字段 = 取消该筛选、sort=latest 省略）在
   * buildModsFilterHref 里，并有单测盯着。这里只补两件本地才知道的事：
   * 当前页路径，以及**没指定排序时沿用当前排序**（在角色分类页叉掉搜索词，
   * 不该顺带把排序也重置掉）。
   */
  const buildHref = (next: { query?: string; character?: string; sort?: string; direct?: boolean; preview?: boolean }) =>
    buildModsFilterHref(gameModsPath, { ...next, sort: next.sort ?? sort });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextQuery = query.trim();
    // 其余筛选一律按**眼前显示的状态**带过去（local* 而不是 active*）：点了叉之后
    // 服务端 props 还没回来时又去搜索，不该把刚叉掉的条件又搜回来
    const href = buildHref({
      query: nextQuery,
      character: localCharacter,
      direct: localDirect,
      preview: localPreview,
    });

    // 重复提交同一个搜索词 = 原地踏步：push 同 URL 不会让 props 变化，骨架屏会一直亮着
    // （理由见 navigation-url.ts）。此时筛选条已经显示着这个词，直接返回即可。
    if (isCurrentNavigationUrl(href)) return;

    // 立即骨架屏 + 筛选条显示搜索词
    onFilterChange?.();
    setSubmittedQuery(nextQuery);
    router.push(href);
  };

  /**
   * 切换筛选开关。两个开关互相独立、可同时开；「全部」= 两个都关。
   *
   * 与角色/搜索/排序一样是服务端筛选，所以要走一遍导航：先开骨架屏、同时把本地
   * 状态改掉让勾和筛选条**立刻**变过去，再 push。**不这么做就永远筛不出来** ——
   * 这两个条件必须由服务端在整表上判，客户端只拿得到已加载的几十条
   * （2026-09-22 用户报告：勾「含直链」一条都没有，因为全库就个位数条直链 mod，
   * 客户端那几十条里一条都轮不上）。
   *
   * 勾开关**不关菜单**（菜单项的 onSelect 里 preventDefault 掉了）：两个筛选常常
   * 要一起开，每次点完都关掉的话得反复重新打开。只有点「全部」才关。
   */
  const handleFilterToggle = (key: "all" | "direct" | "preview") => {
    const nextDirect = key === "all" ? false : key === "direct" ? !localDirect : localDirect;
    const nextPreview = key === "all" ? false : key === "preview" ? !localPreview : localPreview;

    if (key === "all") setFilterOpen(false);

    // 原地踏步（比如本来就没开、再点一次「全部」）：push 同 URL 不会让 props 变化，
    // 骨架屏会一直亮着，直接返回
    const href = buildHref({
      query: submittedQuery,
      character: localCharacter,
      direct: nextDirect,
      preview: nextPreview,
    });
    setLocalDirect(nextDirect);
    setLocalPreview(nextPreview);
    if (isCurrentNavigationUrl(href)) return;

    onFilterChange?.();
    router.push(href);
  };

  const handleSortSelect = (value: string) => {
    setLocalSort(value);
    const href = sortHrefs[value];
    // 选中当前已在用的排序同样是原地踏步：同 URL 短路；链接里显式写了默认值
    // （如 ?sort=latest）时 URL 不同但服务端解析结果相同，用 value !== sort 兜住。
    if (href && value !== sort && !isCurrentNavigationUrl(href)) {
      onFilterChange?.();
      router.push(href);
    }
    setSortOpen(false);
  };

  /**
   * 取消某一个筛选条件（筛选卡片右上角那个叉）。
   *
   * 五个筛选条件全在 URL 上，清掉就必须重新导航；做法与 handleSearch 一致：先开
   * 骨架屏，同时把本地状态改掉让那张卡**立刻**消失 —— 只 push 的话要等服务端 props
   * 回来卡片才没，点了叉半天没反应。
   */
  const handleClearFilter = (key: "character" | "query" | "direct" | "preview" | "sort") => {
    // 叉掉的那一维度置空，其余原样带过去
    const base = { query: submittedQuery, character: localCharacter, direct: localDirect, preview: localPreview };
    let href: string;

    if (key === "character") {
      setLocalCharacter(undefined);
      href = buildHref({ ...base, character: undefined });
    } else if (key === "query") {
      setQuery("");
      setSubmittedQuery("");
      href = buildHref({ ...base, query: undefined });
    } else if (key === "direct") {
      setLocalDirect(false);
      href = buildHref({ ...base, direct: false });
    } else if (key === "preview") {
      setLocalPreview(false);
      href = buildHref({ ...base, preview: false });
    } else {
      setLocalSort(defaultSortValue);
      href = buildHref({ ...base, sort: defaultSortValue });
    }

    if (isCurrentNavigationUrl(href)) return;
    onFilterChange?.();
    router.push(href);
  };

  // 触发器上的文案：没开任何开关就是「全部」，否则把开着的列出来（最多两个）
  const activeFilterLabels = [
    localDirect ? "含直链" : null,
    localPreview ? "含预览图" : null,
  ].filter((label) => label !== null);
  const filterLabel = activeFilterLabels.length > 0 ? activeFilterLabels.join("·") : "全部";
  const isFilterActive = activeFilterLabels.length > 0;
  const sortLabel = sortOptions.find((o) => o.value === localSort)?.label ?? "默认";
  const isSortActive = localSort !== "latest" && localSort !== "default";

  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-4 border-black bg-[#fff8ef] p-3 shadow-[6px_6px_0px_0px_#000]", className)}>
      {/* 分类标签 */}
      <span className="inline-flex items-center gap-1 border-4 border-black bg-[#ffd84f] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000]">
        分类
      </span>

      {/* 搜索框 */}
      <form onSubmit={handleSearch} className="flex flex-1 items-center gap-1.5 border-4 border-black bg-white px-3 py-2 shadow-[4px_4px_0px_0px_#000] min-w-[180px] max-w-md">
        <Search className="size-4 shrink-0 text-black/60" />
        <input
          name="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模组..."
          className="min-w-0 flex-1 bg-transparent text-xs font-black text-black outline-none placeholder:text-black/40"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1 border-[3px] border-black bg-[#ffd84f] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#000]"
        >
          搜索
        </button>
      </form>

      {/* 过滤条件下拉（全部 / 含直链 / 含预览图，后两者可同时勾） */}
      <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1 border-4 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
            isFilterActive ? "bg-[#4ade80] text-black" : "bg-white text-black"
          )}
        >
          {filterLabel}
          <ChevronDown className="size-3 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 border-4 border-black bg-[#fff8ef] p-2 text-black shadow-[8px_8px_0px_0px_#000]">
          {filterOptions.map((opt) => {
            const isActive = isFilterOptionActive(opt.key, { direct: localDirect, preview: localPreview });
            return (
              <DropdownMenuItem
                key={opt.key}
                className="cursor-pointer p-0 focus:bg-transparent"
                onSelect={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); handleFilterToggle(opt.key); }}
              >
                <div
                  className={cn(
                    "flex w-full items-center justify-between border-4 border-black px-3 py-2 text-sm font-black shadow-[4px_4px_0px_0px_#000]",
                    isActive ? "bg-black text-white border-white" : opt.color
                  )}
                >
                  <span>{opt.label}</span>
                  {isActive ? <span className="text-[10px]">✓</span> : null}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 排序下拉 */}
      <DropdownMenu open={sortOpen} onOpenChange={setSortOpen}>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1 border-4 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
            isSortActive ? "bg-[#ffd84f] text-black" : "bg-white text-black"
          )}
        >
          {sortLabel}
          <ChevronDown className="size-3 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36 border-4 border-black bg-[#fff8ef] p-2 text-black shadow-[8px_8px_0px_0px_#000]">
          {sortOptions.map((opt, index) => {
            const isActive = opt.value === localSort;
            const colors = ["bg-white", "bg-[#ffd84f]", "bg-[#ff7a7a]", "bg-[#bcaeff]", "bg-[#4ade80]"];
            return (
              <DropdownMenuItem
                key={opt.value}
                className="cursor-pointer p-0 focus:bg-transparent"
                onClick={(e) => { e.stopPropagation(); handleSortSelect(opt.value); }}
              >
                <div
                  className={cn(
                    "flex w-full items-center justify-between border-4 border-black px-3 py-2 text-sm font-black shadow-[4px_4px_0px_0px_#000]",
                    isActive ? "bg-black text-white border-white" : colors[index % colors.length]
                  )}
                >
                  <span>{opt.label}</span>
                  {isActive ? <span className="text-[10px]">✓</span> : null}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 布局切换 */}
      {onLayoutChange ? (
        <div className="ml-auto flex items-center gap-0.5">
          {/* 瀑布流列数选择器 */}
          {layoutMode === "masonry" && onMasonryColumnsChange ? (
            <div className="mr-2 flex items-center gap-0.5 border-4 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
              {([3, 4, 5, 6] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onMasonryColumnsChange(n)}
                  className={cn(
                    "px-1.5 py-1 text-xs font-black transition",
                    masonryColumns === n
                      ? "bg-black text-white"
                      : "text-black/40 hover:text-black"
                  )}
                  aria-label={`${n} 列`}
                  title={`${n} 列`}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-0.5 border-4 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
            <button
            type="button"
            onClick={() => onLayoutChange("grid")}
            className={cn(
              "px-2 py-2 transition",
              layoutMode === "grid"
                ? "bg-black text-white"
                : "text-black/55 hover:text-black"
            )}
            aria-label="网格布局"
            title="网格布局"
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange("masonry")}
            className={cn(
              "px-2 py-2 transition",
              layoutMode === "masonry"
                ? "bg-black text-white"
                : "text-black/55 hover:text-black"
            )}
            aria-label="瀑布流布局"
            title="瀑布流布局"
          >
            <Columns2 className="size-4" />
          </button>
        </div>
        </div>
      ) : null}

      {/* 当前筛选条件：除计数卡外，每张卡右上角的叉都能取消掉对应筛选 */}
      {(localCharacter || submittedQuery || isFilterActive || isSortActive) ? (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t-4 border-black pt-2">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-black/60">筛选：</span>
          {/* 计数不是筛选条件，取消没有意义 —— 这张卡不挂叉。
              五个筛选全在服务端做，所以这里就是**全库符合条件**的真总数。 */}
          {modCount !== undefined ? (
            <FilterChip className="bg-[#ffd84f]">共 {modCount} 个 MOD</FilterChip>
          ) : null}
          {localCharacter ? (
            <FilterChip
              className="bg-[#ffd84f]"
              onClear={() => handleClearFilter("character")}
              clearLabel={`取消角色筛选：${localCharacter}`}
            >
              角色: {localCharacter}
            </FilterChip>
          ) : null}
          {submittedQuery ? (
            <FilterChip
              className="bg-white"
              onClear={() => handleClearFilter("query")}
              clearLabel={`取消搜索：${submittedQuery}`}
            >
              搜索: {submittedQuery}
            </FilterChip>
          ) : null}
          {localDirect ? (
            <FilterChip
              className="bg-[#4ade80]"
              onClear={() => handleClearFilter("direct")}
              clearLabel="取消含直链筛选"
            >
              含直链
            </FilterChip>
          ) : null}
          {localPreview ? (
            <FilterChip
              className="bg-[#bcaeff]"
              onClear={() => handleClearFilter("preview")}
              clearLabel="取消含预览图筛选"
            >
              含预览图
            </FilterChip>
          ) : null}
          {isSortActive ? (
            <FilterChip
              className="bg-[#ffd84f]"
              onClear={() => handleClearFilter("sort")}
              clearLabel={`取消排序：${sortLabel}`}
            >
              排序: {sortLabel}
            </FilterChip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
