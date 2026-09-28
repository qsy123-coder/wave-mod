"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GamebananaView } from "@/components/features/gamebanana/gamebanana-view";
import {
  buildGamebananaHref,
  parseGamebananaFilters,
  type GamebananaFilters,
} from "@/lib/gamebanana-domain/filter-params";
import type { GamebananaMod } from "@/lib/gamebanana-domain/types";

type GamebananaUrlDrivenProps = {
  mods: GamebananaMod[];
};

/**
 * 唯一的**状态所有者**：筛选条件的真身在 `useState` 里，URL 只是它的一个同步投影。
 *
 * 为什么不像 `/mods` 那样「URL 就是唯一真身、每次筛选都走路由」：
 *
 * 1. **不需要。** `/mods` 的筛选是服务端查询（`/api/mods?...`），URL 变了才有新数据；
 *    这里全库已经一次性下发到客户端，筛选纯粹是本地数组运算，没有理由为此惊动路由。
 * 2. **路由会吞掉这类导航。** `/mods` 上有一整类「同路由、只换 search」的导航被
 *    App Router 丢掉（筛选页上再点分类整下没反应，详见
 *    memory: mods-listing-remount-filtered-nav-dead）。既然不经过路由，那类问题
 *    在这一页根本不存在。
 *
 * `useSearchParams()` 是本组件唯一读 URL 的地方，而它会**强制整棵子树变成客户端渲染**，
 * 所以预渲染 HTML 里留下的是最近的 Suspense 边界那层 fallback（见 page.tsx）。
 * 相应地，这个组件里不要放任何 DOM 结构以外的逻辑。
 *
 * 初始化只在挂载时发生一次：URL 里带筛选的直接打开、或从别处整页跳进来，都走
 * 「全新挂载」；此后状态自己说了算。**因此本页的筛选链接不能是 Next 的客户端导航**
 * —— 那只会重渲染、不会重新挂载，URL 变了而状态不会跟上。所有筛选控件都走
 * `GamebananaView` 里那条「真链接受浏览器 / 水合后改状态 + pushState」的路子。
 */
