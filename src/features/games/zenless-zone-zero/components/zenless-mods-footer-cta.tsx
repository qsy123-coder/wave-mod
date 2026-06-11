import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";

export function ZenlessModsFooterCta() {
  return (
    <section className="relative z-10 mt-2 grid gap-2 lg:grid-cols-2">
      <MotionReveal delay={0.06} y={20} rotate={-1}>
        <div className="flex min-h-[80px] items-center justify-between gap-4 border-4 border-black bg-[var(--neo-panel)] px-4 py-3 text-black shadow-[6px_6px_0_0_#000]">
          <div className="min-w-0">
            <p className="truncate text-base font-black">找不到你想要的 MOD？</p>
            <p className="mt-2 truncate text-xs font-bold text-black/65">提交需求，或推荐创作者加入绝区零分站。</p>
          </div>
          <Link href="/zenless-zone-zero/support" className="neo-button-primary inline-flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-black uppercase">
            提交需求<ArrowRight className="size-3.5" />
          </Link>
        </div>
      </MotionReveal>
      <MotionReveal delay={0.14} y={20} rotate={1}>
        <div className="flex min-h-[80px] items-center justify-between gap-4 border-4 border-black bg-[var(--neo-muted)] px-4 py-3 text-black shadow-[6px_6px_0_0_#000]">
          <div className="min-w-0">
            <p className="inline-flex max-w-full items-center gap-2 truncate text-base font-black"><Trophy className="size-5 shrink-0" />分享你的作品</p>
            <p className="mt-2 truncate text-xs font-bold text-black/65">上传绝区零 MOD，获得推荐位。</p>
          </div>
          <Link href="/admin/upload" className="neo-button-secondary inline-flex shrink-0 items-center gap-2 px-4 py-2 text-[10px] font-black uppercase">
            上传 MOD<ArrowRight className="size-3.5" />
          </Link>
        </div>
      </MotionReveal>
    </section>
  );
}
