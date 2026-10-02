"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Columns2, LayoutGrid, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { columnOptionsForWidth, defaultColumnsForWidth, type MasonryColumns } from "@/components/features/mods/list/use-layout-preference";
import { useDebouncedValue } from "@/components/features/mods/list/use-debounced-value";
import type { ModsPage } from "@/lib/mods";
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
  /**
   * 联想取数要按游戏过滤。**不给就是默认游戏（鸣潮）** —— 分站必须传，否则联想框会
   * 列出鸣潮的 MOD（网格自己是一直传的，见 mods-infinite-grid 的 gameKey）。
   */
  gameKey?: string;
  /**
   * 点联想候选项。给了就交给它（/mods 传 openDrawer，就地开详情抽屉）；不给就整页
   * 跳转到 `${gameModsPath}/${modId}` —— 分站没有抽屉机制，点卡片本来就是整页跳，
   * 这样两边行为一致。
   */
  onSelectMod?: (modId: string) => void;
  modCount?: number;
  className?: string;
  layoutMode?: "grid" | "masonry";
  onLayoutChange?: (mode: "grid" | "masonry") => void;
  /** 用户显式选过的列数；`null` = 跟随网格自适应（手机上默认 2 列） */
  masonryColumns?: MasonryColumns | null;
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

/** 联想下拉最多几条。6 条 × 约 1KB 的响应体积，且面板不会高到被 /mods 的 overflow-hidden 外壳裁掉 */
const SUGGEST_LIMIT = 6;

/**
 * 焦点是否落在可编辑元素里。
 *
 * 只有 `/` 快捷键需要它：在输入框里打「/」是正常输入，不能被当成「聚焦搜索框」劫持。
 * 项目里没有现成的判定工具（已全库搜过），且只有这一处用，就不单抽模块了。
 */
