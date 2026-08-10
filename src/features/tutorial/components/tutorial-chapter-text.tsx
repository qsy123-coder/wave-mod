"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Download, ExternalLink, Pencil, Video } from "lucide-react";

import type { Chapter, CloudUrls } from "../types";

type TutorialChapterTextProps = {
  chapter: Chapter;
  // ── Admin edit props (omit for normal mode) ──
  editable?: boolean;
  onEditIntro?: () => void;
  onEditTools?: () => void;
  onUploadVideo?: (file: File) => Promise<void>;
  hasVideo?: boolean;
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

export function TutorialChapterText({
  chapter,
  editable = false,
  onEditIntro,
  onEditTools,
  onUploadVideo,
  hasVideo,
}: TutorialChapterTextProps) {
  const tools = chapter.tools ?? [];
  const optionalTools = tools.filter((t) => !t.required);

  // ── Video upload state ──
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = useCallback(
    async (file: File) => {
      if (!onUploadVideo) return;
      setUploadingVideo(true);
      try {
        await onUploadVideo(file);
      } finally {
        setUploadingVideo(false);
      }
    },
    [onUploadVideo],
  );

  if (tools.length === 0 && !editable) {
    return null;
  }

  const packUrl = "/api/tutorial/download";
  const cloudUrls = tools.find((t) => t.required && t.cloudUrls)?.cloudUrls;

  return (
    <div className="space-y-4">
      {/* Intro section */}
      {(chapter.intro || editable) && (
        <div
          className="relative border-4 border-black px-3 py-2 shadow-[6px_6px_0px_0px_#000]"
          style={{ background: "var(--neo-panel)" }}
        >
          {/* Admin edit buttons */}
          {editable && (
            <div className="absolute -right-1 -top-1 z-10 flex items-center gap-0.5 rounded border border-black/20 bg-white/90 p-0.5 shadow-sm backdrop-blur">
              {onEditIntro && (
                <button
                  type="button"
                  onClick={onEditIntro}
                  className="rounded p-0.5 text-black/50 hover:bg-[var(--neo-accent)] hover:text-black"
                  aria-label="编辑说明文字"
                  title="编辑说明文字"
                >
                  <Pencil className="size-3" />
                </button>
              )}
              {onEditTools && (
                <button
                  type="button"
                  onClick={onEditTools}
                  className="rounded p-0.5 text-black/50 hover:bg-[var(--neo-accent)] hover:text-black"
                  aria-label="编辑工具列表"
                  title="编辑工具列表"
                >
                  <Pencil className="size-3" />
                  <span className="ml-0.5 text-[9px] font-bold">工具</span>
                </button>
              )}
            </div>
          )}

          {/* Empty state for admin mode */}
          {editable && !chapter.intro && tools.length === 0 && (
            <div className="py-4 text-center">
              <p className="text-sm font-bold text-black/40">
                点击上方编辑按钮添加说明文字和工具下载条目
              </p>
            </div>
          )}

          {chapter.intro && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div>
                  <ol
                    className="mt-2 space-y-1 text-sm font-bold leading-7 text-black/80"
                    style={{ listStyle: "decimal", paddingLeft: "1.5em" }}
                  >
                    <li className="pl-0.5">
                      <p
                        className="mr-2 inline-block border-[3px] border-black px-1.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[2px_2px_0px_0px_#000]"
                        style={{ background: "var(--neo-accent)" }}
                      >
                        必需下载
                      </p>
                      JASM mod 管理器、XXMI 启动器和鸣潮 mod 修复工具为必须下载的工具，这三个工具点击右侧的
                      <span
                        className="inline-block border-[2px] border-black px-1.5 py-0 text-xs font-black"
                        style={{ background: "var(--neo-accent)" }}
                      >
                        下载工具包
                      </span>
                      即可全部下载。
                    </li>
                    <li className="pl-0.5">
                      如果点击右侧的
                      <span
                        className="inline-block border-[2px] border-black px-1.5 py-0 text-xs font-black"
                        style={{ background: "var(--neo-accent)" }}
                      >
                        下载工具包
                      </span>后下载较慢
                      ，可开启梯子加速。
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

              {/* Optional tools — compact inline links */}
              {optionalTools.length > 0 && (
                <div className="mt-2 border-t-[3px] border-black pt-2">
                  <p className="text-[14px] font-bold leading-6 text-black">
                    <span className="ml-1.5">3.</span>
                    <span
                      className="mr-1 inline-block border-[2px] border-black px-1.5 py-0 text-xs font-black"
                      style={{ background: "var(--neo-accent)" }}
                    >
                      可选{" "}
                    </span>
                    如果你已有压缩工具则按需下载。教程里用到的是 360 压缩：
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {optionalTools.map((tool) =>
                      tool.url !== "#" ? (
                        <a
                          key={tool.name}
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 border-[2px] border-black bg-white px-2.5 py-1 text-xs font-bold text-black transition hover:bg-[var(--neo-secondary)]"
                        >
                          <ExternalLink className="size-3" />
                          {tool.name}
                        </a>
                      ) : null,
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Video upload section — only in admin mode */}
          {editable && onUploadVideo && (
            <div className="mt-3 border-t-[3px] border-black pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 border-[3px] border-black bg-white px-4 py-2 text-sm font-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-[var(--neo-secondary)]">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/x-matroska,video/quicktime"
                    className="hidden"
                    disabled={uploadingVideo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleVideoUpload(file);
                        e.target.value = "";
                      }
                    }}
                  />
                  {uploadingVideo ? (
                    <>
                      <div className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                      <span>上传中...</span>
                    </>
                  ) : (
                    <>
                      <Video className="size-4" />
                      <span>上传视频</span>
                    </>
                  )}
                </label>
                {hasVideo && (
                  <span className="text-xs font-bold text-green-600">已有视频（重新上传会覆盖）</span>
                )}
                {!hasVideo && !uploadingVideo && (
                  <span className="text-xs font-bold text-black/40">上传章节视频教程（MP4/WebM）</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
