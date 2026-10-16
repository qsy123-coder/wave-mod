import type { Metadata } from "next";

import { ModViewTracker } from "@/components/features/mods/detail/mod-view-tracker";
import { ModsListing } from "@/components/features/mods/list/mods-listing";

type PageProps = {
  params: Promise<{ id: string }>;
};

/**
 * 与 `/mods` 取同一个 TTL（同样会被兜底快照缓存的 3600 压低，见 mods/page.tsx 的说明）。
 *
 * 这里不写 `generateStaticParams`：5292 条全部预渲染既没必要（爬虫已被
 * `noindex` 挡住）也不值得，交给按需渲染 + 缓存即可，所以 `dynamicParams` 保持 true。
 */
export const revalidate = 21600;
export const dynamicParams = true;

/**
 * 这个 URL 的 HTML 里**没有该资源的内容** —— 它渲染的是默认列表页 + 一个客户端才
 * 填充的详情抽屉，五千多个近乎重复的薄页面会拖累整站质量分。
 *
 * 2026-10-15 起全站统一 noindex：根 layout 已经做了这件事，但 Next 的 metadata 是
 * **逐字段浅合并** —— 这里若只写 `{ index: false }` 或留个 `follow: true`，
 * 就会把根上的 `follow: false` 覆盖回 true。所以两个字段都显式写全。
 *
 * canonical 指向自己：即便某个爬虫不认 noindex，至少不会把带参变体当成不同页面。
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: "外观资源详情 — 高清预览与直链下载",
    alternates: { canonical: `/mods/${id}` },
    robots: { index: false, follow: false },
  };
}

/**
 * `/mods/<id>` 复用的是列表页外壳：**HTML 里其实是默认的资源列表**，
 * 详情抽屉是客户端按 id 从 `/api/mods/[id]` 拉取后填进去的。
 *
 * 所以这里不能再 `await searchParams` —— 那会让本页变成动态渲染，而 URL 上的筛选
 * 条件现在由客户端从地址栏读（见 mods-url-driven.tsx）。
 */
export default async function ModDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <>
      <ModViewTracker modId={id} />
      <ModsListing openModId={id} />
    </>
  );
}
