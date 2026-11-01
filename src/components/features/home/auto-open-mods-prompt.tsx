"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, X } from "lucide-react";

import { useSitePreferences } from "@/components/layout/site-preferences-provider";
import { markAutoSkipNotice } from "@/lib/preferences/site-preferences";

/**
 * 「直达角色分类」开启时，访问首页先**弹窗拦一下**。
 *
 * 以前这里是无条件 `location.replace("/mods")`（连首屏都不给看）：用户自己开的
 * 偏好，但发生时页面上没有任何解释，点首页却直接落到分类页，很容易被当成
 * 「首页打不开 / 出 bug 了」。现在改成弹窗拦截，给三个明确出口：
 *
 *   1. 前往分类页 —— 按偏好走，落地 `/mods` 后还会有一条说明条（可关闭该偏好）
 *   2. 关闭该偏好，留在首页 —— 当场反悔，以后不再打扰
 *   3. 右上角 × —— 只看这次留在首页，偏好保持不动
 *
 * 弹窗本身不做任何路由跳转，所以用户不选就什么都不会发生（这正是「拦截」）。
 */
export function AutoOpenModsPrompt() {
  const { autoOpenMods, setAutoOpenMods } = useSitePreferences();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  // autoOpenMods 要等 Provider 在 effect 里读完 localStorage 才会变 true，
  // 所以这里天然是「水合后弹出」，不会和静态 HTML 打架。
  if (!autoOpenMods || dismissed) return null;

  const goMods = () => {
    // 落地页要用这条标记弹说明条（那里有「关闭该偏好」的入口）
    markAutoSkipNotice();
    setDismissed(true);
    router.push("/mods");
  };

  const turnOffPreference = () => {
    setAutoOpenMods(false);
    setDismissed(true);
  };

  return (
    /* z-[210]：要盖在「每日更新」弹窗（z-[200]）之上 —— 两者都可能同屏出现，
       拦截框在后就看不见了，用户会以为点首页没反应 */
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
          onClick={() => setDismissed(true)}
          aria-label="关闭提示，留在首页"
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
