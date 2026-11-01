"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

import { useSitePreferences } from "@/components/layout/site-preferences-provider";
import { consumeAutoSkipNotice } from "@/lib/preferences/site-preferences";

/**
 * 「直达角色分类」把用户从首页弹到 `/mods` 之后的一次性提示。
 *
 * 为什么需要：这个跳转是**用户自己开的偏好**，但发生时页面上没有任何解释，
 * 点首页却看到分类页，很容易被当成「首页打不开 / 出 bug 了」。跳转前
 * （内联脚本与 HomeAutoRedirect）会在 sessionStorage 留一个标记，落地这里弹一条
 * 说明，并给一个「关闭该偏好」的按钮 —— 用户当场就能反悔，不用去账户菜单里找。
 *
 * 渲染位置：`(site)/mods/layout.tsx` 的 ModsShell 顶部，位于网格行之上。
 * 没有标记时返回 null，不占任何高度。
 *
 * 首帧一律不渲染（标记只在 useEffect 里读）：SSR 拿不到 sessionStorage，
 * 直接按标记渲染会触发 hydration mismatch。
 */
export function AutoOpenModsNotice() {
  const { setAutoOpenMods } = useSitePreferences();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // consume：取走即清，用户点刷新不会再看一遍同一次跳转的提示
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 标记只存在于 sessionStorage（外部系统），水合后才能读
    if (consumeAutoSkipNotice()) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => setVisible(false);

  return (
    <div
      role="status"
      className="mt-3 mb-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-4 border-black bg-[var(--neo-secondary)] px-3 py-2 text-[11px] font-black text-black shadow-[4px_4px_0px_0px_#000] sm:text-xs"
    >
      <Sparkles className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        已按「直达角色分类」偏好跳过首页，直接到分类页。
      </span>
      <button
        type="button"
        onClick={() => {
          setAutoOpenMods(false);
          dismiss();
        }}
        className="border-2 border-black bg-white px-2 py-0.5 font-black transition hover:bg-[var(--neo-accent)] active:translate-x-[1px] active:translate-y-[1px]"
      >
        关闭该偏好
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="关闭提示"
        className="ml-auto inline-flex size-5 shrink-0 items-center justify-center border-2 border-black bg-black text-white transition hover:bg-white hover:text-black"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
