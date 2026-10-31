"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";

import { CharacterSidebar, handleCardClick } from "@/components/features/mods/list/character-sidebar";
import { CharacterPickerDrawer } from "@/components/features/mods/list/character-picker-drawer";
import type { MasonryLayoutHint } from "@/components/features/mods/list/masonry-packing";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
import { useSitePreferences } from "@/components/layout/site-preferences-provider";
import { useIsDesktop } from "@/components/layout/use-is-desktop";
import { ModsPageClient } from "@/components/features/mods/list/mods-page-client";
import type { ModSort, ModsPage } from "@/lib/mods";
import { isDefaultModsFilters, modsListingKey, type ModsFilters } from "@/lib/mods-domain/filter-params";
import { buildModsFilterHref, isPlainLeftClick } from "@/lib/navigation-url";
import { MODS_SIDEBAR_LAYOUT_SHIFT } from "@/lib/preferences/site-preferences";
import { recallScrollPosition, rememberScrollPosition } from "@/lib/scroll-memory";
import { cn } from "@/lib/utils";

/** SSR 阶段没有 useLayoutEffect */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 列表页的**呈现层**。筛选条件从 props 进来（服务端给默认值、客户端从 URL 读），
 * 组件本身不关心它从哪来 —— 这样 `/mods` 的预渲染视图与 hydration 之后的视图
 * 用的是同一份代码，不可能出现「HTML 一套、客户端一套」的错位。
 */

const sortOptions: { label: string; value: ModSort }[] = [
  { label: "默认", value: "default" },
  { label: "最新", value: "latest" },
  { label: "热度", value: "hot" },
  { label: "收藏", value: "favorites" },
];

/** 固定排在最前的三个特殊分组；它们不参与角色列表的重复渲染 */
const SPECIAL_CATEGORIES = ["Skins", "UI", "Other/Misc"];

/** 侧栏滚动位置的记忆键，只此一处使用（见 lib/scroll-memory.ts） */
const SIDEBAR_SCROLL_KEY = "mods-sidebar";

type ModsListingViewProps = {
  /** 当前生效的筛选条件 */
  filters: ModsFilters;
  /** 库里有内容的角色名（服务端算好，两条渲染路径共用） */
  availableCharacters: string[];
  /** 归一化角色名 → 条数 */
  counts: Record<string, number>;
  /** 服务端预渲染好的第一页（默认筛选）。非默认筛选时会被忽略，见下方 seed */
  staticSeed: ModsPage | null;
  /** 角色 → 版式画像；骨架屏据此决定画横卡还是竖卡（见 buildLayoutHints） */
  layoutHints: Record<string, MasonryLayoutHint>;
  openModId?: string;
};

