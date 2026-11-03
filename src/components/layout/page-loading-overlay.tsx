"use client";

import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
import { pickPageSkeleton } from "@/components/layout/page-skeletons";

/**
 * 站点级页面导航骨架屏。
 *
 * 顶部导航任意链接点击 → `startPageLoading(href)` → 立即覆盖内容区显示骨架，
 * 目标路由确认后 `stopPageLoading()` → 骨架消失。
 *
 * **按目标页面选骨架**：`pendingPagePath` 交给 `pickPageSkeleton` 挑一套几何对得上的
 * （图库是暗色沉浸网格、问题解答是可拖拽双栏、每日更新带日期侧栏…）。此前所有页面
 * 都用同一套 mod 网格，跳过去时形状会明显跳变。背景色也跟着换 —— 覆盖层是
 * `fixed inset-0`，底色不对会在点击瞬间闪一下别的颜色。
 *
 * 覆盖在内容之上（`z-45`），但位于顶部导航（`z-50`）之下 —— 所以加载期间导航始终可点，
 * 用户随时可以改主意点别处。
 *
 * **从导航栏下方开始**（`top: var(--site-header-h)`，不是 `inset-0`）：遮罩在导航栏之下，
 * 若从视口顶端铺起，骨架顶上那一条会正好藏在导航栏背后（用户报告过）。
 * 导航栏自己用 ResizeObserver 把实测高度写进 `--site-header-h`（见 site-header-client.tsx），
 * 顶部那条「近期上新」横条开/关会改变它，所以这里也**不写死像素值**。
 *
 * 用 `top` 而不是给 `inset-0` 加 `padding-top`：后者是滚动容器内部的 padding，
 * 一滚动内容就会滑到导航栏背后去；`top` 则把遮罩自己的视口整体下移，滚不出界。
 */
export function PageLoadingOverlay() {
  const { isPageLoading, pendingPagePath } = useNavigationLoading();

  if (!isPageLoading) return null;

  const { background, content } = pickPageSkeleton(pendingPagePath);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-x-0 bottom-0 z-[45] overflow-y-auto ${background}`}
      style={{ top: "var(--site-header-h, 0px)" }}
    >
      {content}
    </div>
  );
}
