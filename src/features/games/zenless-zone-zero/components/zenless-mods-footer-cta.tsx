import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";

import { ZenlessModsMotionItem, ZenlessModsMotionRoot } from "./zenless-mods-motion";

export function ZenlessModsFooterCta() {
  return (
    <ZenlessModsMotionRoot className="relative z-10 mt-2 grid gap-2 lg:grid-cols-2">
      <ZenlessModsMotionItem delay={0.06} lift={14} rotate={-0.5}>
        <div className="flex min-h-[74px] items-center justify-between gap-3 border-4 border-black bg-[var(--neo-panel)] px-4 py-3 text-black shadow-[6px_6px_0_0_#000]">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">找不到你想要的 MOD？</p>
            <p className="mt-1 truncate text-[10px] font-bold text-black/65">提交需求，或推荐创作者加入绝区零分站。</p>
          </div>
          <Link href="/zenless-zone-zero/support" className="neo-button-primary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase">
            Request a Mod<ArrowRight className="size-3.5" />
          </Link>
        </div>
      </ZenlessModsMotionItem>
      <ZenlessModsMotionItem delay={0.14} lift={14} rotate={0.5}>
        <div className="flex min-h-[74px] items-center justify-between gap-3 border-4 border-black bg-[var(--neo-muted)] px-4 py-3 text-black shadow-[6px_6px_0_0_#000]">
          <div className="min-w-0">
            <p className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-black"><Trophy className="size-4 shrink-0" />Share your creations</p>
            <p className="mt-1 truncate text-[10px] font-bold text-black/65">上传绝区零 MOD，获得推荐位。</p>
          </div>
          <Link href="/admin/upload" className="neo-button-secondary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase">
            Upload Mod<ArrowRight className="size-3.5" />
          </Link>
        </div>
      </ZenlessModsMotionItem>
    </ZenlessModsMotionRoot>
  );
}
