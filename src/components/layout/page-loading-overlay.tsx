"use client";

import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
import { ModGridSkeleton } from "@/components/layout/data-skeletons";

/**
 * 站点级页面导航骨架屏。
 *
 * 顶部导航任意链接点击 → startPageLoading → 立即覆盖内容区显示骨架，
 * 目标路由确认后 stopPageLoading → 骨架消失。
 * 覆盖在内容之上（z-45），但位于顶部导航（z-50）之下，跨游戏时由
 * NavigationLoader（z-50）覆盖，互不遮挡。
 */
export function PageLoadingOverlay() {
  const { isPageLoading } = useNavigationLoading();

  if (!isPageLoading) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[45] overflow-y-auto bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px]"
    >
      <div className="mx-auto w-full max-w-[1680px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-36 animate-pulse border-4 border-black bg-white/75 shadow-[4px_4px_0px_0px_#000]" />
          <div className="h-10 flex-1 animate-pulse border-4 border-black bg-white/45 shadow-[4px_4px_0px_0px_#000]" />
        </div>
        <ModGridSkeleton count={10} />
      </div>
    </div>
  );
}
