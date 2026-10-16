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
 */
export function PageLoadingOverlay() {
  const { isPageLoading, pendingPagePath } = useNavigationLoading();

  if (!isPageLoading) return null;

  const { background, content } = pickPageSkeleton(pendingPagePath);

  return (
    <div aria-hidden="true" className={`fixed inset-0 z-[45] overflow-y-auto ${background}`}>
      {content}
    </div>
  );
}
