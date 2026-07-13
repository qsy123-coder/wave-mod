"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { GalleryImageResolved, GalleryState, ViewMode } from "../types";

interface GalleryUrlSyncReturn extends GalleryState {
  /** 点击图片进入聚焦 */
  openImage: (index: number) => void;
  /** 行视图 → 返回网格（清空聚焦） */
  dismissToGrid: () => void;
  /** 行视图内下一张 */
  goToNext: () => void;
  /** 行视图内上一张 */
  goToPrev: () => void;
}

/**
 * 图库状态机 + URL 双向同步 Hook。
 *
 * 状态维度：
 * - viewMode: grid | line
 * - activeImageIndex: number | null
 *
 * URL 映射：
 * - ?view=line&image=2  → 行视图 + 第 3 张图
 * - ?image=2           → 网格视图 + 灯箱展示第 3 张图
 * - (无参数)            → 默认网格视图
 *
 * 导航策略：
 * - 结构性变化（打开灯箱、切换视图）→ router.push（加入历史栈）
 * - 图片间切换 → router.replace（不污染历史栈）
 * - 关闭灯箱 → router.back()（恢复之前的历史状态）
 */
export function useGalleryUrlSync(
  images: GalleryImageResolved[],
): GalleryUrlSyncReturn {
  const searchParams = useSearchParams();

  // 记录当前是否在弹窗中 — 用于 closeImage 决定 push vs back
  const wasOpenRef = useRef(false);

  // 从 URL 初始化状态（仅挂载时一次）
  const [state, setState] = useState<GalleryState>(() => {
    const viewParam = searchParams.get("view");
    const imageParam = searchParams.get("image");

    const viewMode: ViewMode =
      viewParam === "line" ? "line" : "grid";
    const imageIndex = imageParam != null ? Number(imageParam) : null;
    const clampedIndex =
      imageIndex != null &&
      Number.isFinite(imageIndex) &&
      imageIndex >= 0 &&
      imageIndex < images.length
        ? imageIndex
        : null;

    if (clampedIndex != null) wasOpenRef.current = true;

    return { viewMode, activeImageIndex: clampedIndex };
  });

  // 将状态同步到 URL（用 history API 避免 Next.js 导航导致 Suspense 重挂载）
  const syncURL = useCallback(
    (nextState: GalleryState, method: "push" | "replace") => {
      const params = new URLSearchParams();
      if (nextState.viewMode !== "grid") {
        params.set("view", nextState.viewMode);
      }
      if (nextState.activeImageIndex != null) {
        params.set("image", String(nextState.activeImageIndex));
      }
      const qs = params.toString();
      const url = qs ? `/gallery?${qs}` : "/gallery";

      if (method === "push") {
        window.history.pushState(null, "", url);
      } else {
        window.history.replaceState(null, "", url);
      }
    },
    [],
  );

  // 从行视图退回网格（清空聚焦）
  const dismissToGrid = useCallback(() => {
    wasOpenRef.current = false;
    setState({ viewMode: "grid", activeImageIndex: null });
    window.history.replaceState(null, "", "/gallery");
  }, []);

  // 打开图片（网格→行视图，或在行视图内切换）
  const openImage = useCallback(
    (index: number) => {
      if (index < 0 || index >= images.length) return;
      wasOpenRef.current = true;
      setState((prev) => {
        const next: GalleryState = { ...prev, activeImageIndex: index };
        syncURL(next, "push");
        return next;
      });
    },
    [images.length, syncURL],
  );

  // 下一张
  const goToNext = useCallback(() => {
    setState((prev) => {
      if (prev.activeImageIndex == null) return prev;
      const nextIndex = (prev.activeImageIndex + 1) % images.length;
      const next: GalleryState = { ...prev, activeImageIndex: nextIndex };
      syncURL(next, "replace");
      return next;
    });
  }, [images.length, syncURL]);

  // 上一张
  const goToPrev = useCallback(() => {
    setState((prev) => {
      if (prev.activeImageIndex == null) return prev;
      const prevIndex =
        (prev.activeImageIndex - 1 + images.length) % images.length;
      const next: GalleryState = { ...prev, activeImageIndex: prevIndex };
      syncURL(next, "replace");
      return next;
    });
  }, [images.length, syncURL]);

  // 监听浏览器前进/后退（popstate）
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get("view");
      const imageParam = params.get("image");

      const viewMode: ViewMode =
        viewParam === "line" ? "line" : "grid";
      const imageIndex = imageParam != null ? Number(imageParam) : null;
      const clampedIndex =
        imageIndex != null &&
        Number.isFinite(imageIndex) &&
        imageIndex >= 0 &&
        imageIndex < images.length
          ? imageIndex
          : null;

      wasOpenRef.current = clampedIndex != null;
      setState({ viewMode, activeImageIndex: clampedIndex });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [images.length]);

  return useMemo(
    () => ({
      ...state,
      openImage,
      dismissToGrid,
      goToNext,
      goToPrev,
    }),
    [state, openImage, dismissToGrid, goToNext, goToPrev],
  );
}