export function ModsListingView({
  filters,
  availableCharacters,
  counts,
  staticSeed,
  layoutHints,
  openModId,
}: ModsListingViewProps) {
  const { sort, character, query, direct, preview } = filters;

  /**
   * 沉浸布局：侧栏收起（仅桌面）。状态由顶栏/工具栏共用的 Provider 提供，
   * 这里负责把「收起/展开」翻译成**两段**动画。
   *
   * 历史取舍：
   *   - 宽度逐帧过渡：侧栏 65 个条目/卡片每帧重排，卡顿；
   *   - 宽度瞬间让位 + 面板位移：帧率 60fps，但卡片区一帧内跳变；
   *   - 宽度连续过渡 + 面板固定：真实浏览器仍有细微抖动；
   *   - 现在：侧栏宽度**瞬时切换**，卡片区的展开/收窄由网格的 FLIP 缩放负责
   *     （见 mods-infinite-grid），整段动画只有合成层的 scale/translate。
   * 侧栏面板自己仍用 `translate` + `opacity` 滑出/滑入，导航栏与外壳同步位移。
   */
  const { immersive } = useSitePreferences();
  const isDesktop = useIsDesktop();
  const sidebarCollapsed = immersive && isDesktop;

  const [gridShift, setGridShift] = useState<{ key: number; delta: number } | null>(null);
  const shiftKeyRef = useRef(0);
  const lastCollapsedRef = useRef(sidebarCollapsed);

  useIsomorphicLayoutEffect(() => {
    if (lastCollapsedRef.current === sidebarCollapsed) return;
    lastCollapsedRef.current = sidebarCollapsed;
    // 收起 +264、展开 -264；网格在同一帧按目标宽度预排，再用 transform 映射回旧布局
    shiftKeyRef.current += 1;
    setGridShift({
      key: shiftKeyRef.current,
      delta: sidebarCollapsed ? MODS_SIDEBAR_LAYOUT_SHIFT : -MODS_SIDEBAR_LAYOUT_SHIFT,
    });
  }, [sidebarCollapsed]);

  /**
   * 「全部角色分类」抽屉的状态放在这一层，而不是留在 CharacterSidebar 里：
   * 沉浸时侧栏整个滑出视口，工具栏还要一个同样的入口，两处必须打开同一个抽屉。
   */
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerTriggerRef = useRef<HTMLElement | null>(null);
  const { pendingCharacter, setPendingCharacter } = useNavigationLoading();

  /**
   * 侧栏的滚动位置要跨分类导航保住 —— 换筛选条件时 Suspense 边界会把整棵列表换掉，
   * 这个 `overflow-y-auto` 容器是新建节点、scrollTop 天然归零（用户看到的就是
   * 「点一下分类，侧栏跳回最上面」）。记忆只活在当前标签页里，刷新后从头开始。
   *
   * 用 useCallback 拿到稳定引用：引用变了 React 会在每次渲染重新挂一遍 ref，
   * 于是每渲染都会把 scrollTop 拽回记忆里的值，跟用户正在拖的滚动打架。
   */
  const attachSidebarScroll = useCallback((el: HTMLDivElement | null) => {
    if (el) el.scrollTop = recallScrollPosition(SIDEBAR_SCROLL_KEY);
  }, []);

  /**
   * 拼筛选链接：**永远从当前筛选出发**，只改传入的那一维。
   *
   * 每一项都必须把当前两个开关带上 —— 少了它，正开着「含预览图」的用户点一下角色
   * 分类，筛选就被悄悄丢掉了（参数不在 URL 上 = 没开）。
   *
   * 参数拼法统一走 buildModsFilterHref（navigation-url.ts），与工具栏共用一套约定。
   * 以前这里另有一份 buildModsHref、参数顺序还不同，同一个页面会出现两个字符串
   * 不一样的链接。
   */
  const hrefFor = (next: Partial<ModsFilters> = {}) =>
    buildModsFilterHref("/mods", { ...filters, ...next });

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const skinCount = Object.entries(counts)
    .filter(([k]) => k !== "UI" && k !== "Other/Misc")
    .reduce((sum, [, c]) => sum + c, 0);

  const sidebarCharacters = [
    { label: "Skins", count: skinCount },
    { label: "Other/Misc", count: counts["Other/Misc"] ?? 0 },
    { label: "UI", count: counts["UI"] ?? 0 },
  ]
    .map(({ label, count }) => ({
      label,
      count,
      href: hrefFor({ character: label }),
      isActive: label === character,
    }))
    .concat(
      availableCharacters
        .filter((name) => !SPECIAL_CATEGORIES.includes(name))
        .map((name) => ({
          label: name,
          count: counts[name] ?? 0,
          href: hrefFor({ character: name }),
          isActive: name === character,
        })),
    );

  const allHref = hrefFor({ character: undefined });

  /**
   * 抽屉开合与「点选后关闭」统一在这一层处理：侧栏按钮和工具栏按钮共用。
   * 传入触发元素是为了关闭时把焦点还到用户刚点的那个按钮上。
   */
  const openCharacterPicker = useCallback((trigger: HTMLElement) => {
    pickerTriggerRef.current = trigger;
    setPickerOpen(true);
  }, []);

  const handlePickerOpenChange = useCallback((next: boolean) => {
    setPickerOpen(next);
    if (!next) pickerTriggerRef.current?.focus();
  }, []);

  const handlePickerItemClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string, isActive: boolean) => {
      // 修饰键 / 中键 = 新标签页打开：用户还留在本页，抽屉不该消失
      if (!isPlainLeftClick(event)) return;

      const label =
        href === allHref ? "全部" : sidebarCharacters.find((c) => c.href === href)?.label ?? "";
      handleCardClick(event, href, isActive, label, setPendingCharacter);
      setPickerOpen(false);
      pickerTriggerRef.current?.focus();
    },
    [allHref, sidebarCharacters, setPendingCharacter],
  );

  const sortHrefs: Record<string, string> = {};
  for (const opt of sortOptions) {
    sortHrefs[opt.value] = hrefFor({ sort: opt.value });
  }

  /**
   * **只有默认筛选才能用预渲染的种子。** 种子是构建期按默认筛选算出来的，
   * 把它喂给 `/mods?character=千咲` 这样的 URL，页面会先显示全库最新的 16 条 ——
   * 那是明确违反当前筛选的内容。宁可让网格自己再拉一次第一页（有骨架屏兜着）。
   *
   * 这个闸门放在这里而不是调用方：它是「种子能用」的唯一判据，谁传进来都过这一关。
   */
  const seed = isDefaultModsFilters(filters) ? staticSeed : null;

  /**
   * 骨架屏用哪个角色的版式画像 —— **必须以乐观角色为准**。
   *
   * 点侧栏切角色时，骨架是立刻亮的（`pendingCharacter` 驱动），但地址栏要等客户端
   * 导航把 RSC 拿回来才变（弱网实测这一窗口有 2 秒以上）。这期间 `filters.character`
   * 还是**旧角色**，拿它去查画像就会画出旧角色的版式：从绯雪切到爱弥斯时，爱弥斯
   * 底下先闪一整版横屏骨架（2026-10-27 用户报的就是这个）。
   *
   * `pendingCharacter` 是侧栏标签（「全部」「Skins」也是），查不到就是 null，
   * 自动回落到竖屏骨架，不会误用别的角色的结论。
   */
  const layoutHintKey = pendingCharacter ?? character;
  const layoutHint = layoutHintKey ? (layoutHints[layoutHintKey] ?? null) : null;

  return (
    <>
      {/*
        侧栏收起（仅桌面）：
        - **布局瞬间让位**：`w-0` + `-mr-6` 抵消父容器 `gap-6`。不给宽度加过渡 ——
          宽度逐帧变化会重新布局侧栏里的 65 个条目，实测掉到 ~45fps；
        - 面板本体用 `translate` + `opacity` 滑出/滑入，只走合成层，不触发侧栏内容重排；
        - 内层固定 `w-[240px]`：外层宽度收成 0 后，面板仍完整存在、可以滑出视口；
        - `relative z-20`：滑出过程中面板要盖在卡片上（父容器 `overflow-hidden` 负责裁掉视口外的部分）；
        - 收起后加 `inert`，Tab 不会跑进看不见的分类链接（宽度为 0 也仍可能被聚焦）。
      */}
      <div
        data-mods-sidebar
        aria-hidden={sidebarCollapsed || undefined}
        inert={sidebarCollapsed || undefined}
        className={cn(
          "relative z-20 hidden min-w-0 shrink-0 flex-col lg:flex",
          // 宽度瞬时切换；卡片区的缩放由网格 FLIP 负责。
          sidebarCollapsed ? "lg:w-0 lg:-mr-6" : "lg:w-[240px]",
          sidebarCollapsed && "pointer-events-none",
        )}
      >
        <div
          ref={attachSidebarScroll}
          onScroll={(event) => rememberScrollPosition(SIDEBAR_SCROLL_KEY, event.currentTarget.scrollTop)}
          className={cn(
            "flex w-[240px] flex-1 flex-col overflow-y-auto pb-3 pr-1",
            "will-change-[translate,opacity]",
            // 收起：面板滑出并淡出（300ms）。
            // 展开：**直接出现在原位**，不做位移/淡入 —— 任何从屏幕外滑入或半透明
            // 都会让左栏先露出 240px 空带（用户反馈「缩小时不顺」）。内容区、
            // 导航栏、外壳同时开始动画，侧栏在 t=0 就占好位、盖住旧内容。
            sidebarCollapsed
              ? "-translate-x-full opacity-0 transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none"
              : "translate-x-0 opacity-100",
          )}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <CharacterSidebar
            allLabel="全部"
            allHref={allHref}
            allCount={totalCount}
            isAllActive={!character}
            characters={sidebarCharacters}
            pickerOpen={pickerOpen}
            onOpenPicker={openCharacterPicker}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ModsPageClient
          gameModsPath="/mods"
          listingKey={modsListingKey(filters)}
          initialQuery={query ?? ""}
          sort={sort}
          sortOptions={sortOptions}
          sortHrefs={sortHrefs}
          initialMods={seed?.items}
          initialTotalCount={seed?.totalCount}
          character={character}
          activeCharacter={character}
          activeDirect={direct}
          activePreview={preview}
          layoutHint={layoutHint}
          layoutShift={gridShift}
          showSitePreferences
          showCharacterPickerTrigger={sidebarCollapsed}
          onOpenCharacterPicker={openCharacterPicker}
          openModId={openModId}
        />
        {/*
          「全部角色分类」抽屉挂在这里（右栏内部、紧贴网格）：
          - 沉浸收起侧栏后，工具栏的「全部角色」按钮与原来的侧栏按钮打开同一个抽屉；
          - Sheet 的遮罩与面板都是 fixed，放进这个 overflow-hidden 的右栏不会影响布局；
          - 不放在最外层 flex 行里：Sheet 自带一个 data-slot="sheet" 的普通 div，
            作为 flex 子项会多出一个 gap-6 的间距，挤压卡片区。
        */}
        <CharacterPickerDrawer
          open={pickerOpen}
          onOpenChange={handlePickerOpenChange}
          allLabel="全部"
          allHref={allHref}
          isAllActive={!character}
          items={sidebarCharacters}
          onItemClick={handlePickerItemClick}
        />
      </div>
    </>
  );
}
