"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Download, ExternalLink } from "lucide-react";

import type { Chapter, CloudUrls } from "../types";

type TutorialChapterTextProps = {
  chapter: Chapter;
};

const CLOUD_LABELS: Record<keyof NonNullable<CloudUrls>, string> = {
  baidu: "百度网盘",
  quark: "夸克网盘",
};

function CloudDriveDropdown({ urls }: { urls: NonNullable<CloudUrls> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClose = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClose);
    return () => document.removeEventListener("mousedown", onClose);
  }, [open]);

  const entries = Object.entries(urls).filter(
    ([, url]) => url && url !== "#",
  ) as [keyof NonNullable<CloudUrls>, string][];

  if (entries.length === 0) {
    return (
      <span className="neo-sticker inline-flex shrink-0 items-center gap-1.5 bg-black/10 px-3 py-1.5 text-[10px] font-bold text-black/50">
        网盘待补充
      </span>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="neo-button-outline inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em]"
      >
        网盘下载
        <ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] border-4 border-black bg-white shadow-[4px_4px_0px_0px_#000]">
          {entries.map(([key, url]) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 text-xs font-bold text-black transition hover:bg-[var(--neo-secondary)]"
            >
              {CLOUD_LABELS[key]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function TutorialChapterText({ chapter }: TutorialChapterTextProps) {
  const tools = chapter.tools ?? [];

  if (tools.length === 0) {
    return null;
  }

  const packUrl = "/api/tutorial/download";
  const cloudUrls = tools.find((t) => t.required && t.cloudUrls)?.cloudUrls;

  return (
    <div className="space-y-4">
      {/* Intro section */}
      {chapter.intro && (
        <div
          className="border-4 border-black px-3 py-2 shadow-[6px_6px_0px_0px_#000]"
          style={{ background: "var(--neo-panel)" }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div>
              <p className="inline-block border-[3px] border-black px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[2px_2px_0px_0px_#000]" style={{ background: "var(--neo-accent)" }}>
                必需下载
              </p>
              <ol className="mt-2 space-y-1 text-sm font-bold leading-7 text-black/80" style={{ listStyle: "decimal", paddingLeft: "1.5em" }}>
                <li className="pl-0.5">
                  以下的 JASM mod 管理器、XXMI 启动器和鸣潮 mod 修复工具为必须下载的工具，三个工具已打包在同一个压缩包内。
                </li>
                <li className="pl-0.5">
                  点击右侧
                  <span className="inline-block border-[2px] border-black px-1.5 py-0 text-xs font-black" style={{ background: "var(--neo-accent)" }}>下载工具包</span>
                  即可一次性下载全部，无需分别下载下方工具。如果直链下载较慢可开启梯子加速。
                </li>
              </ol>
            </div>
            {/* Download buttons */}
            <div className="flex shrink-0 items-center gap-2">
              {packUrl && (
                <a
                  href={packUrl}
                  download="教程.zip"
                  className="inline-flex items-center gap-1.5 border-4 border-black px-3 py-2 font-black uppercase tracking-[0.1em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  style={{ background: "var(--neo-accent)" }}
                >
                  <Download className="size-3.5" />
                  <span className="text-xs">下载工具包</span>
                </a>
              )}
              {cloudUrls && <CloudDriveDropdown urls={cloudUrls} />}
            </div>
          </div>

          <div className="mt-2 border-t-[3px] border-black pt-2">
            <p className="text-xs font-bold leading-6 text-black/60">
              <span className="mr-1 font-black">3.</span>
              如果你已有压缩工具，压缩工具按需下载即可。教程里用到的压缩工具为 360 压缩。
            </p>
          </div>
        </div>
      )}

      {/* Tool list — 2 columns */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {tools.map((tool, index) => {
          const isRequired = tool.required;
          const bg = ["var(--neo-accent)", "var(--neo-secondary)", "var(--neo-muted)"][index % 3];

          return (
            <div
              key={tool.name}
              className="flex items-center justify-between gap-3 border-4 border-black p-4 shadow-[6px_6px_0px_0px_#000]"
              style={{ background: bg }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="shrink-0 border-[3px] border-black px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0px_0px_#000]"
                  style={{
                    background: isRequired ? "var(--neo-accent)" : "#fff",
                    color: isRequired ? "#000" : "var(--neo-ink)",
                  }}
                >
                  {isRequired ? "必需" : "可选"}
                </span>
                <div>
                  <p className="text-lg font-black text-black">{tool.name}</p>
                  {tool.description && (
                    <p className="mt-1 text-sm font-bold leading-6 text-black/70">
                      {tool.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Optional tools: official site link only */}
              {!isRequired && tool.url !== "#" && (
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neo-button-outline inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-black no-underline transition hover:-translate-y-0.5"
                >
                  <ExternalLink className="size-3.5" />
                  官网
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
