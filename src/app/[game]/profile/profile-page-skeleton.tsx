export function ProfilePageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="h-48 animate-pulse border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]" />
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="h-64 animate-pulse border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]" />
        <div className="h-96 animate-pulse border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]" />
      </div>
    </div>
  );
}
