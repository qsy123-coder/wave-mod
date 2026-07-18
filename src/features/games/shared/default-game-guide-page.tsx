import { Sparkles, Star, Wrench } from "lucide-react";

import type { GameConfig } from "@/config/games";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Card, CardContent } from "@/components/ui/card";
import { xxmiInstallGuide } from "@/lib/constants/install-guide";

export function DefaultGameGuidePage({ game }: { game: GameConfig }) {
  return (
    <div className="flex flex-col gap-8 py-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: game.theme.accent }}>
          <p className="neo-label text-black/60">{game.name} 安装教程</p>
          <h1 className="mt-2 text-4xl font-black text-black">XXMI Launcher 安装教程</h1>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-black/75">当前先复用鸣潮 XXMI 指引。后续如果 {game.name} 需要独立安装器、目录结构或教程页设计稿，可以单独替换。</p>
        </section>
      </MotionReveal>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <MotionReveal delay={0.1} y={24} rotate={1}>
          <Card className="neo-card-lg bg-[var(--neo-panel)] p-2">
            <CardContent className="space-y-4 p-4 text-black sm:p-6">
              {xxmiInstallGuide.map((item, index) => (
                <div key={item} className="border-4 border-black p-4 shadow-[6px_6px_0px_0px_#000]" style={{ background: index % 3 === 0 ? "var(--neo-accent)" : index % 3 === 1 ? "var(--neo-secondary)" : "var(--neo-muted)" }}>
                  <p className="text-lg font-black uppercase tracking-[0.12em]">Step {index + 1}</p>
                  <p className="mt-2 text-sm font-bold leading-7 text-black/80">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </MotionReveal>

        <div className="space-y-5">
          <MotionReveal delay={0.14} y={24} rotate={-1}>
            <Card className="neo-card-lg p-6" style={{ background: game.theme.primary }}>
              <CardContent className="space-y-4 p-0 text-black">
                <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 shadow-[6px_6px_0px_0px_#000]">
                  <Sparkles className="size-4" />
                  <span className="text-sm font-black uppercase tracking-[0.14em]">一键复制指引</span>
                </div>
                <p className="text-sm font-bold leading-7 text-black/80">后续这里会按 {game.name} 的独立设计稿补充一键复制、常见错误排查与目录路径提示。</p>
              </CardContent>
            </Card>
          </MotionReveal>

          <MotionReveal delay={0.18} y={24} rotate={1}>
            <Card className="neo-card-lg p-6" style={{ background: game.theme.muted }}>
              <CardContent className="space-y-4 p-0 text-black">
                <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 shadow-[6px_6px_0px_0px_#000]">
                  <Wrench className="size-4" />
                  <span className="text-sm font-black uppercase tracking-[0.14em]">常见问题</span>
                </div>
                <ul className="space-y-3 text-sm font-bold leading-7 text-black/80">
                  <li>• 游戏版本更新后，旧 MOD 可能失效。</li>
                  <li>• 目录路径错误是最常见安装失败原因。</li>
                  <li>• 先看适配版本，再下载对应 ZIP 包。</li>
                </ul>
              </CardContent>
            </Card>
          </MotionReveal>

          <MotionReveal delay={0.22} y={24} rotate={-1}>
            <Card className="neo-card-lg p-6" style={{ background: "var(--neo-surface)" }}>
              <CardContent className="space-y-3 p-0 text-black">
                <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]"><Star className="size-4" />提示</p>
                <p className="text-sm font-bold leading-7 text-black/80">教程页目前是通用 fallback。后续每个游戏可以拥有完全独立的教程页面。</p>
              </CardContent>
            </Card>
          </MotionReveal>
        </div>
      </div>
    </div>
  );
}
