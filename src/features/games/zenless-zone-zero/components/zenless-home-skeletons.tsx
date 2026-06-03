import { MotionReveal } from "@/components/layout/motion-reveal";

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse border-4 border-black bg-white/80 ${className}`} />;
}

function ZenlessHomeHeroSkeleton() {
  return (
    <section className="relative h-[55vh] min-h-[470px] bg-transparent pt-[58px] text-white">
      <div className="absolute inset-x-0 -bottom-20 -top-10 overflow-hidden bg-black">
        <div className="h-full w-full animate-pulse bg-[var(--neo-muted)]" />
        <div className="neo-grid absolute inset-0 opacity-[0.16] mix-blend-screen" />
      </div>
      <div className="relative z-10 mx-auto grid h-full w-full max-w-[1500px] grid-cols-1 items-center gap-2 px-4 pb-16 pt-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-6 xl:grid-cols-[minmax(0,1fr)_310px] 2xl:px-4">
        <div className="max-w-2xl pt-1">
          <MotionReveal delay={0.02} rotate={-2}>
            <SkeletonBar className="mb-2 h-9 w-56 bg-[var(--neo-accent)] shadow-[5px_5px_0px_0px_#000]" />
          </MotionReveal>
          <MotionReveal delay={0.08} y={28}>
            <SkeletonBar className="h-20 w-full max-w-xl bg-white/80" />
          </MotionReveal>
          <MotionReveal delay={0.14} y={20} rotate={1}>
            <SkeletonBar className="mt-2 h-5 w-72 bg-white/80" />
            <SkeletonBar className="mt-1.5 h-16 w-full max-w-lg bg-white/92 shadow-[5px_5px_0px_0px_#000]" />
          </MotionReveal>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <MotionReveal delay={0.22} rotate={-1}><SkeletonBar className="h-11 w-36 bg-[var(--neo-accent)]" /></MotionReveal>
            <MotionReveal delay={0.26} rotate={1}><SkeletonBar className="h-11 w-32 bg-[var(--neo-secondary)]" /></MotionReveal>
          </div>
        </div>
        <MotionReveal delay={0.18} y={32} rotate={1} className="hidden lg:block">
          <aside className="rotate-1 border-4 border-black bg-[var(--neo-panel)] p-3 text-black shadow-[8px_8px_0px_0px_#000]">
            <SkeletonBar className="mb-3 h-9 w-44 bg-[var(--neo-secondary)] shadow-[4px_4px_0px_0px_#000]" />
            <SkeletonBar className="h-16 w-full bg-white" />
            <SkeletonBar className="mt-3 h-16 w-full bg-white/80" />
            <SkeletonBar className="mt-3 h-10 w-full bg-white" />
          </aside>
        </MotionReveal>
      </div>
    </section>
  );
}

function ZenlessLowerHomeSkeleton() {
  return (
    <section className="relative z-10 -mt-14 px-4 pb-6 pt-0 text-white sm:px-5 lg:px-6 2xl:px-4">
      <div className="mx-auto grid max-w-[1500px] gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <MotionReveal delay={0.04} y={24} rotate={-1}>
            <div className="grid overflow-hidden border-2 border-black bg-white py-0 text-black shadow-[7px_7px_0px_0px_#000] sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => <SkeletonBar key={index} className="h-[58px] border-2 bg-white/90" />)}
            </div>
          </MotionReveal>
          <section className="space-y-2">
            <div className="flex items-center gap-3">
              <MotionReveal delay={0.08} rotate={-1}><SkeletonBar className="h-8 w-36 bg-[var(--neo-secondary)] shadow-[5px_5px_0px_0px_#000]" /></MotionReveal>
              <div className="h-px flex-1 bg-white/65 shadow-[0_1px_0px_#000]" />
              <MotionReveal delay={0.12} rotate={1}><SkeletonBar className="h-5 w-16 bg-white/80" /></MotionReveal>
            </div>
            <div className="flex gap-3 overflow-hidden pb-2 pr-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <MotionReveal key={index} delay={0.14 + index * 0.04} y={24} rotate={index % 2 === 0 ? -1 : 1}>
                  <article className="block min-w-[190px] overflow-hidden border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000]">
                    <div className="relative h-[104px] overflow-hidden border-b-4 border-black bg-black">
                      <div className="h-full w-full animate-pulse bg-[var(--neo-muted)]" />
                      <SkeletonBar className="absolute left-2 top-2 h-6 w-16 bg-[var(--neo-accent)] shadow-[3px_3px_0px_0px_#000]" />
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      <SkeletonBar className="h-3 w-16 bg-white" />
                      <SkeletonBar className="h-4 w-36 bg-white" />
                      <div className="flex items-center justify-between"><SkeletonBar className="h-3 w-10 bg-[var(--neo-secondary)]" /><SkeletonBar className="h-3 w-14 bg-white" /></div>
                    </div>
                  </article>
                </MotionReveal>
              ))}
            </div>
          </section>
          <MotionReveal delay={0.22} y={24} rotate={1}><SkeletonBar className="h-12 w-full bg-[var(--neo-muted)] shadow-[7px_7px_0px_0px_#000]" /></MotionReveal>
          <MotionReveal delay={0.26} y={20} rotate={-1}><SkeletonBar className="h-[52px] w-full bg-white shadow-[7px_7px_0px_0px_#000]" /></MotionReveal>
        </div>
        <aside className="grid gap-3 lg:auto-rows-max">
          <MotionReveal delay={0.18} y={26} rotate={1}>
            <div className="border-4 border-black bg-[var(--neo-panel)] p-3 text-black shadow-[7px_7px_0px_0px_#000]">
              <SkeletonBar className="mb-2 h-5 w-full bg-white" />
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <SkeletonBar key={index} className="h-10 w-full bg-white/86 shadow-[3px_3px_0px_0px_#000]" />)}</div>
            </div>
          </MotionReveal>
          <MotionReveal delay={0.24} y={26} rotate={-1}>
            <div className="border-4 border-black bg-white p-3 text-black shadow-[7px_7px_0px_0px_#000]">
              <SkeletonBar className="mb-2 h-5 w-full bg-white" />
              <div className="grid grid-cols-2 gap-2">{Array.from({ length: 6 }).map((_, index) => <SkeletonBar key={index} className="h-11 w-full bg-[var(--neo-secondary)] shadow-[3px_3px_0px_0px_#000]" />)}</div>
            </div>
          </MotionReveal>
        </aside>
      </div>
    </section>
  );
}

export function ZenlessHomePageSkeleton() {
  return (
    <div className="-mt-[74px] min-h-screen">
      <ZenlessHomeHeroSkeleton />
      <ZenlessLowerHomeSkeleton />
    </div>
  );
}
