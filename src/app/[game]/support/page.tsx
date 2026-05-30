import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getGameBySlug } from "@/config/games";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Card, CardContent } from "@/components/ui/card";
import { Gift, HeartHandshake, Sparkles } from "lucide-react";
import { siteConfig } from "@/lib/constants/site";

type PageProps = {
  params: Promise<{ game: string }>;
};

async function GameSupportContent({ params }: PageProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: game.theme.accent }}>
          <p className="neo-label text-black/60">{game.name} 支持本站</p>
          <h1 className="mt-2 text-4xl font-black text-black">支持 {game.name} MOD 分站继续维护</h1>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-black/75">你的支持会优先用于该分站的封面整理、直链资源维护、角色分类和安装指引优化。</p>
        </section>
      </MotionReveal>

      <MotionReveal delay={0.1} y={22} rotate={1}>
        <Card className="neo-card-lg p-6" style={{ background: "var(--neo-panel)" }}>
          <CardContent className="grid gap-4 p-0 text-black md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 shadow-[6px_6px_0px_0px_#000]">
                <HeartHandshake className="size-4" />
                <span className="text-sm font-black uppercase tracking-[0.14em]">{game.shortName} 分站维护说明</span>
              </div>
              <p className="text-base font-bold leading-8 text-black/80">这个入口属于 {game.name} 分站，不会跳回鸣潮首页语境。后续可以接入独立赞助二维码、会员权益或创作者支持列表。</p>
            </div>
            <div className="border-4 border-black p-5 shadow-[6px_6px_0px_0px_#000]" style={{ background: game.theme.secondary }}>
              <p className="neo-label text-black/60">当前状态</p>
              <p className="mt-3 text-sm font-bold leading-7 text-black/80">赞助入口目前先保留占位，后面可以替换为真实链接、二维码或会员支持入口。</p>
            </div>
          </CardContent>
        </Card>
      </MotionReveal>

      <div className="grid gap-5 md:grid-cols-3">
        {siteConfig.supportLinks.map((item, index) => (
          <MotionReveal key={item.label} delay={0.14 + index * 0.04} y={22} rotate={index % 2 === 0 ? -1 : 1}>
            <Card className="neo-card neo-card-lift p-5" style={{ background: index % 3 === 0 ? game.theme.secondary : index % 3 === 1 ? game.theme.muted : game.theme.accent }}>
              <CardContent className="space-y-4 p-0 text-black">
                <div className="flex size-14 items-center justify-center border-4 border-black bg-white shadow-[6px_6px_0px_0px_#000]">
                  {index === 0 ? <Gift className="size-7" /> : index === 1 ? <Sparkles className="size-7" /> : <HeartHandshake className="size-7" />}
                </div>
                <div>
                  <p className="text-2xl font-black">{item.label}</p>
                  <p className="mt-2 text-sm font-bold leading-7 text-black/80">当前先保留占位，后续可替换为 {game.name} 分站专属支持入口。</p>
                </div>
              </CardContent>
            </Card>
          </MotionReveal>
        ))}
      </div>
    </div>
  );
}

export default function GameSupportPage({ params }: PageProps) {
  return (
    <Suspense fallback={null}>
      <GameSupportContent params={params} />
    </Suspense>
  );
}
