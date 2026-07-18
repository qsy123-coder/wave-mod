import { MotionReveal } from "@/components/layout/motion-reveal";

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse border-4 border-black bg-white/80 ${className}`} />;
}

export function FeaturedCarouselSkeleton() {
  return (
    <MotionReveal delay={0.14} y={32} rotate={2}>
      <div className="neo-card-lg relative rotate-2 p-3" style={{ background: "var(--neo-panel)" }}>
        <div className="relative overflow-hidden border-4 border-black bg-black">
          <div className="h-[500px] w-full animate-pulse bg-[var(--neo-muted)] md:h-[560px]" />
          <div className="absolute left-3 top-3 flex gap-2">
            <SkeletonBar className="h-7 w-20" />
            <SkeletonBar className="h-7 w-16 rotate-2" />
          </div>
          <div className="absolute right-3 top-3 h-12 w-16 rotate-2 animate-pulse border-4 border-black bg-[#ffd84f] shadow-[4px_4px_0px_0px_#000]" />
          <div className="absolute inset-x-0 bottom-0 space-y-3 px-4 pb-4 pt-24">
            <SkeletonBar className="h-4 w-24" />
            <SkeletonBar className="h-10 w-2/3" />
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-3/5" />
            <div className="flex gap-2">
              <SkeletonBar className="h-8 w-20 bg-white/90" />
              <SkeletonBar className="h-8 w-20 bg-white/90" />
            </div>
            <div className="absolute bottom-4 right-4 h-8 w-28 animate-pulse rounded-full border-2 border-white/70 bg-white/20" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <SkeletonBar className="h-2.5 w-12 bg-[var(--neo-accent)]" />
              <SkeletonBar className="h-2.5 w-6" />
              <SkeletonBar className="h-2.5 w-6" />
            </div>
            <SkeletonBar className="h-8 w-28" />
          </div>
          <SkeletonBar className="h-9 w-24 bg-[var(--neo-secondary)]" />
        </div>
      </div>
    </MotionReveal>
  );
}

export function ModGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="h-full bg-[#fff8ef] p-2.5 border-4 border-black shadow-[4px_4px_0px_0px_#000]">
          <div className="relative overflow-hidden border-4 border-black bg-black">
            <div className="aspect-[4/5] w-full animate-pulse bg-[var(--neo-muted)]" />
          </div>
        </article>
      ))}
    </div>
  );
}

/** 角色分类页专用骨架 — 侧边栏 + 工具栏 + 卡片网格 */
export function ModsPageSkeleton() {
  return (
    <div className="flex gap-6">
      {/* 侧边栏骨架 */}
      <div className="hidden w-[240px] shrink-0 lg:block">
        <div className="border-4 border-black bg-[#fff8ef] p-3 shadow-[6px_6px_0px_0px_#000] space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonBar key={i} className={`h-10 w-full ${i === 0 ? "bg-[#ff7a7a]" : i % 3 === 0 ? "bg-[#ffd84f]" : "bg-white"}`} />
          ))}
        </div>
      </div>
      {/* 右侧骨架 */}
      <div className="min-w-0 flex-1 flex-col space-y-4">
        <div className="border-4 border-black bg-[#fff8ef] p-3 shadow-[6px_6px_0px_0px_#000]">
          <SkeletonBar className="h-10 w-full" />
        </div>
        <ModGridSkeleton count={10} />
      </div>
    </div>
  );
}

export function ModDetailSkeleton() {
  return (
    <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
      <section className="space-y-5">
        <MotionReveal delay={0.08} y={28} rotate={-1}>
          <div className="neo-card-lg bg-[#fff8ef] p-3">
            <div className="h-[480px] w-full animate-pulse border-4 border-black bg-[var(--neo-muted)] md:h-[620px]" />
          </div>
        </MotionReveal>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <MotionReveal key={index} delay={0.12 + index * 0.05} y={24} rotate={index % 2 === 0 ? 2 : -2}>
              <div className="neo-card bg-[#fff8ef] p-2">
                <div className="h-52 w-full animate-pulse border-4 border-black bg-[var(--neo-muted)]" />
              </div>
            </MotionReveal>
          ))}
        </div>
      </section>

      <aside className="xl:sticky xl:top-24">
        <MotionReveal delay={0.12} y={28} rotate={1}>
          <div className="neo-card-lg bg-[#fff8ef] p-6">
            <div className="space-y-6 text-black">
              <div className="flex flex-wrap gap-2">
                <SkeletonBar className="h-8 w-20 bg-[#ff7a7a]" />
                <SkeletonBar className="h-8 w-16 bg-[#ffd84f]" />
                <SkeletonBar className="h-8 w-20 bg-[#bcaeff]" />
              </div>
              <div className="space-y-3">
                <SkeletonBar className="h-10 w-4/5" />
                <SkeletonBar className="h-4 w-full" />
                <SkeletonBar className="h-4 w-2/3" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <SkeletonBar className="h-14 w-full bg-[var(--neo-accent)]" />
                <SkeletonBar className="h-14 w-full bg-[var(--neo-secondary)]" />
                <SkeletonBar className="h-14 w-full" />
              </div>
              <div className="border-4 border-black bg-[#ffd84f] p-5 shadow-[8px_8px_0px_0px_#000]">
                <SkeletonBar className="h-5 w-32 bg-white" />
                <div className="mt-4 space-y-3">
                  <SkeletonBar className="h-4 w-full bg-white" />
                  <SkeletonBar className="h-4 w-5/6 bg-white" />
                  <SkeletonBar className="h-4 w-2/3 bg-white" />
                </div>
              </div>
            </div>
          </div>
        </MotionReveal>
      </aside>
    </div>
  );
}

export function AdminModsSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <MotionReveal key={index} delay={0.06 + index * 0.03} y={20} rotate={index % 2 === 0 ? -1 : 1}>
          <div className="neo-card bg-[var(--neo-panel)] p-4 text-black">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.9fr_0.5fr_auto] lg:items-center">
              <div className="space-y-3">
                <SkeletonBar className="h-7 w-2/3" />
                <SkeletonBar className="h-4 w-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <SkeletonBar className="h-8 w-20 bg-[var(--neo-secondary)]" />
                <SkeletonBar className="h-8 w-16 bg-[var(--neo-accent)]" />
              </div>
              <SkeletonBar className="h-8 w-24 bg-[var(--neo-muted)]" />
              <div className="flex gap-2">
                <SkeletonBar className="h-10 w-20" />
                <SkeletonBar className="h-10 w-20 bg-[var(--neo-accent)]" />
              </div>
            </div>
          </div>
        </MotionReveal>
      ))}
    </div>
  );
}
