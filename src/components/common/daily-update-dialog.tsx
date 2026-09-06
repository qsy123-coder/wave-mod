"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, X } from "lucide-react";

// 用与每日更新分组一致的时区计算"今天"（Asia/Shanghai），保证弹窗与页面判定同一语言
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 首页灯箱：每日更新通知，复用首访灯箱样式。
 * 每天最多弹一次（用含日期的 localStorage 键记录，当天关闭当天不再弹，次日重新弹）。
 */
export function DailyUpdateDialog() {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const key = `wavemod-daily-update-dismiss-${todayKey()}`;
    queueMicrotask(() => {
      try {
        if (localStorage.getItem(key) === "1") return;
      } catch {
        /* ignore */
      }
      // 拉取今日更新数量；仅当天确有新 mod 时才弹，避免打扰
      fetch("/api/updates?days=1")
        .then((r) => {
          if (!r.ok) throw new Error("fetch failed");
          return r.json();
        })
        .then((json) => {
          const todayCount = json?.days?.[0]?.mods?.length ?? 0;
          if (todayCount > 0) {
            setCount(todayCount);
            setVisible(true);
          }
        })
        .catch(() => {
          /* 拉取失败静默，不弹窗 */
        });
    });
  }, []);

  if (!visible) return null;

  const markDismissedToday = () => {
    try {
      localStorage.setItem(`wavemod-daily-update-dismiss-${todayKey()}`, "1");
    } catch {
      /* ignore */
    }
  };

  const handleGoUpdates = () => {
    markDismissedToday();
    setVisible(false);
    router.push("/updates");
  };

  const handleClose = () => {
    markDismissedToday();
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
            今日更新
            <span className="inline-block border-2 border-black bg-[var(--neo-accent)] px-1.5 py-0.5 text-xs font-black">
              +{count}
            </span>
          </p>
          <p className="mt-1 text-sm font-bold leading-6 text-black/70">
            今天上新了 {count} 个鸣潮 MOD，快来看看最新内容。
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1.5 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            今天先不看
          </button>
          <button
            type="button"
            onClick={handleGoUpdates}
            className="inline-flex items-center gap-1.5 border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            style={{ background: "var(--neo-accent)" }}
          >
            查看今日更新
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
