import { Gift, HeartHandshake, Sparkles } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import { Card, CardContent } from "@/components/ui/card";
import { siteConfig } from "@/lib/constants/site";

export default function SupportPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-accent)" }}>
          <p className="neo-label text-black/60">支持本站</p>
          <h1 className="mt-2 text-4xl font-black text-black">感谢支持这个单主理人 MOD 站</h1>
        </section>
      </MotionReveal>

      <MotionReveal delay={0.1} y={22} rotate={1}>
        <Card className="neo-card-lg p-6" style={{ background: "var(--neo-panel)" }}>
          <CardContent className="grid gap-4 p-0 text-black md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 shadow-[6px_6px_0px_0px_#000]">
                <HeartHandshake className="size-4" />
                <span className="text-sm font-black uppercase tracking-[0.14em]">站点维护说明</span>
              </div>
              <p className="text-base font-bold leading-8 text-black/80">
                这个站优先维护高清预览、直链下载与角色分类体验。你的支持会优先用于封面素材整理、直链资源维护与后台效率提升。
              </p>
            </div>
            <div className="border-4 border-black p-5 shadow-[6px_6px_0px_0px_#000]" style={{ background: "var(--neo-secondary)" }}>
              <p className="neo-label text-black/60">当前状态</p>
              <p className="mt-3 text-sm font-bold leading-7 text-black/80">
                赞助入口目前先保留占位，后面可以替换为真实链接、二维码或会员支持入口。
              </p>
            </div>
          </CardContent>
        </Card>
      </MotionReveal>

      <div className="grid gap-5 md:grid-cols-3">
        {siteConfig.supportLinks.map((item, index) => (
          <MotionReveal key={item.label} delay={0.14 + index * 0.04} y={22} rotate={index % 2 === 0 ? -1 : 1}>
            <Card className="neo-card neo-card-lift p-5" style={{ background: index % 3 === 0 ? "var(--neo-secondary)" : index % 3 === 1 ? "var(--neo-muted)" : "var(--neo-accent)" }}>
              <CardContent className="space-y-4 p-0 text-black">
                <div className="flex size-14 items-center justify-center border-4 border-black bg-white shadow-[6px_6px_0px_0px_#000]">
                  {index === 0 ? <Gift className="size-7" /> : index === 1 ? <Sparkles className="size-7" /> : <HeartHandshake className="size-7" />}
                </div>
                <div>
                  <p className="text-2xl font-black">{item.label}</p>
                  <p className="mt-2 text-sm font-bold leading-7 text-black/80">
                    当前先保留占位，后续可替换为真实跳转链接、赞助二维码或会员支持入口。
                  </p>
                </div>
              </CardContent>
            </Card>
          </MotionReveal>
        ))}
      </div>
    </div>
  );
}
