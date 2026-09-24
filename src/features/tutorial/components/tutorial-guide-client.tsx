"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import type { Chapter, TutorialVersionMeta, VideoConfig } from "../types";
import { ToolDownloadCard } from "./tool-download-card";
import { TutorialCompanionVideo } from "./tutorial-companion-video";
import { TutorialTabs } from "./tutorial-tabs";
import { TutorialVersionSwitcher } from "./tutorial-version-switcher";
import { VideoHintBanner } from "./video-hint-banner";

type TutorialGuideClientProps = {
  /** 版本元数据（含每个版本的 published 内容已由 server 解析） */
  versions: TutorialVersionMeta[];
  activeVersionId: string;
  title: string;
  subtitle: string;
  imageBasePath: string;
  chapters: Chapter[];
  /** 整篇教程的配套视频；该版本没有时不传，卡片与 hero 里的提示都不渲染 */
  video?: VideoConfig;
};

const MEMORY_KEY = "wavemod-tutorial-version";

/**
 * 前台「先看我」编排组件。
 * - 版本切换用 URL ?v=<key> 驱动，SSR 友好、可分享。
 * - 首次访问（URL 无 ?v）读取 localStorage 记忆；无记忆则用 server 解析的默认版本。
 * - 切换版本时由父级按新 key 重新加载章节（本组件仅做展示 + 记忆写入）。
 */
export function TutorialGuideClient({
  versions,
  activeVersionId,
  title,
  subtitle,
  imageBasePath,
  chapters,
  video,
}: TutorialGuideClientProps) {
  const router = useRouter();

  // 挂载时校正版本：若 URL 无显式选择，且记忆版本存在且仍可见，则跳到记忆版本
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("v")) return; // 显式选择优先

    try {
      const saved = window.localStorage.getItem(MEMORY_KEY);
      if (saved && versions.some((v) => v.id === saved) && saved !== activeVersionId) {
        router.replace(`/guide?v=${encodeURIComponent(saved)}`);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(
    (versionId: string) => {
      try {
        window.localStorage.setItem(MEMORY_KEY, versionId);
      } catch {
        /* ignore */
      }
      if (versionId !== activeVersionId) {
        router.push(`/guide?v=${encodeURIComponent(versionId)}`);
      }
    },
    [activeVersionId, router],
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4 py-4 lg:py-6">
      {/* Hero header — compact */}
      <MotionReveal delay={0.04} rotate={-1}>
        <section
          className="inline-block border-4 border-black px-4 py-2.5 shadow-[6px_6px_0px_0px_#000]"
          style={{ background: "var(--neo-secondary)" }}
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-black/60">{subtitle}</p>
          <h1 className="mt-1 text-2xl font-black text-black">{title}</h1>
          {/* 提示只在真的存在配套视频时渲染。原来的文案是「每节图文教程下方 均有对应视频教程」，
              而页面上当时一个视频入口都没有 —— 指向不存在的东西，等于在教用户怀疑这个页面。
              v 版本的章节视频至今仍全是 NULL，所以这里的真实卖点就是下面那张配套视频卡片。 */}
          {video ? (
            <div className="mt-1 flex items-center gap-2 text-2xl font-bold leading-6 text-black/70">
              <span>看不懂图文？</span>
              <VideoHintBanner label="先看配套视频" />
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2 text-sm font-bold text-black/60">
            <span>遇到无法解决的问题？</span>
            <Link
              href="/troubleshooting"
              className="inline-flex items-center gap-1 border-[2px] border-black px-2 py-0.5 text-xs font-black text-black transition hover:bg-[var(--neo-accent)]"
            >
              查看问题解答 <ArrowRight className="size-3" />
            </Link>
          </div>
        </section>
      </MotionReveal>

      {/* 图文教程配套视频 — 整篇一个，与章节无关，常驻顶部。
          key 用 activeVersionId：换版本时组件重挂载，弹层状态（open）跟着归零，
          免得在 A 版本的视频上弹层没关就切到 B 版本。 */}
      {video ? (
        // shrink-0：外层是定高 flex 列，卡片里的封面是固定高度；不锁住的话高度不够时
        // 这一条会被压扁（内容溢出边框），该被压缩的是下面 min-h-0 的章节区。
        <MotionReveal delay={0.05} y={12} className="shrink-0">
          <TutorialCompanionVideo
            key={activeVersionId}
            video={video}
            versionId={activeVersionId}
            chapterCount={chapters.length}
          />
        </MotionReveal>
      ) : null}

      {/* 必要工具下载（复制网盘链接，不跳转）— 与当前章节无关，常驻顶部。
          z-40 不能省：卡片里的下拉（z-50）被关在卡片自己的层叠上下文里，
          能拿出去跟外面对比的只有这一层；下面的章节 Tab 条（tutorial-nav）必须
          低于它，否则整条不透明吸顶条会盖住下拉 —— 见那边的注释。 */}
      <MotionReveal delay={0.06} y={16} className="relative z-40">
        <ToolDownloadCard />
      </MotionReveal>

      {/* Version switcher row */}
      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[var(--neo-panel)] px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] text-black">
            <BookOpen className="size-3.5" />
            教程版本
          </span>
          <TutorialVersionSwitcher
            versions={versions}
            activeVersionId={activeVersionId}
            onChange={handleChange}
          />
        </div>
      )}

      {/* Tab-based chapter navigation + content */}
      <MotionReveal delay={0.08} y={24} className="flex min-h-0 flex-1 flex-col">
        <TutorialTabs
          key={activeVersionId}
          chapters={chapters}
          imageBasePath={imageBasePath}
        />
      </MotionReveal>
    </div>
  );
}
