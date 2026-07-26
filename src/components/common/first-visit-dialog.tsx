"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";

const STORAGE_KEY = "wavemod-first-visit-dismissed";

export function FirstVisitDialog() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed !== "true") {
        setVisible(true);
      }
    } catch { /* ignore */ }
  }, []);

  if (!visible) return null;

  const handleDismissPermanent = () => {
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /* ignore */ }
    setVisible(false);
  };

  const handleGoTutorial = () => {
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch { /* ignore */ }
    setVisible(false);
    router.push("/guide");
  };

  const handleClose = () => {
    // Don't set localStorage — will show again next visit
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-md border-4 border-black p-6 shadow-[10px_10px_0px_0px_#000]"
        style={{ background: "var(--neo-panel)" }}
      >
        {/* Close button — top-right */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center border-[3px] border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          aria-label="关闭"
        >
          <X className="size-3.5" />
        </button>

        {/* Content */}
        <div className="mt-2 text-left">
          <p className="text-lg font-black leading-7 text-black">
            如果您是第一次使用游戏 MOD
          </p>
          <p className="mt-1 text-sm font-bold leading-6 text-black/70">
            请到教程页面查看详细安装步骤。点击导航栏的
            <span className="inline-block border-[2px] border-black bg-[var(--neo-secondary)] px-1.5 py-0 text-xs font-black">先看我</span>
            即可进入教程。
          </p>
        </div>

        {/* Buttons */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleDismissPermanent}
            className="inline-flex items-center gap-1.5 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            不再提示
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1.5 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            待会再看
          </button>
          <button
            type="button"
            onClick={handleGoTutorial}
            className="inline-flex items-center gap-1.5 border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            style={{ background: "var(--neo-accent)" }}
          >
            先去看教程
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
