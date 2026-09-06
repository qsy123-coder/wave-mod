"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type DailyTickerProps = {
  /** 最近 3 天内更新过 mod 的角色名（去重） */
  characters: string[];
};

/**
 * 首页导航栏上方的一条置顶通知条（作为 sticky header 的第一行，嵌在 header 盒内，
 * 因此永远不会被导航栏遮挡）。
 * - 横向无缝滚动展示最近更新过的角色名（从右进、往左出）。
 * - `hidden md:flex`：移动端隐藏，避免挤压头部。
 * - 关闭为内存态：本次访问不再显示，刷新/下次进入重新弹出。
 * - 附「查看每日更新」链接跳转到 /updates。
 *
 * 无缝循环要点：`-50%` 平移要求单段宽度 ≥ 滚动视口宽度，否则切回时右侧露白。
 * 角色名太少时按下述逻辑动态把列表重复若干遍，保证"一段"铺满滚动区。
 */
export function DailyTicker({ characters }: DailyTickerProps) {
  const [visible, setVisible] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  // 单段（一组）所需的"单遍列表"重复次数；先给个保守值，挂载后按实测修正
  const [repeat, setRepeat] = useState(3);

  // 让"一段"宽度 ≥ 滚动视口宽度：度量单遍宽度，算出重复次数（+1 缓冲），保证无缝铺满
  useEffect(() => {
    const vp = viewportRef.current;
    const probe = probeRef.current;
    if (!vp || !probe) return;
    const measure = () => {
      const vw = vp.clientWidth;
      const single = probe.getBoundingClientRect().width;
      if (single > 0) setRepeat(Math.max(2, Math.ceil(vw / single) + 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    // 字体加载后宽度会变化，再量一次
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [characters]);

  if (!visible || characters.length === 0) return null;

  const renderChars = () =>
    characters.map((c) => (
      <span key={c} className="inline-flex items-center">
        <span className="mx-2.5 inline-block size-1.5 shrink-0 rounded-full bg-[var(--neo-accent)]" />
        <span className="whitespace-nowrap">{c}</span>
      </span>
    ));

  // "一段"= 单遍列表重复 repeat 次；复制成两组，用 -50% 平移做无缝循环
  const segment = (
    <span className="inline-flex items-center" aria-hidden>
      {Array.from({ length: repeat }).map((_, i) => (
        <span key={i} className="inline-flex items-center">
          {renderChars()}
        </span>
      ))}
    </span>
  );

  return (
    <div className="hidden min-h-[30px] items-center gap-2 bg-black/95 px-4 text-[11px] font-bold text-white md:flex sm:px-6 lg:px-8">
      {/* 左侧标签 */}
      <div className="flex shrink-0 items-center gap-1.5 border-r-2 border-white/20 pr-3">
        <Sparkles className="size-3 text-[var(--neo-accent)]" />
        <span className="ticker-shimmer whitespace-nowrap font-black uppercase tracking-[0.16em]">
          近期更新的 MOD
        </span>
      </div>

      {/* 横向滚动动画区 */}
      <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-hidden">
        <div className="ticker-track flex w-max items-center whitespace-nowrap">
          {segment}
          {segment}
        </div>
        {/* 度量"单遍列表"宽度（视觉隐藏，不参与布局） */}
        <span
          ref={probeRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-[9999px] inline-flex items-center whitespace-nowrap opacity-0"
        >
          {renderChars()}
        </span>
      </div>

      {/* 查看每日更新链接 */}
      <Link
        href="/updates"
        className="shrink-0 border-2 border-[var(--neo-accent)] bg-[var(--neo-accent)] px-1.5 py-0.5 font-black uppercase tracking-[0.12em] text-black transition hover:border-black hover:bg-white"
      >
        查看每日更新 →
      </Link>

      {/* 关闭：本次访问不再显示，下次进入重新弹出 */}
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="关闭近期上新通知"
        className="inline-flex size-5 shrink-0 items-center justify-center border-2 border-white bg-black text-white transition hover:bg-white hover:text-black"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
