"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, Copy, HardDriveDownload } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { driveCopyTip } from "@/lib/cloud-drive";
import { launchDriveClient } from "@/lib/drive-client-launch";
import { REQUIRED_TOOL_DRIVES, REQUIRED_TOOLS_SUMMARY, type ToolDrive } from "../tool-download";

/**
 * 教程页顶部的「下载必要工具」。
 *
 * 一个按钮收住两个网盘：点开下拉选网盘 → 复制链接 → **唤起对应网盘客户端**（同 mod 详情页）。
 * 夸克/迅雷分享页在浏览器里打开会限速、反复要求登录，正确路径是复制后粘进客户端转存，
 * 所以复制完要明确告诉用户下一步干什么（文案与操作图见 lib/cloud-drive.ts，
 * 与 mod 详情页的复制网盘按钮同一套说法）。
 */
export function ToolDownloadCard() {
  const [open, setOpen] = useState(false);
  // launched 记「这一次复制有没有真的去唤起客户端」：该网盘本会话已唤起过时会跳过，
  // 文案得跟着变（否则会对着用户说「正在尝试打开」而其实没开）—— 同 download-button.tsx
  const [copied, setCopied] = useState<{ platform: string; url: string; launched: boolean } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [showTip, setShowTip] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点空白处收起下拉（与教程页原有的「网盘下载」下拉同一套行为）
  useEffect(() => {
    if (!open) return;
    const onClose = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClose);
    return () => document.removeEventListener("mousedown", onClose);
  }, [open]);

  const tip = copied
    ? driveCopyTip(copied.platform, { client: copied.launched ? "launch" : "already-open" })
    : null;

  const handleCopy = async (drive: ToolDrive) => {
    setShowTip(false);
    const ok = await copyToClipboard(drive.url);
    setOpen(false);
    if (!ok) {
      // 复制失败不能静默：把原链接摆出来让用户手动复制
      setCopied(null);
      setFailedUrl(drive.url);
      return;
    }
    // 复制失败就不唤起：客户端被拉起来了却读不到剪贴板，比不唤起更让人困惑。
    // 同一网盘本会话已唤起过会跳过（见 lib/drive-client-launch.ts）。
    const launched = launchDriveClient(drive.platform, drive.url);
    setFailedUrl(null);
    setCopied({ platform: drive.platform, url: drive.url, launched });
  };

  return (
    <section
      className="border-4 border-black px-3 py-2.5 shadow-[6px_6px_0px_0px_#000]"
      style={{ background: "var(--neo-panel)" }}
    >
      <p className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 border-[3px] border-black px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]"
          style={{ background: "var(--neo-accent)" }}
        >
          <HardDriveDownload className="size-3.5" />
          下载必要工具
        </span>
        <span className="text-sm font-bold leading-6 text-black/80">{REQUIRED_TOOLS_SUMMARY}</span>
      </p>
      <p className="mt-1 text-xs font-bold leading-5 text-black/55">
        点按钮会<span className="text-black">复制链接并打开对应网盘客户端</span>，没弹出的话手动打开客户端粘贴转存下载。
      </p>

      {/* 单个入口 + 下拉选网盘 */}
      <div ref={dropdownRef} className="relative mt-2 inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`inline-flex items-center gap-2 border-4 border-black px-3.5 py-2 text-xs font-black uppercase tracking-[0.1em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
            copied ? "bg-[#86efac]" : "bg-[#C4B5FD]"
          }`}
        >
          {copied ? <Check className="size-3.5" /> : <HardDriveDownload className="size-3.5" />}
          {copied ? `已复制 · ${copied.platform}` : "下载必要工具（网盘里的全下）"}
          <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+6px)] z-50 flex min-w-[210px] flex-col border-4 border-black bg-white shadow-[6px_6px_0px_0px_#000]"
          >
            {REQUIRED_TOOL_DRIVES.map((drive) => {
              const isCopied = copied?.url === drive.url;
              return (
                <button
                  key={drive.url}
                  type="button"
                  role="menuitem"
                  onClick={() => void handleCopy(drive)}
                  aria-label={`复制${drive.platform}链接（含提取码）`}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-black text-black transition hover:bg-[var(--neo-accent)] ${
                    isCopied ? "bg-[#86efac]" : "bg-white"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    复制链接 · {drive.platform}
                  </span>
                  {isCopied ? <span className="text-[10px] font-bold text-black/60">已复制</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 复制成功后的引导：怎么用 + 可展开的操作教程图 */}
      {copied && tip ? (
        <div className="mt-2.5 border-t-[3px] border-black pt-2.5">
          <p className="text-[13px] font-black leading-5 text-black">
            {tip.advice}；{tip.warning}
            {tip.tipImage ? (
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
          {tip.tipImage ? (
            <div
              className={`overflow-hidden transition-all duration-200 ${
                showTip ? "mt-2 max-h-[320px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <Image
                src={tip.tipImage}
                alt={`${copied.platform} 粘贴链接操作教程`}
                width={440}
                height={263}
                className="h-auto w-full max-w-[440px] border-2 border-black"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 复制失败：把链接摊开，至少能手动选中复制 */}
      {failedUrl ? (
        <div
          role="alert"
          className="mt-2.5 border-4 border-black bg-[#ffb5c3] px-3 py-2 shadow-[4px_4px_0px_0px_#000]"
        >
          <p className="text-xs font-black text-black">
            浏览器拦住了复制，请手动复制下面的链接到对应网盘客户端：
          </p>
          <p className="mt-1 select-all break-all text-xs font-bold text-black/80">{failedUrl}</p>
        </div>
      ) : null}
    </section>
  );
}
