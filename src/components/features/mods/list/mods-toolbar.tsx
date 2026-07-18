"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type ModsToolbarProps = {
  gameModsPath: string;
  initialQuery?: string;
  sort: string;
  sortOptions: { label: string; value: string }[];
  sortHrefs: Record<string, string>;
  className?: string;
};

export function ModsToolbar({
  gameModsPath,
  initialQuery = "",
  sort,
  sortOptions,
  sortHrefs,
  className,
}: ModsToolbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`${gameModsPath}?query=${encodeURIComponent(query.trim())}`);
    } else {
      router.push(gameModsPath);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-4 border-black bg-[#fff8ef] p-3 shadow-[6px_6px_0px_0px_#000]", className)}>
      {/* 分类标签 */}
      <span className="inline-flex items-center gap-1 border-4 border-black bg-[#ffd84f] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000]">
        分类
      </span>

      {/* 搜索框 */}
      <form onSubmit={handleSearch} className="flex flex-1 items-center gap-1.5 border-4 border-black bg-white px-3 py-2 shadow-[4px_4px_0px_0px_#000] min-w-[180px] max-w-md">
        <Search className="size-4 shrink-0 text-black/60" />
        <input
          name="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模组..."
          className="min-w-0 flex-1 bg-transparent text-xs font-black text-black outline-none placeholder:text-black/40"
        />
      </form>

      {/* 排序方式 */}
      {sortOptions.map((opt) => {
        const active = opt.value === sort;
        return (
          <Link
            key={opt.value}
            href={sortHrefs[opt.value]}
            className={cn(
              "border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000]",
              active ? "bg-[#ff7a7a] text-black" : "bg-white text-black/75"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
