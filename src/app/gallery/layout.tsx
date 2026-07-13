import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery",
  description: "精选图片作品集 — 沉浸式画廊浏览体验。",
};

/**
 * /gallery 独立布局。
 *
 * 参照 chenglou.me — 暗色背景设在 html 上以防白屏闪烁。
 * 渲染器 (GalleryRenderer) 管理所有交互逻辑。
 */
export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* 暗色背景加在 html 元素上，避免加载时白屏闪烁 */}
      <style>{`html { background-color: rgb(1, 5, 19); } body { margin: 0; overflow-x: hidden; }`}</style>
      {/* DM Sans 字体 — 复刻 chenglou.me */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,700;1,9..40,400&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
