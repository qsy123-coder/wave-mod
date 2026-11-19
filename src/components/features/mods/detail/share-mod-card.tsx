"use client";

import { Component, forwardRef, useState, type ReactNode } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Share2 } from "lucide-react";

import { COS_IMG_CARD, withCosImageTransform } from "@/lib/cos/shared";
import { isExternalStorageUrl } from "@/lib/storage/shared";
import { cn } from "@/lib/utils";

/**
 * 二维码库**动态加载**：`/mods` 是站内最重的页面之一，qrcode.react 只应该在
 * 用户真正打开分享面板时下载（memory: client-bundle-leaks-zod-framer-motion）。
 * `ssr: false` 是因为它只在浏览器里用 —— 详情抽屉本身就是客户端按 id 拉数据填的。
 */
const QRCodeSVG = dynamic(() => import("qrcode.react").then((mod) => mod.QRCodeSVG), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-white" aria-hidden />,
});

/**
 * 二维码分包加载失败（弱网、发布时 chunk 换名）不能让整个分享面板崩掉 ——
 * 链接和复制按钮本身不依赖它，必须继续可用。
 */
class QrErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex size-full items-center justify-center bg-white px-4 text-center text-xs font-black leading-5 text-black/60">
          二维码加载失败
          <br />
          请直接复制下方链接
        </div>
      );
    }
    return this.props.children;
  }
}

type ShareModCardContentProps = {
  /** 已拼好的规范分享链接（二维码 + 链接文本共用） */
  url: string;
  /** MOD 标题，仅用于面板副标题 */
  title?: string;
  /** MOD 首张预览图（原图地址，面板内按卡片尺寸请求 COS） */
  imageUrl?: string;
  /** 批量导出离屏渲染时强制 eager 加载，避免 next/image 懒加载不触发 */
  coverPriority?: boolean;
  /** 面板标题的 id（对话框用于 aria-labelledby 关联）；批量导出不传，避免重复 id */
  titleId?: string;
  /** 卡片右上角插槽：对话框放「关闭」按钮，批量导出不传 */
  topRight?: ReactNode;
  /** 卡片底部插槽：对话框放「复制链接 / 导出 PNG」，批量导出不传 */
  footer?: ReactNode;
};

/**
 * 分享面板的**卡片内容**（标题 + 封面 + 二维码 + 提示语 + 链接）。
 *
 * 抽成可复用组件是为了让「详情页对话框」与「每日更新批量导出」共用同一套视觉：
 * 对话框把它包在弹层里再塞进按钮，批量导出在离屏容器里逐张渲染同一张卡片再截图。
 * 卡片本身不带任何交互控件 —— 按钮由调用方经 `topRight` / `footer` 传入，
 * 这样截图目标（本组件根节点）天然只有内容，不把「复制链接」这类按钮截进图片里。
 */
