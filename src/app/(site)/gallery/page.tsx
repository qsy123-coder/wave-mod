import type { Metadata } from "next";

import { GalleryClient } from "@/features/gallery/components/gallery-client";
import { loadGalleryImages } from "@/features/gallery/config";

export const metadata: Metadata = {
  title: "图库",
  description: "精选精美图片画廊 — 支持网格浏览、行视图和灯箱，方向键切换，ESC 关闭。",
};

/**
 * /gallery 图库页面。
 *
 * Server Component 入口：
 * 1. 服务端加载并校验 JSON 配置文件
 * 2. 将解析后的图片数据传递给客户端交互组件
 *
 * 与 Mod 业务完全解耦，独立展示图片集合。
 */
export default async function GalleryPage() {
  const images = await loadGalleryImages();

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      {/* 页面标题 */}
      <section className="border-4 border-black bg-[var(--neo-panel)] px-5 py-6 shadow-[10px_10px_0px_0px_#000]">
        <p className="neo-label text-black/65">图片画廊</p>
        <h1 className="mt-2 text-3xl font-black uppercase text-black sm:text-4xl">
          作品图库
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-black/70">
          精选图片作品集。点击图片放大查看，方向键切换，ESC 关闭。
          {images.length > 0 && (
            <span className="ml-2 inline-block border-2 border-black bg-[var(--neo-secondary)] px-2 py-0.5 text-xs font-black">
              {images.length} 张
            </span>
          )}
        </p>
      </section>

      {/* 客户端交互图库 */}
      <GalleryClient images={images} />
    </div>
  );
}
