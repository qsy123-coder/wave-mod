"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Eye } from "lucide-react";

import type { GamebananaVisibility } from "@/lib/gamebanana-domain/types";

type GamebananaVisibilityGateProps = {
  visibility: GamebananaVisibility;
  children: ReactNode;
};

/**
 * 详情页的内容分级闸门。
 *
 * - `show` —— 直接放行，不加任何提示。
 * - `warn` —— 内容照常显示，但上方挂一条提示条（「平台标记为需要注意的内容」）。
 * - `hide` —— **先拦住**，用户点一下才显示（默认不渲染 children）。
 *
 * 平台分级（`_sInitialVisibility`）是这里唯一的依据，不自己按关键词猜
 * （理由与取值分布见 `scripts/sync-gamebanana.mjs` 的 `normalizeVisibility`）。
 *
 * ⚠️ **这是一个体验闸门，不是权限边界。** `hide` 的正文（图片 URL、下载地址）
 * 仍然在这份页面的 RSC 负载里 —— 它由服务端在渲染前就决定了，客户端只能决定
 * 「要不要把已经拿到的数据画出来」。要做成真正的访问控制，得让服务端在拿到用户
 * 的确认之前不下发内容，而那会引入 cookie/动态渲染、把这一页从静态预渲染变成
 * 每请求渲染（本站刚因为动态渲染把 Vercel 额度打穿过一次，见
 * memory: vercel-quota-paused-root-cause）。所以这里刻意选了前者：
 * 默认列表不放出 hide 的内容（那才是绝大多数人看到的入口），详情页再挡一道点击。
 */
export function GamebananaVisibilityGate({ visibility, children }: GamebananaVisibilityGateProps) {
  const [revealed, setRevealed] = useState(false);

  if (visibility === "show") return <>{children}</>;

  if (visibility === "warn") {
    return (
      <>
        <div className="flex items-start gap-2 border-4 border-black bg-[#ffd84f] px-4 py-3 text-xs font-bold text-black shadow-[4px_4px_0px_0px_#000]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            平台把这件作品标记为<strong>需要注意的内容</strong>（可能含暴露服装或成人向题材）。
            内容照常显示，请自行判断是否适合当前场合。
          </p>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="border-4 border-black bg-[#fff8ef] p-6 shadow-[6px_6px_0px_0px_#000]">
      <div className="border-4 border-black bg-white px-5 py-6 shadow-[8px_8px_0px_0px_#000]">
        <p className="neo-label flex items-center gap-2 text-black/60">
          <AlertTriangle className="size-4" />
          成人内容
        </p>
        <h2 className="mt-2 text-2xl font-black">这件作品被平台标记为成人向内容。</h2>
        <p className="mt-3 text-sm font-bold leading-7 text-black/75">
          预览图与下载入口已默认隐藏。确认你在可浏览此类内容的场合后，可点击下方按钮显示。
        </p>
        {revealed ? null : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="neo-button-primary mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-[0.14em]"
          >
            <Eye className="size-4" />
            我已知晓，显示内容
          </button>
        )}
      </div>
      {revealed ? <div className="mt-5 space-y-5">{children}</div> : null}
    </div>
  );
}