export const ShareModCardContent = forwardRef<HTMLDivElement, ShareModCardContentProps>(
  function ShareModCardContent(
    { url, title, imageUrl, coverPriority = false, titleId, topRight, footer },
    ref,
  ) {
    /**
     * 预览图方向。记的是「哪张图 + 它的方向」而不是布尔值：换一个 MOD 时 src 变了，
     * 旧结论自动失效，不必在 effect 里 setState（会被 react-hooks/set-state-in-effect 拦下）。
     * 首图加载完成前按横屏（上下排列）渲染。
     */
    const [coverInfo, setCoverInfo] = useState<{ src: string; ratio: number } | null>(null);

    // 与详情页预览同口径：COS 图按 800px 卡片档取，别直接拉原图
    const coverSrc = imageUrl ? withCosImageTransform(imageUrl, COS_IMG_CARD) : null;
    // 宽高比只在加载完成后才知道；方框宽度随之收缩，不再固定占满整行
    const coverRatio = coverSrc && coverInfo?.src === coverSrc ? coverInfo.ratio : null;
    const isPortrait = Boolean(coverRatio && coverRatio < 1);

    /**
     * 完整显示，不裁切：object-contain + 固定高度的盒子。
     * 竖图放左侧与二维码并排，横图放上方、二维码在下方；
     * 两种排法下二维码盒与预览图盒都取行上的 `--share-cover-h`，永远等高。
     */
    const coverElement = coverSrc ? (
      <Image
        src={coverSrc}
        alt={title ? `${title} 预览图` : "外观资源预览图"}
        width={800}
        height={450}
        priority={coverPriority}
        unoptimized={isExternalStorageUrl(imageUrl ?? "")}
        sizes="(max-width: 384px) 60vw, 240px"
        onLoad={(event) => {
          const img = event.currentTarget;
          if (!img.naturalWidth || !img.naturalHeight) return;
          setCoverInfo({ src: coverSrc, ratio: img.naturalWidth / img.naturalHeight });
        }}
        className="h-full w-full object-contain"
      />
    ) : null;

    const qrElement = (
      <QrErrorBoundary>
        <QRCodeSVG
          value={url}
          size={224}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
          title={`打开分享链接：${url}`}
          // 边长完全由外层方框决定（size={224} 只是未加载时的固有尺寸兜底），
          // 方框高度跟着预览图走，二维码就跟着缩放
          className="block size-full"
          data-qr-code
        />
      </QrErrorBoundary>
    );

    return (
      <div
        ref={ref}
        className="relative max-h-[calc(100vh-1.5rem)] w-full max-w-xl overflow-y-auto border-4 border-black bg-[#fff8ef] p-4 text-black shadow-[8px_8px_0px_0px_#000] sm:max-h-[calc(100vh-2rem)] sm:p-5"
      >
        {topRight}

        <div className="flex items-center gap-2 pr-10">
          <span className="inline-flex size-8 items-center justify-center border-[3px] border-black bg-[#ffd84f] shadow-[3px_3px_0px_0px_#000]">
            <Share2 className="size-4" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-black uppercase tracking-[0.04em]">
              分享这个资源
            </h2>
            {title && <p className="truncate text-xs font-bold text-black/55">{title}</p>}
          </div>
        </div>

        <div
          className={cn(
            "mt-4 flex",
            // 预览图与二维码共用一个高度（--share-cover-h）：两个盒子都读它，永远等高。
            // 二维码是正方形，宽度=高度，所以并排时整行宽度 ≈ 盒高 ×(1+宽高比)，
            // 竖图档位的盒高要留够（桌面 18rem 时 ≤ 4:5 的竖图都放得下）。
            isPortrait
              ? "items-center justify-center gap-2 [--share-cover-h:10rem] sm:gap-4 sm:[--share-cover-h:18rem]"
              : "flex-col items-center gap-4 [--share-cover-h:12rem] sm:[--share-cover-h:16rem]",
          )}
        >
          {coverSrc && (
            <div
              className={cn(
                "flex h-[var(--share-cover-h)] min-w-0 items-center justify-center overflow-hidden border-4 border-black bg-white p-1 shadow-[5px_5px_0px_0px_#000]",
                // 方框宽度 = 高度 × 图片宽高比，不留左右白边
                coverRatio ? "max-w-full" : "w-full",
              )}
              style={coverRatio ? { width: `calc(var(--share-cover-h) * ${coverRatio})` } : undefined}
              data-share-cover-box
            >
              {coverElement}
            </div>
          )}

          <div className={cn(isPortrait ? "shrink-0" : "flex w-full justify-center")}>
            {/*
              二维码框：竖图并排时是正方形（宽=高）；横图上下排列时**宽度与预览图框一致**
              （同样按 --share-cover-h × 宽高比算，图片还没加载出比例前先占满整行）。
              二维码本身保持正方形、在框里居中 —— 拉伸成矩形就扫不出来了。
            */}
            <div
              className={cn(
                "flex items-center justify-center border-4 border-black bg-white p-3 shadow-[5px_5px_0px_0px_#000]",
                isPortrait ? "size-[var(--share-cover-h)]" : "h-[var(--share-cover-h)] w-full",
              )}
              style={
                !isPortrait && coverRatio
                  ? { width: `calc(var(--share-cover-h) * ${coverRatio})` }
                  : undefined
              }
            >
              {qrElement}
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] font-bold leading-5 text-black/55">
          微信「扫一扫」或相机扫码打开
        </p>

        <div className="mt-3 border-[3px] border-black bg-white px-3 py-2 shadow-[3px_3px_0px_0px_#000]">
          <p className="select-all break-all text-xs font-bold leading-5 text-black/80">{url}</p>
        </div>

        {footer}
      </div>
    );
  },
);
