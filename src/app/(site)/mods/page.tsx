import type { Metadata } from "next";

import { ModsListing } from "@/components/features/mods/list/mods-listing";

export const metadata: Metadata = {
  title: "MOD 列表 — 高清预览与直链下载",
  description:
    "按角色分类浏览鸣潮 Mod，支持关键词搜索、热度/收藏/评分排序与「含直链」「含预览图」筛选，卡片点击就地查看详情。",
  // 筛选/翻页组合（?character= / ?sort= / ?page=）是近乎无限的近似重复页，
  // robots.ts 里已用 `/mods?` 挡住抓取；这里再声明规范地址，把已收录的
  // 带参 URL 的权重并回无参的 /mods。
  alternates: { canonical: "/mods" },
};

/**
 * 6 小时，与 `public.ts` 的 `CACHE_REVALIDATE_SECONDS` **对齐**。
 *
 * ISR 的 TTL 若短于分片缓存的 TTL，每次重建都只是拿着同一份分片重跑一遍内存
 * filter+sort（5292 条）—— 纯烧 CPU，而且拿到的并不是新数据。
 *
 * ⚠️ 这里写的是**上限**，实际生效值取渲染路径上所有缓存读的**最小值**。
 * 构建后 `.next/prerender-manifest.json` 里 `/mods` 是 3600，不是 21600：
 * 网关被 402 锁着时 `getPublicMods` 会回退到兜底快照，而快照缓存的 TTL
 * 刻意是 3600（snapshot.ts 的 REMOTE_CACHE_SECONDS，它自己解释了为什么短）。
 * 所以这不是配置写错，别按构建输出的 `1h` 去「修」这里或那个常量 ——
 * 网关恢复后渲染路径不再碰快照缓存，本值才会真正生效。
 *
 * 页面里没有 `searchParams`、没有 cookie，所以整页可预渲染：筛选条件由客户端从 URL
 * 读（见 mods-url-driven.tsx）。新增 / 修改内容时 `revalidatePublicModCaches()`
 * （mod-cache.ts）会 revalidatePath("/mods")，所以不必等 TTL 到期。
 */
export const revalidate = 21600;

export default function ModsPage() {
  return <ModsListing />;
}
