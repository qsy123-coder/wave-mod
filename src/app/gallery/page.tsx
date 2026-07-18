import { Suspense } from "react";
import { GalleryClient } from "@/features/gallery/components/gallery-client";
import { loadGalleryImages } from "@/features/gallery/config";
import { GitHubLink } from "./github-link";
import type { GalleryImageResolved } from "@/features/gallery/types";

function GalleryError() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        color: "rgb(192, 198, 205)",
        fontFamily: "inherit",
        fontSize: 14,
      }}
    >
      <p>
        ⚠️ 图库配置加载失败，请检查{" "}
        <code style={{ color: "rgb(122, 126, 130)" }}>
          data/gallery-images.json
        </code>
      </p>
    </div>
  );
}

/**
 * 异步加载图片数据的组件
 */
async function GalleryData() {
  let images: GalleryImageResolved[];
  try {
    images = await loadGalleryImages();
  } catch {
    return <GalleryError />;
  }
  return <GalleryClient images={images} />;
}

/**
 * /gallery 独立图库页面。
 *
 * 完全脱离站点 (site) layout，使用独立的暗色沉浸式布局。
 * 复刻 chenglou.me 的极简设计 — 只有图库内容和一个 GitHub 链接。
 */
export default function GalleryPage() {
  return (
    <>
      <GitHubLink />
      <Suspense
        fallback={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              color: "rgb(192, 198, 205)",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          >
            加载中…
          </div>
        }
      >
        <GalleryData />
      </Suspense>
    </>
  );
}