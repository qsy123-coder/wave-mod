import type { Metadata } from "next";
import { Suspense } from "react";

import { GamebananaUrlDriven } from "@/components/features/gamebanana/gamebanana-url-driven";
import { GamebananaView } from "@/components/features/gamebanana/gamebanana-view";
import { DEFAULT_GAMEBANANA_FILTERS } from "@/lib/gamebanana-domain/filter-params";
import { getGamebananaMods } from "@/lib/gamebanana-domain/public";

export const metadata: Metadata = {
  title: "GameBanana 搬运 — 鸣潮 MOD 合集",
  description:
    "来自 GameBanana 的鸣潮（Wuthering Waves）MOD 搬运合集，按角色分类浏览，支持关键词搜索与热门/最新/下载量排序，下载直连原文作者页面。",
  // 筛选组合（?character= / ?sort= / ?query=）是近乎无限的近似重复页，
  // 与 /mods 同样声明规范地址，把带参 URL 的权重并回无参的这一页。
  alternates: { canonical: "/gamebanana" },
};

/**
 * 6 小时，与 `public.ts` 的 `CACHE_SECONDS` **对齐**：
 * TTL 短于数据缓存的 TTL，每次重建都只是拿着同一份数据重跑一遍 map，
 * 拿到的也不是新数据。
 */
export const revalidate = 21600;

/**
 * `/gamebanana` 的服务端部分：**只算「默认筛选」的那一份**，不读 searchParams、
 * 不读 cookie，因此整页可预渲染并缓存。
 *
 * ```
 * GamebananaPage（服务端，全库一次下发）
 * └── <Suspense fallback={默认视图}>   ← fallback 就是预渲染进 HTML 的内容
 *     └── GamebananaUrlDriven（客户端，唯一读 URL 的地方，也是筛选状态的所有者）
 * ```
 *
 * `useSearchParams()` 会把最近的 Suspense 边界以下整棵子树变成客户端渲染，所以
 * 预渲染出来的就是这份 fallback。**它必须与客户端渲染默认筛选时的结果完全一致**
 * ——这也是把渲染逻辑收在同一个 `GamebananaView` 里的原因（两边共用一段代码，
 * 不存在「HTML 一套、客户端一套」的可能）。
 *
 * ⚠️ `mods` 会**序列化两遍**：一遍进 fallback 元素，一遍作为 GamebananaUrlDriven 的
 * props。当前 288 条 × 精简列 ≈ 70KB，翻倍可接受；等跑 `--all`（3000+ 条）时这里
 * 会变成 ~1.5MB 的 RSC 负载，届时需要改成服务端分页 + 客户端取更多（见 PRD Phase 2）。
 */
export default async function GamebananaPage() {
  const mods = await getGamebananaMods();

  const defaultView = <GamebananaView mods={mods} filters={DEFAULT_GAMEBANANA_FILTERS} />;

  return (
    <Suspense fallback={defaultView}>
      <GamebananaUrlDriven mods={mods} />
    </Suspense>
  );
}
