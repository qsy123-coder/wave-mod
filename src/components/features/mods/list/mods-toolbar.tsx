"use client";

import { Search, Download, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type ModsToolbarProps = {
  gameModsPath: string;
  initialQuery?: string;
  showNsfw: boolean;
  nsfwToggleHref: string;
  sort: string;
  sortOptions: { label: string; value: string }[];
  sortHrefs: Record<string, string>;
  className?: string;
};

export function ModsToolbar({
  gameModsPath,
  initialQuery = "",
  showNsfw,
  nsfwToggleHref,
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

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const href = sortHrefs[e.target.value];
    if (href) router.push(href);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* 分类标签 */}
      <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[var(--neo-accent)] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000]">
        分类
      </span>

      {/* 搜索框 */}
      <form onSubmit={handleSearch} className="flex flex-1 items-center gap-1.5 border-[3px] border-black bg-white px-3 py-1.5 shadow-[3px_3px_0px_0px_#000] min-w-[200px] max-w-md">
        <Search className="size-4 shrink-0 text-black/60" />
        <input
          name="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模组..."
          className="min-w-0 flex-1 bg-transparent text-xs font-black text-black outline-none placeholder:text-black/40"
        />
      </form>

      {/* 筛选按钮组 */}
      <div className="flex items-center gap-1.5">
        {/* 仅 Mods */}
        <button
          type="button"
          className="inline-flex items-center gap-1 border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
        >
          仅Mods <span className="text-[9px] opacity-50">▼</span>
        </button>

        {/* NSFW 开关 */}
        <Link
          href={nsfwToggleHref}
          className={cn(
            "inline-flex items-center gap-1 border-[3px] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5",
            showNsfw
              ? "border-black bg-[#bcaeff] text-black"
              : "border-black bg-white text-black"
          )}
        >
          显示 NSFW {showNsfw ? "✓" : "—"}
        </Link>

        {/* 排序 */}
        <select
          value={sort}
          onChange={handleSortChange}
          className="appearance-none border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] outline-none transition hover:-translate-y-0.5 cursor-pointer"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* 直链下载 */}
        <Link
          href="/mods"
          className="inline-flex items-center gap-1 border-[3px] border-black bg-[var(--neo-accent)] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
        >
          <Download className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
