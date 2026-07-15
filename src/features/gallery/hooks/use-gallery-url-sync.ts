"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { GalleryImageResolved, GalleryState, ViewMode } from "../types";

interface GalleryUrlSyncReturn extends GalleryState {
  openImage: (index: number) => void;
  dismissToGrid: () => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function useGalleryUrlSync(
  images: GalleryImageResolved[],
): GalleryUrlSyncReturn {
  const searchParams = useSearchParams();

  const wasOpenRef = useRef(false);
  // 追踪 URL 同步方法："push"（打开图片）或 "replace"（图片间切换）
  const urlMethod = useRef<"push" | "replace">("push");

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

  // URL 同步：在 effect 中执行，避免 setState 回调中更新其他组件
  useEffect(() => {
    const params = new URLSearchParams();
    if (state.viewMode !== "grid") {
      params.set("view", state.viewMode);
    }
    if (state.activeImageIndex != null) {
      params.set("image", String(state.activeImageIndex));
    }
    const qs = params.toString();
    const url = qs ? `/gallery?${qs}` : "/gallery";

    if (state.activeImageIndex != null) {
      if (urlMethod.current === "push") {
        window.history.pushState(null, "", url);
      } else {
        window.history.replaceState(null, "", url);
      }
    }
  }, [state.activeImageIndex, state.viewMode]);

  const dismissToGrid = useCallback(() => {
    wasOpenRef.current = false;
    setState({ viewMode: "grid", activeImageIndex: null });
    window.history.replaceState(null, "", "/gallery");
  }, []);

  const openImage = useCallback(
    (index: number) => {
      if (index < 0 || index >= images.length) return;
      wasOpenRef.current = true;
      urlMethod.current = "push";
      setState((prev) => ({ ...prev, activeImageIndex: index }));
    },
    [images.length],
  );

  const goToNext = useCallback(() => {
    urlMethod.current = "replace";
    setState((prev) => {
      if (prev.activeImageIndex == null) return prev;
      const nextIndex = (prev.activeImageIndex + 1) % images.length;
      return { ...prev, activeImageIndex: nextIndex };
    });
  }, [images.length]);

  const goToPrev = useCallback(() => {
    urlMethod.current = "replace";
    setState((prev) => {
      if (prev.activeImageIndex == null) return prev;
      const prevIndex =
        (prev.activeImageIndex - 1 + images.length) % images.length;
      return { ...prev, activeImageIndex: prevIndex };
    });
  }, [images.length]);

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
