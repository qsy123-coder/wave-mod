"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Download, ExternalLink, LoaderCircle, X } from "lucide-react";
import Image from "next/image";

import { copyToClipboard } from "@/lib/clipboard";
import { driveCopyTip } from "@/lib/cloud-drive";
import { driveOpenHref } from "@/lib/drive-client";
import { launchDriveClient } from "@/lib/drive-client-launch";
import { DIRECT_DOWNLOAD_UNAVAILABLE, resolveDownloadResponse } from "@/lib/mods-domain/download-result";
import type { DriveLink } from "@/lib/mods-domain/types";

type DownloadButtonProps = {
  compact?: boolean;
  modId: string;
  downloadUrl: string | null;
  downloadCount: number;
  driveLinks: DriveLink[];
  /**
   * 版式。`stacked`（默认）是原来那种「直链 + 网盘按钮一竖排」，
   * `blocks` 是详情弹窗用的三段式：主下载大按钮 + 灰底「其他网盘」块。
   * 默认值保持旧的，所以 mod-action-drawer / 分站详情不用改。
   */
  layout?: "stacked" | "blocks";
};

export function DownloadButton({
  compact = false,
  modId,
  downloadUrl,
  downloadCount,
  driveLinks,
  layout = "stacked",
}: DownloadButtonProps) {
  const [isPending, setIsPending] = useState(false);
  // 记下「这一次复制有没有真的去唤起客户端」：这个网盘本会话已唤起过时会跳过，
  // 文案得跟着变（否则会对着用户说「正在尝试打开」而其实没开）
  const [copiedDrive, setCopiedDrive] = useState<{ platform: string; launched: boolean } | null>(null);
  const [showTip, setShowTip] = useState(false);
  // 直链失败时的提示。非空即渲染 —— 绝不再静默返回，见 download-result.ts 的说明。
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const hasDownload = Boolean(downloadUrl?.trim());
  // 只有迅雷/夸克有「粘贴链接」教程图，其它网盘不展示「?」（文案与图见 lib/cloud-drive.ts）
  // client 传的是「这次真的唤起了没有」—— 同网盘再点就是 already-open，文案不能说会打开
  const tip = copiedDrive
    ? driveCopyTip(copiedDrive.platform, { client: copiedDrive.launched ? "launch" : "already-open" })
    : null;
  const tipImage = tip?.tipImage ?? null;

  // 复制到另一个网盘时收起教程弹层
  useEffect(() => {
    setShowTip(false);
  }, [copiedDrive]);

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
    // 复制失败就不唤起：客户端被拉起来了却读不到剪贴板，比不唤起更让人困惑
    if (!ok) return;
    // 把对应客户端拉起来（它自己会读剪贴板弹转存框）。同一条链接本会话已唤起过就跳过，
    // 免得反复把它切到前台。返回值决定文案口径 —— 见 lib/drive-client-launch.ts
    const launched = launchDriveClient(drive.platform, drive.url);
    setCopiedDrive({ platform: drive.platform, launched });
  };

  const dismissCopied = () => {
    setCopiedDrive(null);
  };

  if (!hasDownload && driveLinks.length === 0) return null;

  // display 交给调用方（手机/桌面各一个按钮，靠 sm 断点显隐），这里只管尺寸与描边
  const driveButtonBase = `w-full items-center justify-center gap-2 border-4 border-black font-black uppercase text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${compact ? "h-11 px-3 text-[11px] tracking-[0.12em]" : "h-14 px-5 text-sm tracking-[0.16em]"}`;
  const driveButtonClass = (copied: boolean) =>
    `${driveButtonBase} ${copied ? "bg-[#86efac]" : "bg-[#C4B5FD]"}`;
  // 手机端直接跳分享页：装了网盘 App 的系统会接管 https 链接，没装也能在网页里输提取码。
  // 用 CSS 断点而不是 JS 判断 UA —— 服务端与客户端首屏渲染一致，不会水合错位。
  const driveOpenClass = `inline-flex sm:hidden ${driveButtonBase} bg-[#FFD93D]`;

  /**
   * 复制后的「怎么用」提示层。两种版式共用，所以抽成节点而不是复制一份 JSX。
   * 它依赖的 state（copiedDrive / showTip）都在组件内，位置不影响行为。
   */
  const copyTipPanel = (
    <AnimatePresence initial={false}>
      {copiedDrive ? (
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
                    alt={`${copiedDrive.platform} 粘贴链接操作教程`}
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
  );

  /**
   * blocks 版式：主下载 + 灰底「其他网盘」。
   * 主盘取 `driveLinks[0]`（顺序来自后端），其余收进第二块；有直链时作为「其他网盘」里的
   * 一项，而不是再占一个同等权重的通栏按钮。
   */
  if (layout === "blocks") {
    const primaryDrive = driveLinks[0] ?? null;
    const firstOther = driveLinks.slice(1);

    // ⚠️ 这里**不要**再写 `inline-flex`：它和调用方的 `hidden` / `sm:hidden` 同属 display 工具类，
    // 谁在生成的 CSS 里靠后谁生效（与 class 书写顺序无关），曾导致手机端主下载出现两个按钮。
    // display 一律由调用方决定。
    const primaryClass = (copied: boolean) =>
      `w-full items-center justify-center gap-2 border-4 border-black text-sm font-black uppercase tracking-[0.16em] shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none h-12 px-4 ${copied ? "bg-[#86efac] text-black" : "bg-[#FF2D78] text-white"}`;
    const secondaryClass = (copied: boolean) =>
      `w-full items-center justify-center gap-2 border-4 border-black text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none h-11 px-3 ${copied ? "bg-[#86efac]" : "bg-white"}`;

    return (
      <div className="space-y-3">
        {primaryDrive ? (
          <div>
            {driveOpenHref(primaryDrive.url) ? (
              <a
                href={driveOpenHref(primaryDrive.url) ?? primaryDrive.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex sm:hidden ${primaryClass(Boolean(copiedDrive?.platform === primaryDrive.platform))}`}
              >
                <ExternalLink className="size-4" />
                打开{primaryDrive.platform}
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => handleCopy(primaryDrive)}
              className={`${driveOpenHref(primaryDrive.url) ? "hidden sm:inline-flex" : "inline-flex"} ${primaryClass(Boolean(copiedDrive?.platform === primaryDrive.platform))}`}
            >
              {copiedDrive?.platform === primaryDrive.platform ? (
                <Check className="size-4" />
              ) : (
                <Download className="size-4" />
              )}
              {copiedDrive?.platform === primaryDrive.platform
                ? `已复制 · ${primaryDrive.platform}`
                : `下载模组 · ${primaryDrive.platform}`}
            </button>
          </div>
        ) : hasDownload ? (
          <button type="button" onClick={handleDownload} disabled={isPending} className={`inline-flex ${primaryClass(false)}`}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            {isPending ? "跳转中" : `直链下载 ZIP · ${downloadCount}`}
          </button>
        ) : null}

        {failureMessage ? (
          <p
            role="alert"
            className="border-4 border-black bg-[#ffb5c3] px-3 py-2 text-xs font-black leading-5 text-black shadow-[4px_4px_0px_0px_#000]"
          >
            {failureMessage}
          </p>
        ) : null}

        {firstOther.length > 0 || (hasDownload && primaryDrive) ? (
          <div className="border-4 border-black bg-[#f2f2f2] p-3 shadow-[4px_4px_0px_0px_#000]">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-black/70">其他网盘</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {firstOther.map((drive) => {
                const copied = copiedDrive?.platform === drive.platform;
                const openHref = driveOpenHref(drive.url);
                return (
                  <div key={`${drive.platform}-${drive.url}`}>
                    {openHref ? (
                      <a
                        href={openHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`打开${drive.platform}分享页`}
                        className={`inline-flex sm:hidden ${secondaryClass(copied)}`}
                      >
                        <ExternalLink className="size-4" />
                        打开{drive.platform}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCopy(drive)}
                        className={`inline-flex sm:hidden ${secondaryClass(copied)}`}
                      >
                        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        {copied ? `已复制 · ${drive.platform}` : `复制链接 · ${drive.platform}`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(drive)}
                      className={`hidden sm:inline-flex ${secondaryClass(copied)}`}
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied ? `已复制 · ${drive.platform}` : `复制链接 · ${drive.platform}`}
                    </button>
                  </div>
                );
              })}
              {hasDownload && primaryDrive ? (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isPending}
                  className={`inline-flex ${secondaryClass(false)}`}
                >
                  {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {isPending ? "跳转中" : "直链下载 ZIP"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {copyTipPanel}
      </div>
    );
  }

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
        <div className={`${hasDownload ? "mt-2 " : ""}${driveLinks.length > 1 ? "grid grid-cols-2 gap-2" : "space-y-1.5"}`}>
          {driveLinks.map((drive) => {
            const copied = copiedDrive?.platform === drive.platform;
            // 手机端优先直接跳分享页；链接缺 scheme 等脏数据没法跳，就退回复制
            const openHref = driveOpenHref(drive.url);
            return (
              <div key={`${drive.platform}-${drive.url}`}>
                {openHref ? (
                  <a
                    href={openHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`打开${drive.platform}分享页`}
                    className={driveOpenClass}
                  >
                    <ExternalLink className="size-4" />
                    打开{drive.platform}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCopy(drive)}
                    className={`inline-flex sm:hidden ${driveButtonClass(copied)}`}
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? `已复制 · ${drive.platform}` : `复制链接 · ${drive.platform}`}
                  </button>
                )}
                {/* 桌面端保持原样：复制到剪贴板并唤起客户端 */}
                <button
                  type="button"
                  onClick={() => handleCopy(drive)}
                  className={`hidden sm:inline-flex ${driveButtonClass(copied)}`}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? `已复制 · ${drive.platform}` : `复制链接 · ${drive.platform}`}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {copyTipPanel}
    </div>
  );
}