function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
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
  gameKey,
  onSelectMod,
  modCount,
  className,
  layoutMode = "grid",
  onLayoutChange,
  masonryColumns = null,
  onMasonryColumnsChange,
  onFilterChange,
}: ModsToolbarProps) {
  const router = useRouter();
  // `/` 快捷键要用；输入框本身不依赖它做任何事
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);

  /**
   * 选择器的**选项**与**高亮**都按当前屏幕宽度算。
   *
   * - 选项：手机只要 2/3，桌面保持 3/4/5/6（口径见 columnOptionsForWidth）。
   * - 高亮：用户没显式选过时 masonryColumns 是 null，只比对 null 的话没有任何一项
   *   会高亮、看不出当前几列，所以按「当前生效列数」算。
   *
   * 初值用 Infinity ⇒ 首帧按桌面口径渲染，与服务端一致，不会 hydration mismatch。
   */
  const [viewportWidth, setViewportWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const columnOptions = columnOptionsForWidth(viewportWidth);
  const activeColumns = masonryColumns ?? defaultColumnsForWidth(viewportWidth);
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

  // ==================== 搜索联想 ====================

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  // 中文输入法合成中。ref 给同步的 keydown 判据用（state 更新是异步的，赶不上同一次按键），
  // state 给防抖 hook 当依赖用（合成结束要让 effect 重跑去发那一次取数）。
  const composingRef = useRef(false);
  const [composing, setComposing] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const suggestListboxId = useId();

  /**
   * 输入值 → 防抖 350ms → 取候选。
   *
   * 350ms 不是随手取的：`/api/mods?query=` 每次都要在内存里对全表（约 5292 条）做
   * filter + 相关度排序。分片有缓存、不碰 Supabase，但 CPU 是实打实每次都在烧，
   * 防抖是唯一的节流手段（TanStack v5 不会因为 queryKey 变了就去取消在途请求）。
   */
  const debouncedKeyword = useDebouncedValue(query, 350, { paused: composing });

  /**
   * 复用 `/api/mods`，不新建接口。
   *
   * 它干的就是「全表扫描 + 相关度排序 + 切前 N 条」，而相关度已经是 query 非空时的
   * 主排序键 —— 所以这里返回的前 6 条就是最该被联想的 6 条。更重要的是：**联想里
   * 看到的和按回车后第一页看到的，是同一个端点、同一套匹配与排序**，不会出现
   * 「联想说有、搜出来没有」。
   *
   * 四个参数必须与 handleSearch 完全一致，否则上面那条一致性就是假的：
   * 用 local* 而不是 active*（否则会把刚叉掉的条件搜回来）、sort 用当前排序
   * （否则 ?sort=hot 下联想序与结果序不一致）、带上 gameKey（否则分站会列出鸣潮的）。
   */
  const suggestQuery = useQuery({
    enabled: debouncedKeyword.trim().length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", pageSize: String(SUGGEST_LIMIT), sort });

      if (gameKey) params.set("gameKey", gameKey);
      if (localCharacter) params.set("character", localCharacter);
      if (localDirect) params.set("direct", "1");
      if (localPreview) params.set("preview", "1");
      params.set("query", debouncedKeyword.trim());

      const response = await fetch(`/api/mods?${params.toString()}`);
      if (!response.ok) throw new Error("加载搜索建议失败。");

      return (await response.json()) as ModsPage;
    },
    queryKey: ["mod-suggest", { character: localCharacter, direct: localDirect, gameKey, keyword: debouncedKeyword, preview: localPreview, sort }],
    refetchOnWindowFocus: false,
    // 与 /api/mods 带 query 时的 Cache-Control: s-maxage=60 对齐，来回删字不重复打服务端
    staleTime: 60_000,
  });

  const suggestions = suggestQuery.data?.items ?? [];
  // 面板显示看**当前输入**（立刻响应清空），取数看防抖后的关键词（滞后 350ms）
  const showSuggest = suggestOpen && query.trim().length > 0;

  /**
   * 结果集一变就把高亮归位。
   *
   * 不归位的话，新关键词的结果变少时 `suggestions[highlightIndex]` 会是 undefined：
   * Enter 静默无反应，或者高亮的位置和视觉上亮着的那条不是同一条。
   */
  useEffect(() => {
    setHighlightIndex(-1);
  }, [debouncedKeyword]);

  // 点面板外面收起。用 mousedown + contains 而不是 onBlur：blur 早于 click，
  // 面板会在点击落地之前卸载，表现为「点候选没反应」。同一套写法见
  // tutorial/components/tool-download-card.tsx:27-36。
  useEffect(() => {
    if (!showSuggest) return;

    const onMouseDown = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSuggestOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showSuggest]);

  // 排序列表的第一项就是「默认」（两个父组件都这么排），取消排序即复位到它
  const defaultSortValue = sortOptions[0]?.value ?? "default";

  /**
   * 拼筛选链接：参数约定（不传的字段 = 取消该筛选、sort=latest 省略）在
   * buildModsFilterHref 里，并有单测盯着。这里只补两件本地才知道的事：
   * 当前页路径，以及**没指定排序时沿用当前排序**（在角色分类页叉掉搜索词，
   * 不该顺带把排序也重置掉）。
   */
  const buildHref = useCallback(
    (next: { query?: string; character?: string; sort?: string; direct?: boolean; preview?: boolean }) =>
      buildModsFilterHref(gameModsPath, { ...next, sort: next.sort ?? sort }),
    [gameModsPath, sort],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    // 提交即收起联想。放在最前面：下面有一条「原地踏步」的早退，面板也得跟着收。
    setSuggestOpen(false);
    setHighlightIndex(-1);

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
  const handleClearFilter = useCallback((key: "character" | "query" | "direct" | "preview" | "sort") => {
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
  }, [buildHref, defaultSortValue, localCharacter, localDirect, localPreview, onFilterChange, router, submittedQuery]);

  /** 点/选中一条候选：收起面板，然后交给调用方（没有就整页跳转，分站是这条路径） */
  const selectSuggestion = (modId: string) => {
    setSuggestOpen(false);
    setHighlightIndex(-1);

    if (onSelectMod) {
      onSelectMod(modId);
      return;
    }

    router.push(`${gameModsPath}/${modId}`);
  };

  /**
   * 输入框上的键盘处理：联想面板的 ↑↓ / Enter / Esc 全在这儿。
   *
   * 面板本身没有 keydown，焦点**始终留在输入框**（option 不可聚焦，靠
   * aria-activedescendant 告诉读屏器当前是哪条）。焦点一旦离开输入框，
   * 键盘和 Esc 就全都够不着面板了。
   */
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    /**
     * 中文输入法的早退，**必须是第一句**。
     *
     * 合成期间 ↑↓ 是在候选字之间挑字、Enter 是确认候选，都不能被我们抢走；Esc 同理，
     * 那是取消候选字而不是关面板。三个判据缺一不可：
     * - `composingRef.current` —— 兜住「提交合成的那一次 Enter」。某些 WebKit 在这次
     *   按键上把 `isComposing` 报成 false，只有自己记的 ref 才准。
     * - `nativeEvent.isComposing` —— React 的合成事件不暴露它，必须从原生事件上取。
     * - `keyCode === 229` —— Chrome 在合成期间的旧约定，作为最后一道。
     */
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;

    if (event.key === "Escape") {
      if (!showSuggest) return;
      event.preventDefault();
      setSuggestOpen(false);
      setHighlightIndex(-1);
      return;
    }

    if (!showSuggest || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    if (event.key === "Enter") {
      const target = suggestions[highlightIndex];
      // 没有高亮项就不拦：让表单走它原本的隐式提交（handleSearch）
      if (!target) return;

      // 不 preventDefault 的话会同时发生「打开详情」和「提交搜索」两件事
      event.preventDefault();
      selectSuggestion(target.id);
    }
  };

  /**
   * 键盘快捷键：`/` 聚焦搜索框，`Esc` 在搜索框里清空（与 ✕ 同义）。
   *
   * 两个必须让路的情形，缺一个就会出真 bug：
   *
   * 1. **有浮层开着就整个不响应。** `/mods` 上的角色分类抽屉（character-picker-drawer）
   *    同样监听 window 的 Esc，抽屉开着时按 Esc 只该关抽屉 —— 顺手把搜索词也清了的话，
   *    用户关个抽屉就丢掉了搜索条件。判据用 `role="dialog"`（sheet.tsx 的 SheetContent
   *    带这个属性），关闭时它整块从 DOM 移除，所以开关两态都判得准。
   * 2. **焦点在可编辑元素里时 `/` 必须放行**，否则用户在输入框里根本打不出斜杠。
   *
   * 依赖里带着 handleClearFilter（未 memo 化，每次渲染都是新引用）⇒ 监听会随每次渲染
   * 重新注册。这是故意的：换成空依赖 + ref 转发只是为了少两次 addEventListener，不值当。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      /**
       * Esc 的三级优先级：**联想面板 > 浮层(抽屉) > 清空搜索**。
       *
       * 这是独立于上面 handleInputKeyDown 的**第二条路径**（window 级 vs 输入框级），
       * 两者互不知情。少了这一句，焦点在输入框、面板开着时按 Esc：输入框那条只关面板，
       * 而这一条看不到任何浮层、会一路走到 handleClearFilter("query") —— 用户想关个
       * 候选框，搜索词却被清掉了。靠 preventDefault 拦不住另一个已经在 window 上的监听，
       * 所以必须在**这条路径上**自己判。
       *
       * 读的是 state 而不是 ref：下面依赖里的 handleClearFilter 未 memo 化，每次渲染
       * 都会重挂监听，闭包里的 suggestOpen 因而是新的。
       */
      if (suggestOpen) return;

      if (document.querySelector('[role="dialog"]')) return;

      if (event.key === "/" && !isEditableElement(document.activeElement)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        handleClearFilter("query");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClearFilter, suggestOpen]);

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

      {/*
       * 搜索框 + 联想下拉。
       *
       * flex 尺寸（flex-1 / min-w / max-w）挂在**外层 relative 容器**上：`<form>` 现在是
       * 它的 `w-full` 子元素，这样面板才能用 left-0 right-0 对齐输入框宽度。直接把 form
       * 变成 relative 也行，但那样面板就得嵌在 form 里面 —— 见下面 why 的说明。
       */}
      <div ref={searchBoxRef} className="relative min-w-[180px] max-w-md flex-1">
        <form onSubmit={handleSearch} className="flex w-full items-center gap-1.5 border-4 border-black bg-white px-3 py-2 shadow-[4px_4px_0px_0px_#000]">
          <Search className="size-4 shrink-0 text-black/60" />
          <input
            ref={searchInputRef}
            name="query"
            value={query}
            // 输入永远立刻进 value（框里要看得见），但**防抖取数**在合成期间是暂停的：
            // 拼音字母会一路触发 onChange，不挡就去搜 "q"/"qi"/"qia" 了
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestOpen(true);
            }}
            onKeyDown={handleInputKeyDown}
            // 合成结束把 composing 放掉，防抖 effect 因此重跑一次、用最终文本排上取数 ——
            // 少了这一步，用户打完字反而什么都搜不到
            onCompositionStart={() => {
              composingRef.current = true;
              setComposing(true);
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              setComposing(false);
            }}
            placeholder="搜索模组..."
            role="combobox"
            aria-expanded={showSuggest}
            aria-controls={showSuggest ? suggestListboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={highlightIndex >= 0 ? `${suggestListboxId}-${highlightIndex}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-xs font-black text-black outline-none placeholder:text-black/40"
          />
          {/*
           * 框内清空按钮。复用 handleClearFilter("query")，它已经处理好了两种情形：
           * 已生效的搜索 → 清文字 + 导航取消筛选；URL 里压根没有 query → 目标链接与当前
           * URL 相同，被 isCurrentNavigationUrl 短路，只清文字、不导航。
           * 不能只清文字而不取消筛选：搜索是 URL 上的筛选，否则会出现「框里空了但列表
           * 还是筛过的」这种自相矛盾的界面。
           */}
          {query ? (
            <button
              type="button"
              onClick={() => handleClearFilter("query")}
              aria-label="清空搜索"
              title="清空搜索"
              className="inline-flex size-5 shrink-0 items-center justify-center border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition hover:bg-[#ff7a7a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <X className="size-3" strokeWidth={4} />
            </button>
          ) : null}
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-1 border-[3px] border-black bg-[#ffd84f] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#000]"
          >
            搜索
          </button>
        </form>

        {/*
         * 面板放在 <form> **外面**。放里面的话每个候选都得记着写 type="button"，
         * 漏一个就变成「点候选 = 提交搜索」；放外面从根上没有这个可能。
         *
         * 不用 role="dialog"：会静默破坏别处「有浮窗就 Esc 让路」的守卫
         * （见 character-picker-drawer 与上面的 window 监听）。
         */}
        {showSuggest ? (
          <div
            id={suggestListboxId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[352px] overflow-y-auto border-4 border-black bg-[#fff8ef] p-1.5 shadow-[6px_6px_0px_0px_#000]"
          >
            {/* 与网格里那条提示条同口径：放宽来的结果必须说出来 */}
            {suggestQuery.data?.relaxed ? (
              <p aria-hidden className="px-2 pb-1.5 text-[10px] font-black text-black/55">
                无精确匹配，以下为部分匹配
              </p>
            ) : null}

            {/* 这两行都不是 option（aria-hidden），否则会污染读屏器的选项计数 */}
            {suggestQuery.isFetching && suggestions.length === 0 ? (
              <p aria-hidden className="px-2 py-2 text-[11px] font-black text-black/50">
                搜索中…
              </p>
            ) : null}
            {!suggestQuery.isFetching && suggestions.length === 0 ? (
              <p aria-hidden className="px-2 py-2 text-[11px] font-black text-black/50">
                没有匹配的 MOD
              </p>
            ) : null}

            {suggestions.map((mod, index) => (
              <button
                key={mod.id}
                id={`${suggestListboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightIndex}
                // 不 preventDefault 的话点击会夺走输入框焦点，之后 ↑↓/Esc 全都够不着面板
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => selectSuggestion(mod.id)}
                className={cn(
                  "flex w-full items-center gap-2 border-2 border-black px-2 py-1.5 text-left transition",
                  index === highlightIndex ? "bg-[#ffd84f]" : "bg-white hover:bg-[#fff3c4]"
                )}
              >
                {/* 原生 img + referrerPolicy：COS 上的封面会因为缺少这个属性被判失败，
                    mod-card.tsx 的三处图片都带着它。丢了它会出现「网格图正常、联想框全裂」 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mod.coverImage}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="size-9 shrink-0 border-2 border-black object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-black text-black">{mod.title}</span>
                  <span className="block truncate text-[10px] font-bold text-black/50">{mod.character}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

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
          {/* 瀑布流列数选择器。选项按屏幕宽度切换（手机 2/3、桌面 3/4/5/6，
              口径见 columnOptionsForWidth）；每个档位的**默认值**必须在自己的选项里，
              否则自适应切过去之后用户没法再选回来、面板上也不会高亮任何一项。 */}
          {layoutMode === "masonry" && onMasonryColumnsChange ? (
            <div className="mr-2 flex items-center gap-0.5 border-4 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
              {columnOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onMasonryColumnsChange(n)}
                  className={cn(
                    "px-1.5 py-1 text-xs font-black transition",
                    activeColumns === n
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
