import type { Metadata } from "next";
import { ShieldCheck, Sparkles } from "lucide-react";

import { GachaWorkbench } from "@/features/gacha/components/gacha-workbench";

export const metadata: Metadata = {
  title: "唤取分析 — 鸣潮抽卡记录统计",
  description:
    "粘贴鸣潮官方唤取记录链接，查看每个卡池的当前垫抽、五星抽数分布、UP 不歪率与角色/专武获取成本。数据不落库，分析完即弃。",
  alternates: { canonical: "/gacha" },
};

export default function GachaPage() {
  return (
    <div className="py-6 lg:py-8">
      <section
        className="border-4 border-b-0 border-black px-4 py-3 shadow-[6px_6px_0px_0px_#000]"
        style={{ background: "var(--neo-panel)" }}
      >
        <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-black/55">
          <Sparkles className="size-3.5" />
          Wuthering Waves · Convene Analytics
        </p>
        <h1 className="mt-1 text-2xl font-black text-black">唤取分析</h1>
        <p className="mt-1 max-w-3xl text-xs font-bold leading-relaxed text-black/55">
          粘贴官方唤取记录链接，立刻看到 13 类卡池各自垫了多少抽、五星出在哪里、
          UP 歪了几次，以及单个角色/专武的获取成本。
        </p>
      </section>

      <div className="border-4 border-black bg-[var(--neo-dark)] p-4 shadow-[6px_6px_0px_0px_#000] sm:p-5">
        <GachaWorkbench />

        <footer className="mt-6 border-t-2 border-black/15 pt-3 text-[11px] font-semibold leading-relaxed text-white/55">
          <p className="inline-flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>
              唤取链接包含一次性凭证，仅用于本次分析。本站不保存 UID、抽卡记录或链接，
              分享图也在你的浏览器里生成。官方接口非公开，若游戏更新导致不可用，请稍后重试。
            </span>
          </p>
          <p className="mt-2 text-white/40">
            统计口径移植自开源项目 juliy819/wuwa-gacha-tool（Apache-2.0）；本站与游戏官方无关。
          </p>
        </footer>
      </div>
    </div>
  );
}
