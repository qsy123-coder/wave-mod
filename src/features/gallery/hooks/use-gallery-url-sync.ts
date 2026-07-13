"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { GalleryImageResolved, GalleryState, ViewMode } from "../types";

interface GalleryUrlSyncReturn extends GalleryState {
  /** 切换网格/行视图 */
  toggleViewMode: () => void;
  /** 点击图片进入灯箱 */
  openImage: (index: number) => void;
  /** 关闭灯箱 */
  closeImage: () => void;
  /** 灯箱内下一张 */
  goToNext: () => void;
  /** 灯箱内上一张 */
  goToPrev: () => void;
  /** 直接跳转到指定图片 */
  goToImage: (index: number) => void;
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
  const router = useRouter();
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

  // 将状态同步到 URL
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
        router.push(url);
      } else {
        router.replace(url);
      }
    },
    [router],
  );

  // 切换视图模式
  const toggleViewMode = useCallback(() => {
    setState((prev) => {
      const next: GalleryState = {
        viewMode: prev.viewMode === "grid" ? "line" : "grid",
        activeImageIndex: prev.activeImageIndex,
      };
      syncURL(next, "push");
      return next;
    });
  }, [syncURL]);

  // 打开图片（灯箱或行视图聚焦）
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

  // 关闭灯箱
  const closeImage = useCallback(() => {
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      router.back();
      // 同时更新本地状态（router.back 不会 re-render 到无 image 状态）
      setState((prev) => ({ ...prev, activeImageIndex: null }));
    } else {
      setState((prev) => {
        const next: GalleryState = { ...prev, activeImageIndex: null };
        syncURL(next, "replace");
        return next;
      });
    }
  }, [router, syncURL]);

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

  // 跳转到指定图片
  const goToImage = useCallback(
    (index: number) => {
      if (index < 0 || index >= images.length) return;
      setState((prev) => {
        const next: GalleryState = { ...prev, activeImageIndex: index };
        syncURL(next, "replace");
        return next;
      });
    },
    [images.length, syncURL],
  );

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
      toggleViewMode,
      openImage,
      closeImage,
      goToNext,
      goToPrev,
      goToImage,
    }),
    [
      state,
      toggleViewMode,
      openImage,
      closeImage,
      goToNext,
      goToPrev,
      goToImage,
    ],
  );
}
