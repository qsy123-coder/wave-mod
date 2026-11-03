import type { Metadata } from "next";

import { ModsListing } from "@/components/features/mods/list/mods-listing";

export const metadata: Metadata = {
  title: "外观资源列表 — 高清预览与直链下载",
  description:
    "按角色分类浏览外观资源，支持关键词搜索、热度/收藏排序与「含直链」「含预览图」筛选，卡片点击就地查看详情。",
  // 筛选/翻页组合（?character= / ?sort= / ?page=）是近乎无限的近似重复页，
  // robots.ts 里已用 `/mods?` 挡住抓取；这里再声明规范地址，把已收录的
  // 带参 URL 的权重并回无参的 /mods。
  alternates: { canonical: "/mods" },
};

/**
 * 12 小时（2026-11-03 从 6 小时上调）。
 *
 * 本页只渲染 `<ModsListing />` 这层外壳，页面自身不取数据：列表由客户端读 URL
 * 参数后请求 `/api/mods`（见 mods-url-driven.tsx）。所以 TTL 拉长不会让列表
 * 内容变旧，只减少这层 HTML 的重建次数 —— 而 ISR 写入是计入 Fluid Active CPU 的。
 *
 * 为什么不再和 `public.ts` 的 `CACHE_REVALIDATE_SECONDS`（6 小时）严格对齐：
 * 那条约束说的是「ISR TTL **短于**分片缓存 TTL 时，每次重建都拿同一份分片白跑
 * 一遍 filter+sort」。现在 TTL 比它**长**，重建只会更少；期间的数据变化由
 * `revalidatePublicModCaches()`（mod-cache.ts）的 `revalidatePath("/mods")` 主动清，
 * 不必等 TTL 到期。
 *
 * ⚠️ 实际生效值仍取渲染路径上所有缓存读的**最小值**。数据库读失败时
 * `getPublicMods` 会回退到兜底快照，而快照缓存的 TTL 刻意是 3600
 * （snapshot.ts 的 REMOTE_CACHE_SECONDS，它自己解释了为什么短）。
 * 构建后 `.next/prerender-manifest.json` 里看到 `1h` 是正常的，别按它「修」这里 ——
 * 正常路径不碰快照缓存，本值才会真正生效。
 *
 * 页面里没有 `searchParams`、没有 cookie，所以整页可预渲染：筛选条件由客户端从 URL
 * 读（见 mods-url-driven.tsx）。
 */
export const revalidate = 43200;

export default function ModsPage() {
  return <ModsListing />;
}
