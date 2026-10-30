"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, X } from "lucide-react";

/** `/api/updates?summary=1` 回的那一天（日期键与文案都由服务端按上海时区算好） */
type LatestUpdateDay = {
  date: string;
  isToday: boolean;
  /** 今天 / 昨天 / M月D日 */
  shortLabel: string;
  /** YYYY年M月D日（今天/昨天） */
  fullLabel: string;
  count: number;
};

/** 关闭状态按「那一天的日期」记，而不是按浏览器里的今天 */
function dismissKey(date: string) {
  return `wavemod-daily-update-dismiss-${date}`;
}

/**
 * 首页灯箱：每日更新通知，复用首访灯箱样式。
 *
 * 弹的是**最近一次有更新的那天**，不限于今天 —— 2026-10-30 用户要求
 * 「最近一次有更新的那天也要弹」：上传常常在深夜，第二天进站时「只看今天」的结果是
 * 0 条，弹窗就永远不会出现，等于今天这批没提示。
 *
 * 去重键按那一天的日期：同一批内容只弹一次；只有出现**新的一天**才会重新提示
 * （同一天后来又补传了资源不重复弹）。点过「先不看」后当天不会再打扰。
 */
export function DailyUpdateDialog() {
  const [visible, setVisible] = useState(false);
  const [latest, setLatest] = useState<LatestUpdateDay | null>(null);
  const router = useRouter();

  useEffect(() => {
    queueMicrotask(() => {
      // summary=1：只要「最近一次有更新的那天」的计数与文案，不拉 14 天的全部 mod
      // （整份 payload 约 110KB，首页每次加载都付不起，见 route.ts 的说明）。
      fetch("/api/updates?days=14&summary=1")
        .then((r) => {
          if (!r.ok) throw new Error("fetch failed");
          return r.json();
        })
        .then((json) => {
          const day: LatestUpdateDay | null = json?.latest ?? null;
          if (!day || day.count <= 0) return;
          try {
            if (localStorage.getItem(dismissKey(day.date)) === "1") return;
            // 隐私模式下 localStorage 可能抛错：那是「读不到」，不是「已关闭」，照样弹
          } catch {
            /* ignore */
          }
          setLatest(day);
          setVisible(true);
        })
        .catch(() => {
          /* 拉取失败静默，不弹窗 */
        });
    });
  }, []);

  if (!visible || !latest) return null;

  const markDismissed = () => {
    try {
      localStorage.setItem(dismissKey(latest.date), "1");
    } catch {
      /* ignore */
    }
  };

  const handleGoUpdates = () => {
    markDismissed();
    setVisible(false);
    // 页面按天分组、每组有 `day-YYYY-MM-DD` 锚点，直接落到那一天
    router.push(`/updates#day-${latest.date}`);
  };

  const handleClose = () => {
    markDismissed();
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-md border-4 border-black p-6 shadow-[10px_10px_0px_0px_#000]"
        style={{ background: "var(--neo-panel)" }}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center border-[3px] border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          aria-label="关闭"
        >
          <X className="size-3.5" />
        </button>

        <div className="mt-2 text-left">
          <p className="inline-flex items-center gap-2 text-lg font-black leading-7 text-black">
            {latest.isToday ? "今日更新" : `${latest.shortLabel}更新`}
            <span className="inline-block border-2 border-black bg-[var(--neo-accent)] px-1.5 py-0.5 text-xs font-black">
              +{latest.count}
            </span>
          </p>
          <p className="mt-1 text-sm font-bold leading-6 text-black/70">
            {latest.isToday ? "今天" : latest.shortLabel}上新了 {latest.count} 个外观资源，快来看看最新内容。
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1.5 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            先不看
          </button>
          <button
            type="button"
            onClick={handleGoUpdates}
            className="inline-flex items-center gap-1.5 border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            style={{ background: "var(--neo-accent)" }}
          >
            查看更新
            <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/guide"
            className="inline-flex items-center gap-1 text-xs font-black text-black/55 underline underline-offset-4"
          >
            <BookOpen className="size-3.5" />
            首次使用？先看安装教程
          </Link>
        </div>
      </div>
    </div>
  );
}
