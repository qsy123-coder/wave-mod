export function SiteHeaderSkeleton() {
  return (
    <header
      className="sticky top-0 z-50 border-b-4 border-black"
      style={{ background: "var(--neo-nav)" }}
    >
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        {/* Logo placeholder */}
        <div className="flex items-center gap-3 rounded border-4 border-black px-4 py-3" style={{ background: "var(--neo-accent)" }}>
          <span className="flex size-11 items-center justify-center border-4 border-black bg-white text-base font-black">
            W
          </span>
          <div className="min-w-0 space-y-1">
            <div className="h-3 w-16 animate-pulse bg-black/20" />
            <div className="h-4 w-24 animate-pulse bg-black/20" />
          </div>
        </div>

        {/* Game switch placeholder */}
        <div className="hidden h-10 w-28 animate-pulse border-4 border-black bg-white md:inline-flex" />

        {/* Nav items skeleton */}
        <div className="hidden items-center gap-2 lg:flex">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-16 animate-pulse border-2 border-black/30"
              style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.35)" : "transparent" }}
            />
          ))}
        </div>

        {/* Right side placeholders */}
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="h-10 w-[280px] animate-pulse border-2 border-black/30 bg-black/5" />
          <div className="h-10 w-10 animate-pulse rounded-full border-2 border-black/30 bg-black/5" />
          <div className="h-11 w-20 animate-pulse border-2 border-black/30 bg-black/10" />
          <div className="h-11 w-20 animate-pulse border-2 border-black/30 bg-black/10" />
          <div className="h-11 w-28 animate-pulse border-2 border-black/30 bg-black/10" />
        </div>

        {/* Mobile menu placeholder */}
        <div className="ml-auto h-11 w-11 animate-pulse border-2 border-black/30 bg-black/10 md:hidden" />
      </div>
    </header>
  );
}
