"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";

import { copyToClipboard } from "@/lib/clipboard";
import { downloadDataUrl } from "@/lib/download";
import { sanitizeFileName } from "@/lib/share-export-filename";
import { cn } from "@/lib/utils";

import { ShareModCardContent } from "./share-mod-card";

type ShareModDialogProps = {
  open: boolean;
  onClose: () => void;
  /** 已拼好的规范分享链接 */
  url: string;
  /** MOD 标题，仅用于面板副标题 */
  title?: string;
  /** MOD 首张预览图（原图地址，面板内按卡片尺寸请求 COS） */
  imageUrl?: string;
};

const SHARE_BUTTON_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center border-[3px] border-black bg-white text-lg font-black leading-none shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

/** 面板里的操作按钮在导出 PNG 时被隐藏，只留内容本身（见 handleExport） */
const EXPORT_EXCLUDE = "data-export-exclude";

export function ShareModDialog({ open, onClose, url, title, imageUrl }: ShareModDialogProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** 导出截图目标：卡片内容（不含按钮 —— 按钮在导出时按 data-export-exclude 隐藏） */
  const cardRef = useRef<HTMLDivElement>(null);
  /** 无障碍外壳：接收焦点、承载 Esc/Tab 循环 */
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // 打开时接管焦点、关闭时还给触发按钮；Esc 关闭；Tab 在面板内循环。
  // `open` 只可能由浏览器里的点击置为 true，所以这里不必再等 mounted ——
  // 也就避免了「effect 里同步 setState 触发级联渲染」的问题。
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(url);
    if (!ok) {
      toast.error("复制失败，请手动选择链接复制");
      return;
    }
    toast.success("链接已复制");
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  /**
   * 导出当前分享面板为 PNG。用 html-to-image 对卡片节点截图：
   * - `data-export-exclude` 标记的操作按钮（关闭/复制/导出）截图前临时隐藏，截完恢复，
   *   这样导出图 = 面板内容（标题 + 封面 + 二维码 + 提示语 + 链接），不含按钮。
   * - `pixelRatio: 2` 保证高分屏/转发后仍清晰；`backgroundColor` 保留奶油底色。
   * 库走动态 import，和 qrcode.react 一样不进 /mods 首屏 bundle。
   */
  const handleExport = async () => {
    const node = cardRef.current;
    if (!node || exporting) return;

    setExporting(true);

    const excludes = Array.from(node.querySelectorAll<HTMLElement>(`[${EXPORT_EXCLUDE}]`));
    const prev = excludes.map((el) => el.style.visibility);
    excludes.forEach((el) => {
      el.style.visibility = "hidden";
    });

    let dataUrl: string | null = null;
    try {
      const { toPng } = await import("html-to-image");
      dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#fff8ef" });
    } catch {
      toast.error("导出失败，请重试");
    } finally {
      excludes.forEach((el, index) => {
        el.style.visibility = prev[index];
      });
      setExporting(false);
    }

    if (dataUrl) {
      const base = title ? sanitizeFileName(title) : "资源";
      downloadDataUrl(dataUrl, `分享-${base}.png`);
      toast.success("分享图已保存");
    }
  };

  /**
   * 必须 portal 到 body：详情抽屉（SheetContent）是带 `translate-x-*` 的 fixed 元素，
   * transform 会生成新的定位块，面板直接渲染在抽屉里会被裁剪/偏移。
   */
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      {/* 无障碍外壳：focus / Esc / Tab 循环都在这个节点上；截图目标是里面的卡片 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-mod-dialog-title"
        tabIndex={-1}
        className="outline-none"
      >
        <ShareModCardContent
          ref={cardRef}
          url={url}
          title={title}
          imageUrl={imageUrl}
          titleId="share-mod-dialog-title"
          topRight={
            <button
              type="button"
              onClick={onClose}
              {...{ [EXPORT_EXCLUDE]: "" }}
              className={cn(SHARE_BUTTON_CLASS, "absolute top-3 right-3")}
              aria-label="关闭分享面板"
            >
              <X className="size-4" strokeWidth={3} />
            </button>
          }
          footer={
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                {...{ [EXPORT_EXCLUDE]: "" }}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#ffd84f] px-3 text-xs font-black uppercase tracking-[0.1em] shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                <Copy className="size-4" strokeWidth={3} />
                {copied ? "已复制" : "复制链接"}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                {...{ [EXPORT_EXCLUDE]: "" }}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#C4B5FD] px-3 text-xs font-black uppercase tracking-[0.1em] shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" strokeWidth={3} />
                )}
                {exporting ? "导出中" : "导出 PNG"}
              </button>
            </div>
          }
        />
      </div>
    </div>,
    document.body,
  );
}

export { SHARE_BUTTON_CLASS };
