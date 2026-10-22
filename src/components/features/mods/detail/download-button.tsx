"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Download, ExternalLink, LoaderCircle, X } from "lucide-react";
import Image from "next/image";

import { copyToClipboard } from "@/lib/clipboard";
import { driveCopyTip } from "@/lib/cloud-drive";
import { reportDownload } from "@/lib/engagement/client";
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
   * `bar` 是详情底部操作条用的横排：每个网盘一个按钮，排在「分享」右边。
   * 默认值保持旧的，所以 mod-action-drawer / 分站详情不用改。
   */
  layout?: "stacked" | "bar";
  /** 解压码：bar 版式下显示在按钮第二行的括号里（点下去就要输，放点击处最省事） */
  unzipCode?: string;
};

export function DownloadButton({
  compact = false,
  modId,
  downloadUrl,
  downloadCount,
  driveLinks,
  layout = "stacked",
  unzipCode,
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
      reportDownload(modId);
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
    // 复制成功即视为一次下载（这也是桌面端真正的下载动作）
    reportDownload(modId);
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
        /*
         * ⚠️ 这里**不能用 height: auto + overflow-hidden** 的撑开动画（2026-10-22 修的 bug）：
         * 底栏版式里提示卡是 `absolute bottom-[calc(100%+10px)]` 锚在操作条上方的，内容一撑高，
         * 整张卡连同「?」一起往上移 ⇒ 光标离开「?」⇒ 收起 ⇒ 又落回光标下 ⇒ 再撑开……
         * 实测进入 open/closed 抖动循环，表现为「hover 半天教程图也不出来」。
         * 现在只做淡入位移，卡片高度恒定；教程图改成绝对定位浮层（见下方），不参与布局。
         */
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
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
                    // 触屏没有 hover：点一下也能看，再点收起
                    onClick={() => setShowTip((prev) => !prev)}
                    className="ml-1.5 inline-flex size-[18px] -translate-y-[1px] cursor-help items-center justify-center rounded-full border-2 border-black bg-[#FFD93D] text-[10px] font-black leading-none text-black shadow-[1px_1px_0px_0px_#000] transition hover:bg-[#fff3c4] active:translate-y-0 active:shadow-none"
                  >
                    ?
                  </button>
                ) : null}
              </p>
              {tipImage ? (
                // 浮层：不占高度、不推动卡片，所以「?」不会从光标下跑掉（见上面那段说明）。
                // pointer-events-none 保证它不会把鼠标从「?」上抢走。
                <div
                  aria-hidden={!showTip}
                  className={`pointer-events-none absolute bottom-full left-0 right-0 z-30 mb-2 transition-opacity duration-150 ${
                    showTip ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <Image
                    src={tipImage}
                    alt={`${copiedDrive.platform} 粘贴链接操作教程`}
                    width={440}
                    height={263}
                    className="h-auto w-full rounded-md border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000]"
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
   * bar 版式：每个网盘一个按钮，直接排进详情底部操作条的「分享」右边。
   *
   * 复制后的操作教程浮在操作条**上方**（绝对定位），不占内容高度 —— 否则提示卡一出现
   * 就把底栏撑高，可视区跟着跳。直链（若有）作为最后一个紫色按钮一起排在这里。
   */
  if (layout === "bar") {
    // ⚠️ display 一律由调用方给：`inline-flex` 若写进基础类，会和调用方的 `hidden` /
    // `sm:hidden` 打架（同为 display 工具类，按生成顺序生效），曾因此出现重复按钮。
    const barClass = (copied: boolean, tone: "drive" | "direct") =>
      `flex-1 items-center justify-center gap-1 border-4 border-black h-11 px-1.5 text-[11px] font-black leading-[1.05] tracking-[0.04em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
        copied ? "bg-[#86efac] text-black" : tone === "direct" ? "bg-[#C4B5FD] text-black" : "bg-[#FF2D78] text-white"
      }`;

    /**
     * 按钮内两行：动作（复制/打开 哪个网盘）+ 解压密码。
     *
     * 第一行必须写清「点下去会发生什么」（用户 2026-10-22：光写「夸克」看不出是复制链接）；
     * 第二行显式标出「解压密码」—— 只写一个括号里的 x77syq，很多人不知道那是干什么用的。
     */
    const barLabel = (label: string) => (
      <span className="flex min-w-0 flex-col items-center">
        <span className="max-w-full truncate">{label}</span>
        {/* 只在 sm 以上显示：手机上两个网盘按钮并排时，这一行会把收藏按钮挤出屏幕
            （实测 390px 视口下 min-content 超宽 34px）。手机端的密码由详情底栏的独立一行交代。 */}
        {unzipCode ? (
          <span className="mt-0.5 hidden max-w-full truncate text-[9px] font-bold opacity-90 sm:block">
            解压密码 {unzipCode}
          </span>
        ) : null}
      </span>
    );

    return (
      <div className="relative flex flex-1 items-stretch gap-2">
        {driveLinks.map((drive) => {
          const copied = copiedDrive?.platform === drive.platform;
          const openHref = driveOpenHref(drive.url);
          // 底栏很窄，按钮上去掉「网盘」后缀（夸克网盘 → 夸克），aria/title 里保留全称
          const shortLabel = drive.platform.replace(/网盘$/, "");

          return (
            <div key={`${drive.platform}-${drive.url}`} className="flex flex-1">
              {/* 手机端优先直接跳分享页；链接缺 scheme 等脏数据没法跳，就退回复制 */}
              {openHref ? (
                <a
                  href={openHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开${drive.platform}分享页${unzipCode ? `，解压密码 ${unzipCode}` : ""}`}
                  className={`inline-flex sm:hidden ${barClass(copied, "drive")}`}
                  onClick={() => reportDownload(modId)}
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  {barLabel(`打开${shortLabel}`)}
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => handleCopy(drive)}
                className={`${openHref ? "hidden sm:inline-flex" : "inline-flex"} ${barClass(copied, "drive")}`}
                title={copied ? `已复制 ${drive.platform} 链接` : `复制 ${drive.platform} 链接（会尝试唤起客户端）`}
              >
                {copied ? <Check className="size-3.5 shrink-0" /> : <Copy className="size-3.5 shrink-0" />}
                {copied ? barLabel("已复制") : barLabel(`复制${shortLabel}链接`)}
              </button>
            </div>
          );
        })}

        {hasDownload ? (
          <button
            type="button"
            onClick={handleDownload}
            disabled={isPending}
            className={`inline-flex ${barClass(false, "direct")}`}
            title="直链下载 ZIP"
          >
            {isPending ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <Download className="size-3.5 shrink-0" />}
            {barLabel("直链")}
          </button>
        ) : null}

        <div className="absolute bottom-[calc(100%+10px)] left-0 right-0 z-20">
          {failureMessage ? (
            <p
              role="alert"
              className="mb-2 border-4 border-black bg-[#ffb5c3] px-3 py-2 text-xs font-black leading-5 text-black shadow-[4px_4px_0px_0px_#000]"
            >
              {failureMessage}
            </p>
          ) : null}
          {copyTipPanel}
        </div>
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
                    onClick={() => reportDownload(modId)}
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
