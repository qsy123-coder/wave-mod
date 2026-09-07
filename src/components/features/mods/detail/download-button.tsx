"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Download, LoaderCircle, X } from "lucide-react";

import type { DriveLink } from "@/lib/mods-domain/types";

type DownloadButtonProps = {
  compact?: boolean;
  modId: string;
  downloadUrl: string | null;
  downloadCount: number;
  driveLinks: DriveLink[];
};

/** 复制到剪贴板，优先 navigator.clipboard，失败降级 execCommand（兼容非安全上下文/旧浏览器）。 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 忽略，走降级 */
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

export function DownloadButton({ compact = false, modId, downloadUrl, downloadCount, driveLinks }: DownloadButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const hasDownload = Boolean(downloadUrl?.trim());

  const handleDownload = async () => {
    if (!hasDownload || isPending) return;

    setIsPending(true);

    try {
      const response = await fetch(`/api/mods/${modId}/download`, { method: "POST" });
      const result = (await response.json()) as { ok?: boolean; error?: string; downloadUrl?: string };

      if (!response.ok || !result.ok || !result.downloadUrl) return;
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setIsPending(false);
    }
  };

  const handleCopy = async (drive: DriveLink) => {
    const ok = await copyToClipboard(drive.url);
    if (!ok) return;
    setCopiedPlatform(drive.platform);
  };

  const dismissCopied = () => {
    setCopiedPlatform(null);
  };

  if (!hasDownload && driveLinks.length === 0) return null;

  const driveButtonClass = (copied: boolean) =>
    `inline-flex w-full items-center justify-center gap-2 border-4 border-black font-black uppercase text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${copied ? "bg-[#86efac]" : "bg-[#C4B5FD]"} ${compact ? "h-11 px-3 text-[11px] tracking-[0.12em]" : "h-14 px-5 text-sm tracking-[0.16em]"}`;

  return (
    <div>
      {hasDownload ? (
        <button
          type="button"
          onClick={handleDownload}
          disabled={isPending}
          className={`inline-flex w-full items-center justify-center gap-2 border-4 border-black bg-[#FFD93D] font-black uppercase text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${compact ? "h-11 px-3 text-[11px] tracking-[0.12em]" : "h-14 px-5 text-sm tracking-[0.16em]"}`}
        >
          {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          {isPending ? "跳转中" : compact ? "直链下载" : `直链下载 ZIP · ${downloadCount}`}
        </button>
      ) : null}

      {driveLinks.length > 0 ? (
        <div className={`space-y-1.5 ${hasDownload ? "mt-2" : ""}`}>
          {driveLinks.map((drive) => {
            const copied = copiedPlatform === drive.platform;
            return (
              <button
                key={`${drive.platform}-${drive.url}`}
                type="button"
                onClick={() => handleCopy(drive)}
                className={driveButtonClass(copied)}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? `已复制 · ${drive.platform}` : `复制链接 · ${drive.platform}`}
              </button>
            );
          })}
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {copiedPlatform ? (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="relative border-4 border-black bg-white p-3.5 shadow-[4px_4px_0px_0px_#000]">
              <button
                type="button"
                onClick={dismissCopied}
                aria-label="关闭提示"
                className="absolute right-2 top-2 inline-flex size-6 items-center justify-center border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition hover:bg-[#f3f3f3] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                <X className="size-4" />
              </button>
              <div className="space-y-2 pr-7">
                <p className="text-[13px] font-black leading-5 text-black">
                  打开{copiedPlatform}客户端会弹出下载框，网页端打开则可能限速、需要反复登录。
                </p>
                <p className="text-[12px] font-bold leading-5 text-black/45">
                  <span className="font-black uppercase tracking-[0.12em] text-[#a16207]">Tips：</span>
                  如果觉得下载慢，可以去某鱼花个一两块租个一天的网盘。
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
