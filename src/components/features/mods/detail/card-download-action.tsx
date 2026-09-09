"use client";

import { type KeyboardEvent, type MouseEvent } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import type { DriveLink } from "@/lib/mods-domain/types";

type CardDownloadActionProps = {
  driveLinks: DriveLink[];
  className?: string;
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

/** 根据网盘名称（模糊匹配关键字）返回品牌色背景类与图标配色。 */
function platformStyle(platform: string): { bg: string; fg: string } {
  const p = platform.toLowerCase();
  if (p.includes("百度") || p.includes("baidu")) return { bg: "bg-white", fg: "text-black" };
  if (p.includes("夸克") || p.includes("quark")) return { bg: "bg-[#2f7ff1]", fg: "text-white" };
  if (p.includes("阿里") || p.includes("ali")) return { bg: "bg-[#0cbabf]", fg: "text-white" };
  if (p.includes("蓝奏") || p.includes("lanzou")) return { bg: "bg-[#6aa6ff]", fg: "text-black" };
  if (p.includes("迅雷") || p.includes("xunlei")) return { bg: "bg-[#0b5bd3]", fg: "text-white" };
  if (p.includes("天翼") || p.includes("ctyun")) return { bg: "bg-[#0d6efd]", fg: "text-white" };
  if (p.includes("115") || p.includes("一二")) return { bg: "bg-[#2f7ff1]", fg: "text-white" };
  if (p.includes("和彩") || p.includes("移动云")) return { bg: "bg-[#00a6a6]", fg: "text-white" };
  if (p.includes("123") || p.includes("咪咕")) return { bg: "bg-[#4f8ef7]", fg: "text-white" };
  return { bg: "bg-[#C4B5FD]", fg: "text-black" };
}

/**
 * 卡片右上角的快捷下载：每个网盘一个彩色按钮（竖排），hover 左侧浮出平台名提示，
 * 点击复制对应链接到剪贴板并弹一句话 toast 引导到该网盘客户端打开。
 */
export function CardDownloadAction({ driveLinks, className = "" }: CardDownloadActionProps) {
  if (driveLinks.length === 0) return null;

  const copy = async (drive: DriveLink) => {
    const ok = await copyToClipboard(drive.url);
    if (!ok) {
      toast.error("复制失败", { description: "网盘链接复制失败，请到详情页手动复制。" });
      return;
    }
    toast.success("网盘链接已复制", {
      duration: 6000,
      description: /迅雷|xunlei/i.test(drive.platform)
        ? "请打开迅雷客户端，在上方搜索框粘贴链接转存下载，网页端打开会限速、需反复登录。"
        : `请到${drive.platform}客户端打开下载，网页端打开会限速、需反复登录。`,
    });
  };

  const handleClick = (e: MouseEvent<HTMLSpanElement>, drive: DriveLink) => {
    // 外层卡片是 <button>/<Link>，阻止冒泡到卡片触发跳转
    e.preventDefault();
    e.stopPropagation();
    void copy(drive);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>, drive: DriveLink) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      void copy(drive);
    }
  };

  return (
    <div className={`flex flex-col items-end gap-1.5 opacity-0 transition-opacity duration-150 group-hover/mod-card:opacity-100 ${className}`}>
      {driveLinks.map((drive) => {
        const { bg, fg } = platformStyle(drive.platform);
        return (
          <div key={`${drive.platform}-${drive.url}`} className="group relative">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => handleClick(e, drive)}
              onKeyDown={(e) => handleKeyDown(e, drive)}
              aria-label={`复制${drive.platform}网盘链接`}
              className={`inline-flex size-7 cursor-pointer select-none items-center justify-center rounded-lg shadow-sm transition hover:scale-105 active:scale-95 ${bg} ${fg}`}
            >
              <Download className="size-3.5" />
            </span>
            {/* hover 浮出平台名 */}
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
              {drive.platform}
            </span>
          </div>
        );
      })}
    </div>
  );
}
