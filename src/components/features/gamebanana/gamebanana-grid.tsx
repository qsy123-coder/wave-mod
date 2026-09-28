"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { ModCard } from "@/components/common/mod-card";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { toSiteMod } from "@/lib/gamebanana-domain/mappers";
import type { GamebananaMod } from "@/lib/gamebanana-domain/types";

/**
 * 每次「加载更多」放出的条数。与 `/mods` 的 MODS_PAGE_SIZE(16) 不同是刻意的：
 * 那边一页是一次网络请求，这里是本地切片，多放几张不会多花一个请求。
 */
export const GAMEBANANA_PAGE_SIZE = 24;

type GamebananaGridProps = {
  /** 已经筛选 + 排序好的完整列表（筛选在客户端做，见 filter-params.ts） */
  mods: GamebananaMod[];
  /**
   * 「这是哪一份列表」的身份键（`gamebananaListingKey`）。
   * 它一变就把「已放出多少条」归零 —— 换了筛选却还记着上一份列表翻到第 5 页，
   * 用户点个分类会直接看到「已加载 120 条」的空白。
   */
  listingKey: string;
  /**
   * 点卡片就地打开详情抽屉（传的是 `gb_id` 的字符串形式，与 `ModCard` 的 mod.id 同构）。
   * **不传就是纯静态渲染**：卡片退化为真链接，点击走浏览器原生导航 ——
   * 与 `GamebananaView` 的 `onFilterChange` 同一条约定，预渲染那份 HTML 也能用。
   */
  onCardClick?: (gbId: string) => void;
};

/**
 * GameBanana 搬运列表的网格。
 *
 * 与 `ModsInfiniteGrid` 的两处结构性差别，都是「数据来源不同」推出来的：
 *
 * 1. **没有网络分页。** 全库一次下发（见 `getGamebananaMods`），筛选/排序/翻页全在
 *    本地算，所以这里没有 TanStack Query、没有 `/api/mods` 那种请求，也没有「骨架 /
 *    错误重试」那套。切筛选是同步的，不会出现加载态。
 * 2. **「加载更多」是按钮，不是无限滚动。** `/mods` 那个自动加载的哨兵是个**条件渲染**
 *    的网格子元素，前后踩过两次用户可见的坑：吃掉一个网格格子导致「一行 5 张里少
 *    一张」，以及 ref 建 observer 的时机不对导致滑到底也不加载。本地数据没有
 *    「等请求」这件事，用一个真按钮把这些失败模式整类去掉，用户也能自己控制节奏。
 */
export function GamebananaGrid({ mods, listingKey, onCardClick }: GamebananaGridProps) {
  const [visibleCount, setVisibleCount] = useState(GAMEBANANA_PAGE_SIZE);
  const [countedFor, setCountedFor] = useState(listingKey);

  /**
   * 换筛选 = 换了一份列表 ⇒ 从第一页重新开始，不沿用上一份的「已加载多少条」。
   *
   * 这是**渲染期**调整派生状态，不是 `useEffect`：effect 里同步 setState 会多跑一轮
   * 渲染（ESLint 直接报 error），而且会先提交一帧「用了旧计数」的画面。
   *
   * 也没有用 `key={listingKey}` 让组件整个重挂 —— 那样每次点筛选都会重建全部
   * `ModCard`，已经加载好的预览图要重新下载解码；筛选在本页是纯本地运算，
   * 不该付出那个代价。
   */
  if (countedFor !== listingKey) {
    setCountedFor(listingKey);
    setVisibleCount(GAMEBANANA_PAGE_SIZE);
  }

  const visible = mods.slice(0, visibleCount);
  const remaining = mods.length - visible.length;

  if (mods.length === 0) {
    return (
      <MotionReveal delay={0.16} y={24} rotate={1}>
        <section className="neo-card-lg bg-[#fff8ef] p-8 text-black">
          <div className="border-4 border-black bg-white px-5 py-6 shadow-[8px_8px_0px_0px_#000]">
            <p className="neo-label text-black/60">没有匹配内容</p>
            <h2 className="mt-2 text-3xl font-black">当前筛选条件下没有搬运内容。</h2>
            <p className="mt-4 text-sm font-bold leading-7 text-black/75">
              可以切换角色、清空搜索词或换个排序方式继续浏览。
            </p>
          </div>
        </section>
      </MotionReveal>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
        {visible.map((mod, index) => (
          <MotionReveal
            key={mod.gbId}
            delay={0.03 + (index % 8) * 0.02}
            y={14}
            rotate={index % 2 === 0 ? -1 : 1}
          >
            <ModCard
              // 列表不下发相册（见 public.ts 的 LIST_COLUMNS），封面就是 cover_url
              mod={toSiteMod(mod)}
              // 真链接：水合前（或没接状态时）点击就整页跳过去，自带加载指示，
              // 不会有「点了没反应」的死窗口（memory: prerender-click-dead-window）。
              // 水合后由 onCardClick 接管成抽屉，href 则被 pushState 换成同一个地址。
              href={`/gamebanana/${mod.gbId}`}
              onCardClick={onCardClick}
              variant="list"
              className="bg-[#fff8ef] p-2.5"
              imageAspectClassName="aspect-[5/6] sm:aspect-[4/5]"
              imagePriority={index < 4}
              imageFetchPriority={index < 4 ? "high" : "auto"}
              imageSizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
              // 这三个开关都必须关：本表的 id 是 GameBanana 的数字 id、行也不在 mods 里，
              // 那些控件写的是 mods/favorites 表。详见 mappers.toSiteMod 的注释。
              showInteractionBar={false}
              showRatingSticker={false}
              showFavoriteButton={false}
              mediaTopRight={
                <span className="inline-flex items-center border-2 border-black bg-[#bcaeff] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]">
                  GameBanana
                </span>
              }
              mediaTopRightClassName="absolute right-2 top-2"
            />
          </MotionReveal>
        ))}
      </section>

      {remaining > 0 ? (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + GAMEBANANA_PAGE_SIZE)}
            className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em]"
          >
            加载更多（还有 {remaining} 个）
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center py-4">
          <div className="inline-flex items-center gap-3 border-4 border-black bg-[#ffd84f] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000]">
            <Search className="size-4" />
            已经翻到底了，试试切换角色或搜索关键词
          </div>
        </div>
      )}
    </div>
  );
}
