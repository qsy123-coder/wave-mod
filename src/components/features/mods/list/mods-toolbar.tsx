"use client";

import { Search, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type NsfwMode = "show" | "blur" | "hide";

type ModsToolbarProps = {
  gameModsPath: string;
  initialQuery?: string;
  sort: string;
  sortOptions: { label: string; value: string }[];
  sortHrefs: Record<string, string>;
  nsfwMode?: NsfwMode;
  onNsfwModeChange?: (mode: NsfwMode) => void;
  directOnly?: boolean;
  onDirectOnlyChange?: (v: boolean) => void;
  activeCharacter?: string;
  activeQuery?: string;
  className?: string;
};

const nsfwLabels: Record<NsfwMode, string> = {
  show: "显示 NSFW",
  blur: "模糊 NSFW",
  hide: "隐藏 NSFW",
};

export function ModsToolbar({
  gameModsPath,
  initialQuery = "",
  sort,
  sortOptions,
  sortHrefs,
  nsfwMode = "blur",
  onNsfwModeChange,
  directOnly = false,
  onDirectOnlyChange,
  activeCharacter,
  activeQuery,
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

      {/* 直链下载筛选 */}
      <button
        type="button"
        onClick={() => onDirectOnlyChange?.(!directOnly)}
        className={cn(
          "border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5",
          directOnly ? "bg-[#4ade80] text-black" : "bg-white text-black/75"
        )}
      >
        直链
      </button>

      {/* NSFW 筛选 */}
      <div className="relative">
        <select
          value={nsfwMode}
          onChange={(e) => onNsfwModeChange?.(e.target.value as NsfwMode)}
          className="cursor-pointer appearance-none border-4 border-black bg-white px-3 py-2 pr-8 text-xs font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000] outline-none transition hover:-translate-y-0.5"
        >
          {(["show", "blur", "hide"] as NsfwMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {nsfwLabels[mode]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-black/60" />
      </div>

      {/* 排序下拉 */}
      <div className="relative">
        <select
          value={sort}
          onChange={handleSortChange}
          className="cursor-pointer appearance-none border-4 border-black bg-white px-3 py-2 pr-8 text-xs font-black uppercase tracking-[0.14em] text-black shadow-[4px_4px_0px_0px_#000] outline-none transition hover:-translate-y-0.5"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-black/60" />
      </div>

      {/* 当前筛选条件 */}
      {(activeCharacter || activeQuery || directOnly || nsfwMode !== "blur" || sort !== "latest") ? (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t-4 border-black pt-2">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-black/60">筛选：</span>
          {activeCharacter ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[#ffd84f] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              角色: {activeCharacter}
            </span>
          ) : null}
          {activeQuery ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-white px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              搜索: {activeQuery}
            </span>
          ) : null}
          {directOnly ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[#4ade80] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              仅直链
            </span>
          ) : null}
          {nsfwMode !== "blur" ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[#bcaeff] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              {nsfwLabels[nsfwMode]}
            </span>
          ) : null}
          {sort !== "latest" ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-white px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              排序: {sortOptions.find((o) => o.value === sort)?.label ?? sort}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
