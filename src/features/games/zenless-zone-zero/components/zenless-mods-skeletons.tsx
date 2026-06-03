import { MotionReveal } from "@/components/layout/motion-reveal";

function SkeletonBar({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse border-4 border-black bg-white/80 ${className}`}
    />
  );
}

function ZenlessBackgroundSkeleton({ className }: { className: string }) {
  return (
    <MotionReveal
      className={`pointer-events-none overflow-hidden bg-black ${className}`}
      delay={0}
      y={0}
    >
      <div className="h-full w-full animate-pulse bg-[var(--neo-muted)]" />
      <div className="neo-grid absolute inset-0 opacity-[0.18] mix-blend-screen" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_18%,rgba(0,0,0,0.58)_78%,rgba(0,0,0,0.86)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#3a2418] via-[#3a2418]/22 to-transparent" />
      <div className="absolute inset-y-0 left-0 w-36 bg-gradient-to-r from-[#3a2418] via-[#3a2418]/28 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-36 bg-gradient-to-l from-[#3a2418] via-[#3a2418]/28 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#3a2418] via-[#3a2418]/24 to-transparent" />
    </MotionReveal>
  );
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
  const tone =
    index % 3 === 0
      ? "bg-[var(--neo-accent)]"
      : index % 3 === 1
        ? "bg-[var(--neo-secondary)]"
        : "bg-[var(--neo-muted)]";

  return (
    <MotionReveal
      delay={0.06 + index * 0.03}
      y={24}
      rotate={index % 2 === 0 ? -1 : 1}
    >
      <article className="min-h-[136px] overflow-hidden border-4 border-black bg-white text-black shadow-[5px_5px_0_0_#000]">
        <div className="relative h-[88px] overflow-hidden border-b-4 border-black bg-[var(--neo-muted)]">
          <div className="h-full w-full animate-pulse bg-[var(--neo-muted)]" />
          <div className="neo-grid absolute inset-0 opacity-25" />
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white via-white/76 to-transparent" />
          <div className="absolute left-2 top-2 flex gap-1">
            <SkeletonBar
              className={`h-[18px] w-12 border-2 shadow-[2px_2px_0_0_#000] ${tone}`}
            />
            <SkeletonBar className="h-[18px] w-11 border-2 bg-white shadow-[2px_2px_0_0_#000]" />
          </div>
        </div>
        <div className="space-y-1 bg-white px-2.5 pb-2 pt-2.5">
          <SkeletonBar className="h-[10px] w-16 border-2 bg-[var(--neo-muted)]" />
          <SkeletonBar className="h-[13px] w-4/5 border-2 bg-white" />
          <div className="flex items-center justify-between pt-0.5">
            <SkeletonBar className="h-3 w-8 border-2 bg-[var(--neo-secondary)]" />
            <SkeletonBar className="h-3 w-10 border-2 bg-white" />
            <SkeletonBar className="h-3 w-10 border-2 bg-[var(--neo-accent)]" />
          </div>
        </div>
      </article>
    </MotionReveal>
  );
}

export function ZenlessModsPageSkeleton() {
  return (
    <main className="relative -mt-[74px] mx-auto flex min-h-screen w-full max-w-[1680px] flex-col overflow-hidden px-4 pb-0 pt-0 sm:px-5 lg:px-6">
      <ZenlessBackgroundSkeleton className="absolute inset-x-0 top-0 h-[18vh] min-h-[260px]" />
      <section className="relative z-10 grow pr-0 xl:pr-[268px]">
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

        <div className="absolute right-0 top-[74px] hidden w-[250px] space-y-2 xl:block">
          <MotionReveal delay={0.16} y={20} rotate={1}>
            <div className="min-h-[190px] border-4 border-black bg-[var(--neo-panel)] p-2 shadow-[4px_4px_0_0_#000]">
              <SkeletonBar className="mb-2 h-7 w-full bg-white" />
              <div className="space-y-1.5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <SkeletonBar key={index} className="h-8 w-full bg-white" />
                ))}
              </div>
            </div>
          </MotionReveal>
          <MotionReveal delay={0.2} y={20} rotate={-1}>
            <div className="min-h-[210px] border-4 border-black bg-[var(--neo-muted)] p-2 shadow-[4px_4px_0_0_#000]">
              <SkeletonBar className="mb-2 h-7 w-full bg-white" />
              <div className="space-y-1.5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <SkeletonBar key={index} className="h-7 w-full bg-white/90" />
                ))}
              </div>
            </div>
          </MotionReveal>
          <MotionReveal delay={0.24} y={20} rotate={1}>
            <div className="min-h-[160px] border-4 border-black bg-white p-2 shadow-[4px_4px_0_0_#000]">
              <SkeletonBar className="mb-2 h-7 w-full bg-[var(--neo-secondary)]" />
              <div className="space-y-1.5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <SkeletonBar key={index} className="h-7 w-full bg-white/90" />
                ))}
              </div>
            </div>
          </MotionReveal>
        </div>

        <div className="grid gap-4 xl:grid-cols-[238px_minmax(0,1fr)]">
          <MotionReveal delay={0.18} y={24} rotate={-1}>
            <div className="min-h-[560px] border-4 border-black bg-[var(--neo-secondary)] p-3 shadow-[5px_5px_0_0_#000]">
              <SkeletonBar className="h-9 w-full bg-white" />
              <div className="mt-4 space-y-2.5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <SkeletonBar key={index} className="h-10 w-full bg-white/90" />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonBar key={index} className="h-8 w-full bg-white" />
                ))}
              </div>
            </div>
          </MotionReveal>
          <section className="space-y-3">
            <MotionReveal delay={0.24} y={18} rotate={1}>
              <SkeletonBar className="h-14 w-full bg-white" />
            </MotionReveal>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <ZenlessCompactCardSkeleton key={index} index={index} />
              ))}
            </div>
            <MotionReveal delay={0.46} y={18} rotate={-1}>
              <div className="flex items-center justify-center gap-2 pt-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <SkeletonBar
                    key={index}
                    className={`size-9 ${index === 0 ? "bg-[var(--neo-accent)]" : "bg-white"}`}
                  />
                ))}
                <SkeletonBar className="h-9 w-12 bg-[var(--neo-secondary)]" />
              </div>
            </MotionReveal>
          </section>
        </div>
      </section>
      <section className="relative z-10 mt-auto grid gap-2 pb-4 lg:grid-cols-2">
        <MotionReveal delay={0.52} y={20} rotate={-1}>
          <SkeletonBar className="min-h-[112px] w-full bg-[var(--neo-panel)] shadow-[6px_6px_0_0_#000]" />
        </MotionReveal>
        <MotionReveal delay={0.58} y={20} rotate={1}>
          <SkeletonBar className="min-h-[112px] w-full bg-[var(--neo-muted)] shadow-[6px_6px_0_0_#000]" />
        </MotionReveal>
      </section>
    </main>
  );
}
