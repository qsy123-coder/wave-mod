"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type GamebananaGalleryProps = {
  images: string[];
  /** 只用于 alt 文案（`<标题> 预览图 3`），不渲染出来 */
  title: string;
};

/**
 * 详情页/抽屉的预览图：**横排缩略图条 + 点开灯箱**，与 `/mods` 的详情抽屉同一套
 * （`mod-detail-drawer.tsx` 的「预览 (N)」那一段与它下面的 lightbox）。
 *
 * 之前这里是「一张接一张竖着铺满整列」：图多的时候（GameBanana 的相册常见 20+ 张）
 * 正文要往下滚很久才能看到署名与出处，同一屏里也看不到「一共有几张」。
 * 横排条把这些收成一行可横向滚动的缩略图，放大交给灯箱。
 *
 * 做成一个组件、服务端整页与抽屉共用，而不是各写一份：两边渲染的必须是同一批图、
 * 同一句文案、同一套交互 —— 这是 `formatBytes` 抽出去的同一条理由。
 */
export function GamebananaGallery({ images, title }: GamebananaGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 退场动画跑完才真正卸载（与 /mods 的灯箱同一条，200ms 是那个 transition 的时长）。
  // 定时器要在卸载时清掉：抽屉可以在灯箱开着的时候被关掉，那时这个回调已经没有意义，
  // 留着它只会在已卸载的组件上 setState。
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    // 双 rAF：先让节点带着 opacity-0 上树渲染一帧，再翻成 opacity-100，
    // 否则浏览器会把「挂载」和「透明度变化」合并成一次样式计算，动画直接不出现。
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setLightboxVisible(true));
    });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxVisible(false);
    closeTimer.current = setTimeout(() => setLightboxIndex(null), 200);
  }, []);

  // 环形前后翻：最后一张的「下一张」回到第一张（与 /mods 一致）
  const step = useCallback(
    (delta: number) => {
      setLightboxIndex((prev) => (prev === null ? prev : (prev + delta + images.length) % images.length));
    },
    [images.length],
  );

  const lightboxPrev = useCallback(() => step(-1), [step]);
  const lightboxNext = useCallback(() => step(1), [step]);

  /**
   * 键盘：Esc 关、左右翻。
   *
   * 宿主的抽屉**不处理 Esc**（`Sheet` 本身没有键盘处理，`/mods` 抽屉也没有），
   * 所以这里不会出现「一下 Esc 关掉两层」。灯箱自己也处理 Esc，是它作为模态该有的样子。
   */
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lightboxPrev();
      if (e.key === "ArrowRight") lightboxNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, closeLightbox, lightboxPrev, lightboxNext]);

  // 空相册由调用方决定显示什么（整页有「没有提供预览图」的占位、抽屉干脆不显示这一块）
  if (images.length === 0) return null;

  return (
    <>
      <p className="neo-label text-black/60">预览图 ({images.length})</p>

      {/*
        横向滚动条。`-mx-1 px-1` 是为了让第一张的硬阴影在容器内不被裁掉，
        与 /mods 的预览条同一条；`min-h` 是给还没解码完的图留位，避免条子高度
        在图片到达时跳一下（下面的 img 不写 width/height，浏览器无从预知比例）。
      */}
      <div
        className="-mx-1 mt-2 flex min-h-32 gap-3 overflow-x-auto px-1 pb-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {images.map((src, index) => (
          <button
            key={`${src}-${index}`}
            type="button"
            onClick={() => openLightbox(index)}
            className="shrink-0 cursor-zoom-in self-start border-[3px] border-black bg-white shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${title} 预览图 ${index + 1}`}
              loading="lazy"
              decoding="async"
              // GameBanana 的图走它自己的 CDN，带 referrer 会被拦（与卡片、整页一致）
              referrerPolicy="no-referrer"
              className="h-auto max-h-64 w-auto max-w-[240px] object-contain"
            />
          </button>
        ))}
      </div>

      {/*
        灯箱用 **portal 挂到 body**，不能就地渲染。

        抽屉（`SheetContent`）带 `translate-x-0`，而 `translate`/`transform` 只要不是
        `none`，元素就成了 `position: fixed` 后代的**包含块** —— 灯箱的 `inset-0` 于是
        相对抽屉那一栏（实测 left 794 / width 624）而不是视口，全屏遮罩变成一个贴在
        抽屉里的方块，背景也盖不住。`/mods` 的灯箱没踩到，是因为它写在 `SheetContent`
        **外面**（`<Sheet>` 的直接子节点）；这里组件是两处共用的，拿不到那个位置。

        `document` 只在 `lightboxIndex !== null` 时才会被读到，而这个状态只能由点击
        （即只在浏览器里）产生 —— 服务端首屏必然是 null，所以没有 SSR 风险。
      */}
      {lightboxIndex !== null
        ? createPortal(
            <div
              data-slot="gamebanana-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`${title} 预览图 ${lightboxIndex + 1}`}
              className={cn(
                "fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200",
                lightboxVisible ? "opacity-100" : "opacity-0",
              )}
              onClick={closeLightbox}
            >
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute right-5 top-5 z-[135] inline-flex size-12 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-0.5"
                aria-label="关闭预览"
              >
                <X className="size-5" />
              </button>

              <div className="absolute left-5 top-5 z-[135] border-4 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
                {lightboxIndex + 1} / {images.length}
              </div>

              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      lightboxPrev();
                    }}
                    className="absolute left-5 top-1/2 z-[135] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-[calc(50%+2px)]"
                    aria-label="上一张"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      lightboxNext();
                    }}
                    className="absolute right-5 top-1/2 z-[135] inline-flex size-14 -translate-y-1/2 items-center justify-center border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000] transition hover:-translate-y-[calc(50%+2px)]"
                    aria-label="下一张"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              ) : null}

              <div
                className={cn(
                  "z-[132] flex max-h-[85vh] max-w-[90vw] items-center justify-center transition duration-200",
                  lightboxVisible ? "scale-100 opacity-100" : "scale-95 opacity-0",
                )}
                // 点图不关灯箱，只有点图以外的背景才关
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[lightboxIndex]}
                  alt={`${title} 预览图 ${lightboxIndex + 1}`}
                  decoding="async"
                  // 放大这张也必须带：少了它 GameBanana 直接不返回图，缩略图能看、点开是坏图
                  referrerPolicy="no-referrer"
                  className="max-h-[85vh] max-w-[90vw] border-4 border-black object-contain shadow-[10px_10px_0px_0px_#000]"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
