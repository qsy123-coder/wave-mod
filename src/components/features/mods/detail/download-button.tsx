"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Download, LoaderCircle, X } from "lucide-react";
import Image from "next/image";

import { copyToClipboard } from "@/lib/clipboard";
import { driveCopyTip } from "@/lib/cloud-drive";
import { DIRECT_DOWNLOAD_UNAVAILABLE, resolveDownloadResponse } from "@/lib/mods-domain/download-result";
import type { DriveLink } from "@/lib/mods-domain/types";

type DownloadButtonProps = {
  compact?: boolean;
  modId: string;
  downloadUrl: string | null;
  downloadCount: number;
  driveLinks: DriveLink[];
};

export function DownloadButton({ compact = false, modId, downloadUrl, downloadCount, driveLinks }: DownloadButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [showTip, setShowTip] = useState(false);
  // 直链失败时的提示。非空即渲染 —— 绝不再静默返回，见 download-result.ts 的说明。
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const hasDownload = Boolean(downloadUrl?.trim());
  // 只有迅雷/夸克有「粘贴链接」教程图，其它网盘不展示「?」（文案与图见 lib/cloud-drive.ts）
  const tip = copiedPlatform ? driveCopyTip(copiedPlatform) : null;
  const tipImage = tip?.tipImage ?? null;

  // 复制到另一个网盘时收起教程弹层
  useEffect(() => {
    setShowTip(false);
  }, [copiedPlatform]);

  const handleDownload = async () => {
    if (!hasDownload || isPending) return;

    setIsPending(true);
    setFailureMessage(null);

    try {
      const response = await fetch(`/api/mods/${modId}/download`, { method: "POST" });
      // 网关可能返回 HTML 错误页，.json() 会抛 —— 捕获成 null 后统一走判定，
      // 免得解析异常又变成一次静默。
      const payload: unknown = await response.json().catch(() => null);
      const resolution = resolveDownloadResponse(response.status, payload);

      if (!resolution.ok) {
        setFailureMessage(resolution.message);
        return;
      }

      window.open(resolution.url, "_blank", "noopener,noreferrer");
    } catch {
      // 网络层失败（断网、请求被中断）也要给用户一个说法
      setFailureMessage(DIRECT_DOWNLOAD_UNAVAILABLE);
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

      {failureMessage ? (
        <p
          role="alert"
          className="mt-2 border-4 border-black bg-[#ffb5c3] px-3 py-2 text-xs font-black leading-5 text-black shadow-[4px_4px_0px_0px_#000]"
        >
          {failureMessage}
        </p>
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
                  {tip?.advice}
                  ；{tip?.warning}
                  {tipImage ? (
                    <button
                      type="button"
                      aria-label="查看操作教程"
                      aria-expanded={showTip}
                      onMouseEnter={() => setShowTip(true)}
                      onMouseLeave={() => setShowTip(false)}
                      onFocus={() => setShowTip(true)}
                      onBlur={() => setShowTip(false)}
                      className="ml-1.5 inline-flex size-[18px] -translate-y-[1px] cursor-help items-center justify-center rounded-full border-2 border-black bg-[#FFD93D] text-[10px] font-black leading-none text-black shadow-[1px_1px_0px_0px_#000] transition hover:bg-[#fff3c4] active:translate-y-0 active:shadow-none"
                    >
                      ?
                    </button>
                  ) : null}
                </p>
                {tipImage ? (
                  <div className={`overflow-hidden transition-all duration-200 ${showTip ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0"}`}>
                    <Image
                      src={tipImage}
                      alt={`${copiedPlatform} 粘贴链接操作教程`}
                      width={440}
                      height={263}
                      className="h-auto w-full rounded-md border-2 border-black"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