export function GamebananaUrlDriven({ mods }: GamebananaUrlDrivenProps) {
  const searchParams = useSearchParams();

  // 惰性初始化：只有首次渲染会读 URL，之后的改动都从 setFilters 走。
  const [filters, setFilters] = useState<GamebananaFilters>(() =>
    parseGamebananaFilters(searchParams ?? new URLSearchParams()),
  );

  /**
   * 详情抽屉当前打开的那条（`gb_id` 字符串）。null = 没开。
   *
   * 与 `filters` 一样只在这里持有，URL 是它的投影：点卡片 pushState 成
   * `/gamebanana/<gb_id>`，关掉再 pushState 回 `/gamebanana<search>`。
   *
   * **初始化不读 URL**：本页（列表页）的地址永远没有 `/<gb_id>` 这一段，
   * 带 `gb_id` 的地址是**另一个路由**（`app/(site)/gamebanana/[gb_id]/page.tsx`，
   * 服务端整页）。只有「在这一页里点了卡片」才会进这个状态，而那时已经挂载完了。
   * 所以这里不需要 `useState(() => ...)` 那种惰性初始化。
   */
  const [openGbId, setOpenGbId] = useState<string | null>(null);

  /**
   * `filters` 进依赖而不是用 setFilters 的函数式更新：pushState 是副作用，
   * **不能放在 state updater 里** —— updater 必须是纯函数，React 在 StrictMode 下
   * 会故意调用两次，那样每次筛选都会多推一条历史记录（用户得按两下「返回」）。
   * 用当前这次渲染的 filters 算下一份状态就够了：点击之间必然隔着一次重渲染。
   */
  const applyFilter = useCallback(
    (patch: Partial<GamebananaFilters>) => {
      const next: GamebananaFilters = { ...filters, ...patch };
      setFilters(next);
      // URL 跟着状态走，而不是反过来 —— 这样分享出去的链接与屏幕上看到的筛选
      // 按构造就是一致的。用 replaceState 会让「返回」跳过每一次筛选（用户得点很多下
      // 才回到上一页），pushState 则让每次筛选都是一步可回退的历史，与 /mods 一致。
      window.history.pushState(null, "", buildGamebananaHref(next, {}));
    },
    [filters],
  );

  /**
   * 点卡片：开抽屉，并把地址推成 `/gamebanana/<gb_id>`（保留当前筛选的 search）。
   *
   * 推 URL 但**不导航**：这里不改 `filters`，也不经过路由。语义是「就地打开」，
   * URL 跟着走是为了刷新/分享/返回都对得上 —— 与 `/mods` 的 openDrawer 同一套。
   *
   * 卡片本身仍是真 `<a href>`（见 GamebananaGrid），水合前点击走的是浏览器原生
   * 导航到 `/gamebanana/<id>` 整页；水合后 ModCard 才 preventDefault 转到这里。
   */
  const openDetail = useCallback((gbId: string) => {
    setOpenGbId(gbId);
    window.history.pushState(null, "", `/gamebanana/${gbId}${window.location.search}`);
  }, []);

  /**
   * 关抽屉：地址回到列表页，search 原样保留（筛选不该因为看了个详情就被清掉）。
   *
   * 只有当前确实是详情地址才推 —— 抽屉的 `onClose` 是退场动画走完（+200ms）才
   * 回调过来的，那一刻 URL 已经被别处改过的话，再推一条就是同一份地址的第二条
   * 历史记录（用户得按两下「返回」）。这里读 `window.location` 现场判断，
   * **不用闭包里的 state**：那个闭包可能是 200ms 前那次渲染的。
   */
  const closeDetail = useCallback(() => {
    setOpenGbId(null);
    if (window.location.pathname !== "/gamebanana") {
      window.history.pushState(null, "", `/gamebanana${window.location.search}`);
    }
  }, []);

  /**
   * 抽屉里点角色标签：换筛选 + 关抽屉，**一次推完**。
   *
   * 拆成「applyFilter 再 closeDetail」会推两条历史（第一条带 character、第二条
   * 是 closeDetail 按老 search 拼的），用户按一下「返回」回到的还是筛选后的列表。
   *
   * 这里直接把 `openGbId` 置空：抽屉会立刻从树上消失、不播退场动画。
   * 刻意的 —— 背后的列表整份都换了，慢慢滑出反而像在演一个已经不存在的上下文；
   * 而且这样就没有「抽屉的定时器 200ms 后再回调一次 onClose」这条尾巴。
   */
  const handleDrawerCharacter = useCallback(
    (character: string) => {
      const next: GamebananaFilters = { ...filters, character };
      setFilters(next);
      setOpenGbId(null);
      window.history.pushState(null, "", buildGamebananaHref(next, {}));
    },
    [filters],
  );

  /**
   * 前进/后退：把状态重新对齐到 URL。
   *
   * 少了这一段，用户按「返回」地址栏变了、列表却纹丝不动 —— 状态是真身，没人告诉它
   * URL 被浏览器改了。抽屉同理：返回一下应该关掉抽屉而不是留一个对不上地址的浮层。
   *
   * 一个监听器同时管两件事，而不是各挂一个：两者都由同一次「地址变了」触发，
   * 分开写就有两个顺序不确定的处理器，中间那一帧的 UI 状态由注册顺序决定。
   */
  useEffect(() => {
    const handlePopState = () => {
      setFilters(parseGamebananaFilters(new URLSearchParams(window.location.search)));
      // 只认详情地址那一种形状。正则与 parseGamebananaGbId 的收窄规则**故意一致**
      // （1~12 位纯数字），否则「地址栏里有个 id、抽屉却不认」这种分叉会出现在
      // 用户按前进键的时候 —— 那是最难查的一类。
      const matched = window.location.pathname.match(/^\/gamebanana\/(\d{1,12})$/);
      setOpenGbId(matched ? matched[1] : null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  /**
   * 打开的那条从**全量**列表里找，不是从筛选后的结果里。
   * 打开期间用户可能改了筛选（把这条过滤掉了），抽屉不该因此凭空消失。
   */
  const openMod = openGbId === null ? null : (mods.find((m) => String(m.gbId) === openGbId) ?? null);

  return (
    <GamebananaView
      mods={mods}
      filters={filters}
      onFilterChange={applyFilter}
      detail={{
        openMod,
        onOpen: openDetail,
        onClose: closeDetail,
        onCharacterClick: handleDrawerCharacter,
      }}
    />
  );
}
