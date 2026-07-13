"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface GalleryImageProps {
  src: string;
  alt: string;
  className?: string;
  /** 图片容器的宽高比，如 16/9、4/3 */
  aspectRatio?: number;
  /** 是否优先加载（首屏图片） */
  priority?: boolean;
  onLoad?: () => void;
}

/**
 * 渐进式图片加载组件。
 *
 * 从参考项目 chenglou.me 的「手写双缓冲」移植：
 * 先显示模糊占位 → 全分辨率图加载完成后平滑过渡。
 *
 * 使用 next/image 的 blur 占位模式 + CSS transition 实现两阶段加载。
 */
export function GalleryImage({
  src,
  alt,
  className,
  aspectRatio,
  priority = false,
  onLoad,
}: GalleryImageProps) {
  const [loaded, setLoaded] = useState(false);

  const handleLoad = () => {
    setLoaded(true);
    onLoad?.();
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--neo-muted)]",
        className,
      )}
      style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
    >
      {/* 加载前的骨架屏脉冲 */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-black/10" />
      )}

      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className={cn(
          "object-cover transition-all duration-700 ease-out",
          loaded
            ? "blur-0 opacity-100 scale-100"
            : "blur-lg opacity-0 scale-105",
        )}
        onLoad={handleLoad}
        priority={priority}
        draggable={false}
      />
    </div>
  );
}
