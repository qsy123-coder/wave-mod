"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import type { Chapter, TutorialVersionMeta } from "../types";
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
          <div className="mt-1 flex items-center gap-2 text-2xl font-bold leading-6 text-black/70">
            <span>每节图文教程下方</span>
            <VideoHintBanner />
          </div>
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
