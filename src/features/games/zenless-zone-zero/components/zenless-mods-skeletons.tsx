import { MotionReveal } from "@/components/layout/motion-reveal";

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse border-4 border-black bg-white/80 ${className}`} />;
}

export function ZenlessNavAuthSkeleton() {
  return (
    <div className="inline-flex h-9 w-[74px] items-center gap-1.5 border-2 border-black bg-white px-3 shadow-[3px_3px_0px_0px_#000]">
      <div className="size-3.5 animate-pulse border-2 border-black bg-[var(--neo-muted)]" />
      <div className="h-2.5 flex-1 animate-pulse border-2 border-black bg-[var(--neo-secondary)]" />
    </div>
  );
}

function ZenlessCompactCardSkeleton({ index }: { index: number }) {
  return (
    <MotionReveal delay={0.06 + index * 0.03} y={24} rotate={index % 2 === 0 ? -1 : 1}>
      <article className="overflow-hidden border-4 border-black bg-black shadow-[5px_5px_0_0_#000]">
        <div className="relative h-[88px] overflow-hidden bg-black">
          <div className="h-full w-full animate-pulse bg-[var(--neo-muted)]" />
          <div className="absolute left-2 top-2 flex gap-1">
            <SkeletonBar className="h-[18px] w-12 bg-[var(--neo-secondary)] shadow-[2px_2px_0_0_#000]" />
            <SkeletonBar className="h-[18px] w-11 bg-white shadow-[2px_2px_0_0_#000]" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-black" />
        </div>
        <div className="relative -mt-2 space-y-1 bg-black px-2.5 pb-2 pt-2.5">
          <SkeletonBar className="h-[10px] w-16 border-2 bg-[var(--neo-muted)]" />
          <SkeletonBar className="h-[13px] w-4/5 border-2 bg-white" />
          <div className="flex items-center justify-between pt-0.5">
            <SkeletonBar className="h-3 w-8 border-2 bg-[var(--neo-secondary)]" />
            <SkeletonBar className="h-3 w-10 border-2 bg-white/80" />
            <SkeletonBar className="h-3 w-10 border-2 bg-[var(--neo-accent)]" />
          </div>
        </div>
      </article>
    </MotionReveal>
  );
}

export function ZenlessModsPageSkeleton() {
  return (
    <main className="relative -mt-[74px] mx-auto w-full max-w-[1680px] overflow-hidden px-4 pb-4 pt-0 sm:px-5 lg:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[18vh] min-h-[260px] bg-black/35" />
      <section className="relative z-10 pr-0 xl:pr-[268px]">
        <div className="max-w-xl pb-2 pt-[88px]">
          <MotionReveal delay={0.02} y={18} rotate={-1}>
            <SkeletonBar className="h-4 w-56 bg-[var(--neo-muted)]" />
          </MotionReveal>
          <MotionReveal delay={0.06} y={22} rotate={1}>
            <SkeletonBar className="mt-2 h-14 w-72 bg-[var(--neo-accent)] sm:w-96" />
          </MotionReveal>
          <MotionReveal delay={0.1} y={18} rotate={-1}>
            <SkeletonBar className="mt-3 h-10 w-full max-w-lg bg-white/90" />
          </MotionReveal>
        </div>

        <div className="absolute right-0 top-[74px] hidden w-[250px] space-y-1.5 xl:block">
          <MotionReveal delay={0.16} y={20} rotate={1}>
            <div className="border-4 border-black bg-[var(--neo-panel)] p-2 shadow-[4px_4px_0_0_#000]">
              <SkeletonBar className="mb-1.5 h-6 w-full bg-white" />
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, index) => <SkeletonBar key={index} className="h-7 w-full bg-white" />)}
              </div>
            </div>
          </MotionReveal>
          <MotionReveal delay={0.2} y={20} rotate={-1}>
            <div className="border-4 border-black bg-[var(--neo-muted)] p-2 shadow-[4px_4px_0_0_#000]">
              <SkeletonBar className="mb-1.5 h-6 w-full bg-white" />
              <div className="space-y-1">
                {Array.from({ length: 4 }).map((_, index) => <SkeletonBar key={index} className="h-6 w-full bg-white/90" />)}
              </div>
            </div>
          </MotionReveal>
        </div>

        <div className="grid gap-4 xl:grid-cols-[238px_minmax(0,1fr)]">
          <MotionReveal delay={0.18} y={24} rotate={-1}>
            <div className="border-4 border-black bg-[var(--neo-secondary)] p-3 shadow-[5px_5px_0_0_#000]">
              <SkeletonBar className="h-8 w-full bg-white" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 5 }).map((_, index) => <SkeletonBar key={index} className="h-9 w-full bg-white/90" />)}
              </div>
            </div>
          </MotionReveal>
          <section className="space-y-3">
            <MotionReveal delay={0.24} y={18} rotate={1}>
              <SkeletonBar className="h-14 w-full bg-white" />
            </MotionReveal>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => <ZenlessCompactCardSkeleton key={index} index={index} />)}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
