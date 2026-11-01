"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Sparkles, X } from "lucide-react";

import { useSitePreferences } from "@/components/layout/site-preferences-provider";
import { AUTO_OPEN_MODS_BLOCK_EVENT, markAutoSkipNotice } from "@/lib/preferences/site-preferences";

/**
 * 「直达角色分类」开启时的拦截弹窗。
 *
 * 两个触发点：
 *   1. 直接落到首页（`/`）—— 以前这里会静默 `location.replace("/mods")`；
 *   2. 在任意页面点导航栏的「首页 / Logo」—— 链接处 preventDefault 并派发
 *      `AUTO_OPEN_MODS_BLOCK_EVENT`，由本组件弹出（这样**根本不会跳过去**）。
 *
 * 三个出口：
 *   - 前往分类页：按偏好走，落地 `/mods` 后顶部还有一条说明条（可关闭该偏好）
 *   - 关闭该偏好，留在首页：当场反悔，以后不再打扰
 *   - 右上角 ×：只看这次，偏好保持不动
 *
 * 挂在根布局（ClientProviders）而不是首页 layout：要在任何页面都能拦住「点首页」。
 */
export function AutoOpenModsPrompt() {
  const { autoOpenMods, setAutoOpenMods } = useSitePreferences();
  const router = useRouter();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const [blockedAttempt, setBlockedAttempt] = useState(false);

  // 导航栏点了首页 → 拦下来在当前位置弹框
  useEffect(() => {
    const onBlocked = () => {
      setDismissed(false);
      setBlockedAttempt(true);
    };
    window.addEventListener(AUTO_OPEN_MODS_BLOCK_EVENT, onBlocked);
    return () => window.removeEventListener(AUTO_OPEN_MODS_BLOCK_EVENT, onBlocked);
  }, []);

  // 每次换页重新允许提示：用户关掉后去别处逛，再想「回首页」时还得再拦一次
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 路由变化来自外部系统（Next Router）
    setDismissed(false);
  }, [pathname]);

  const open = autoOpenMods && !dismissed && (pathname === "/" || blockedAttempt);
  if (!open) return null;

  const close = () => setDismissed(true);

  const goMods = () => {
    // 落地页要用这条标记弹说明条（那里有「关闭该偏好」的入口）
    markAutoSkipNotice();
    close();
    if (pathname !== "/mods") router.push("/mods");
  };

  const turnOffPreference = () => {
    setAutoOpenMods(false);
    close();
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-open-mods-title"
        className="relative w-full max-w-md border-4 border-black p-6 shadow-[10px_10px_0px_0px_#000]"
        style={{ background: "var(--neo-panel)" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="关闭提示"
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center border-[3px] border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <X className="size-3.5" />
        </button>

        <div className="mt-2 text-left">
          <p
            id="auto-open-mods-title"
            className="inline-flex items-center gap-2 text-lg font-black leading-7 text-black"
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            已开启「直达角色分类」
          </p>
          <p className="mt-1 text-sm font-bold leading-6 text-black/70">
            你开启了直达分类，访问首页会先去角色分类页。要现在过去，还是关掉这个偏好？
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={turnOffPreference}
            className="inline-flex items-center gap-1.5 border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            关闭该偏好，留在首页
          </button>
          <button
            type="button"
            onClick={goMods}
            className="inline-flex items-center gap-1.5 border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            style={{ background: "var(--neo-accent)" }}
          >
            前往分类页
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
