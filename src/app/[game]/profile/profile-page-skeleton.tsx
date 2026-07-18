export function ProfilePageSkeleton() {
  return (
    <div className="flex flex-col gap-5 py-5 lg:py-6">
      <div className="h-48 animate-pulse border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]" />
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="h-64 animate-pulse border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]" />
        <div className="h-96 animate-pulse border-4 border-black bg-[#fff8ef] shadow-[6px_6px_0px_0px_#000]" />
      </div>
    </div>
  );
}
