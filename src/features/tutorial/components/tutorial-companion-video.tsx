"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";

import type { VideoConfig } from "../types";
import { TutorialVideoLightbox } from "./tutorial-video-lightbox";

type TutorialCompanionVideoProps = {
  video: VideoConfig;
  /** 当前教程版本 key：只用于隔离播放进度（不同版本的配套视频进度不互通） */
  versionId: string;
  /** 当前版本的章节数，用于「与下面 N 节图文教程一一对应」这句话 */
  chapterCount: number;
};

/**
 * 图文教程页顶部的「配套视频」卡片 —— 整篇教程的演示录屏（不是某一章的章节视频）。
 *
 * 「加载得快」的落点（页面上**不为此下载一个视频字节**）：
 * 1. 卡片里只有封面图（≈51KB 的 webp，SSR 出来即 `loading="eager"`，水合前就开始下载）；
 * 2. `<video>` 只在点击后由 lightbox 挂载，没点过就不会请求 mp4；
 * 3. COS 上该对象带 `Cache-Control: max-age=31536000` 且键名带版本号，
 *    所以重复访问是 0 字节；视频本身 moov 前置，起播不必等整个文件。
 *
 * 为什么外壳是 `<a href={mp4}>` 而不是 `<button>`：
 * 页面是预渲染 + 水合后才有点击逻辑，弱网下水合可能晚上十几秒（见 /mods 卡片那次事故）。
 * 用真链接兜底，水合前的点击会直接把 mp4 交给浏览器原生播放器（新标签页），
 * 而不是「点了没反应」；水合之后才 preventDefault 改成弹层播放。
 */
export function TutorialCompanionVideo({
  video,
  versionId,
  chapterCount,
}: TutorialCompanionVideoProps) {
  const [open, setOpen] = useState(false);

  // 与章节视频的进度分开存（use-video-progress 的 key 是 wavemod-video-{chapterId}），
  // 否则看到一半的章节进度会被这段全流程视频覆盖。
  const chapterId = `companion-${versionId}`;

  // 章节数为 0 = 这个版本没有图文（图文已下架、只留视频）。此时「与下面 0 节图文教程
  // 一一对应」是句错话，卡片标题也不该再叫「图文教程配套视频」。
  const hasChapters = chapterCount > 0;
  const title = hasChapters ? "图文教程配套视频" : "启动器更新后·完整流程";
  const badge = hasChapters ? "配套视频" : "视频教程";
  const description = hasChapters
    ? `整篇流程演示，与下面 ${chapterCount} 节图文教程一一对应 —— 只看图文卡住了，就先看这个。`
    : "启动器更新后的完整流程演示，跟着走一遍就能装好。";

  return (
    <>
      <section
        className="border-4 border-black p-2.5 shadow-[6px_6px_0px_0px_#000]"
        style={{ background: "var(--neo-panel)" }}
      >
        <a
          href={video.src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`播放${title}（新标签页打开）`}
          onClick={(e) => {
            // 修饰键 / 中键点击交给浏览器默认行为（新标签页打开 mp4），不要在弹层里吞掉
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            setOpen(true);
          }}
          className="group flex items-center gap-3"
        >
          <span className="relative block h-[96px] w-[160px] shrink-0 overflow-hidden border-[3px] border-black bg-black">
            {video.poster ? (
              <Image
                src={video.poster}
                alt={`${title}封面`}
                width={160}
                height={96}
                loading="eager"
                className="size-full object-cover"
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center">
              <span
                className="inline-flex size-11 items-center justify-center rounded-full border-[3px] border-black shadow-[3px_3px_0px_0px_#000] transition group-hover:scale-105 group-active:translate-x-[2px] group-active:translate-y-[2px] group-active:shadow-none"
                style={{ background: "var(--neo-accent)" }}
              >
                <Play className="ml-0.5 size-5 fill-black text-black" />
              </span>
            </span>
          </span>

          <span className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 border-[3px] border-black px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]"
              style={{ background: "var(--neo-secondary)" }}
            >
              <Play className="size-3 fill-black" />
              {badge}
            </span>
            <span className="mt-1 block text-base font-black leading-6 text-black">
              {title}
            </span>
            <span className="block text-xs font-bold leading-5 text-black/60">
              {description}
            </span>
          </span>
        </a>
      </section>

      {open ? (
        <TutorialVideoLightbox
          video={video}
          chapterId={chapterId}
          chapterTitle={title}
          badgeLabel={badge}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
