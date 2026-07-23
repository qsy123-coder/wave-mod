"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  nsfwOnly?: boolean;
  onNsfwOnlyChange?: (v: boolean) => void;
  activeCharacter?: string;
  activeQuery?: string;
  modCount?: number;
  className?: string;
};

const filterOptions = [
  { key: "all" as const, label: "全部" },
  { key: "nsfw" as const, label: "仅 NSFW" },
  { key: "direct" as const, label: "仅直链" },
];

const nsfwModeOptions = [
  { key: "show" as const, label: "显示 NSFW" },
  { key: "blur" as const, label: "模糊 NSFW" },
  { key: "hide" as const, label: "隐藏 NSFW" },
];

function getFilterLabel(directOnly: boolean, nsfwOnly: boolean) {
  if (nsfwOnly) return "仅 NSFW";
  if (directOnly) return "仅直链";
  return "全部";
}

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
  nsfwOnly = false,
  onNsfwOnlyChange,
  activeCharacter,
  activeQuery,
  modCount,
  className,
}: ModsToolbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filterOpen, setFilterOpen] = useState(false);
  const [nsfwOpen, setNsfwOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`${gameModsPath}?query=${encodeURIComponent(query.trim())}`);
    } else {
      router.push(gameModsPath);
    }
  };

  const handleFilterSelect = (key: string) => {
    if (key === "nsfw") {
      onNsfwOnlyChange?.(true);
      onDirectOnlyChange?.(false);
      onNsfwModeChange?.("show");
    } else if (key === "direct") {
      onNsfwOnlyChange?.(false);
      onDirectOnlyChange?.(true);
    } else {
      // "全部"：重置所有过滤条件
      onNsfwOnlyChange?.(false);
      onDirectOnlyChange?.(false);
      onNsfwModeChange?.("blur");
    }
    setFilterOpen(false);
  };

  const handleNsfwModeSelect = (key: NsfwMode) => {
    onNsfwModeChange?.(key);
    setNsfwOpen(false);
  };

  const handleSortSelect = (value: string) => {
    const href = sortHrefs[value];
    if (href) router.push(href);
    setSortOpen(false);
  };

  const filterKey = nsfwOnly ? "nsfw" : directOnly ? "direct" : "all";
  const filterLabel = getFilterLabel(directOnly, nsfwOnly);
  const isFilterActive = directOnly || nsfwOnly;
  const isNsfwActive = nsfwMode !== "blur";
  const nsfwLabel = nsfwModeOptions.find((o) => o.key === nsfwMode)?.label ?? "模糊 NSFW";
  const sortLabel = sortOptions.find((o) => o.value === sort)?.label ?? "默认";
  const isSortActive = sort !== "latest" && sort !== "default";

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

      {/* 过滤条件下拉（全部 / 仅 NSFW / 仅直链） */}
      <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1 border-4 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
            isFilterActive ? "bg-[#4ade80] text-black" : "bg-white text-black"
          )}
        >
          {filterLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 border-4 border-black bg-[#fff8ef] p-2 text-black shadow-[8px_8px_0px_0px_#000]">
          {filterOptions.map((opt, index) => {
            const isActive = opt.key === filterKey;
            const colors = ["bg-white", "bg-[#bcaeff]", "bg-[#4ade80]"];
            return (
              <DropdownMenuItem
                key={opt.key}
                className="cursor-pointer p-0 focus:bg-transparent"
                onClick={(e) => { e.stopPropagation(); handleFilterSelect(opt.key); }}
              >
                <div
                  className={cn(
                    "flex w-full items-center justify-between border-4 border-black px-3 py-2 text-sm font-black shadow-[4px_4px_0px_0px_#000]",
                    isActive ? "bg-black text-white border-white" : colors[index]
                  )}
                >
                  <span>{opt.label}</span>
                  {isActive ? <span className="text-[10px]">✓</span> : null}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* NSFW 显示模式下拉 */}
      <DropdownMenu open={nsfwOpen} onOpenChange={setNsfwOpen}>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1 border-4 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
            isNsfwActive ? "bg-[#bcaeff] text-black" : "bg-white text-black/50"
          )}
        >
          {nsfwLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 border-4 border-black bg-[#fff8ef] p-2 text-black shadow-[8px_8px_0px_0px_#000]">
          {nsfwModeOptions.map((opt, index) => {
            const isActive = opt.key === nsfwMode;
            const colors = ["bg-white", "bg-[#ffd84f]", "bg-[#ff7a7a]"];
            return (
              <DropdownMenuItem
                key={opt.key}
                className="cursor-pointer p-0 focus:bg-transparent"
                onClick={(e) => { e.stopPropagation(); handleNsfwModeSelect(opt.key); }}
              >
                <div
                  className={cn(
                    "flex w-full items-center justify-between border-4 border-black px-3 py-2 text-sm font-black shadow-[4px_4px_0px_0px_#000]",
                    isActive ? "bg-black text-white border-white" : colors[index]
                  )}
                >
                  <span>{opt.label}</span>
                  {isActive ? <span className="text-[10px]">✓</span> : null}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 排序下拉 */}
      <DropdownMenu open={sortOpen} onOpenChange={setSortOpen}>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1 border-4 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
            isSortActive ? "bg-[#ffd84f] text-black" : "bg-white text-black"
          )}
        >
          {sortLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36 border-4 border-black bg-[#fff8ef] p-2 text-black shadow-[8px_8px_0px_0px_#000]">
          {sortOptions.map((opt, index) => {
            const isActive = opt.value === sort;
            const colors = ["bg-white", "bg-[#ffd84f]", "bg-[#ff7a7a]", "bg-[#bcaeff]", "bg-[#4ade80]"];
            return (
              <DropdownMenuItem
                key={opt.value}
                className="cursor-pointer p-0 focus:bg-transparent"
                onClick={(e) => { e.stopPropagation(); handleSortSelect(opt.value); }}
              >
                <div
                  className={cn(
                    "flex w-full items-center justify-between border-4 border-black px-3 py-2 text-sm font-black shadow-[4px_4px_0px_0px_#000]",
                    isActive ? "bg-black text-white border-white" : colors[index % colors.length]
                  )}
                >
                  <span>{opt.label}</span>
                  {isActive ? <span className="text-[10px]">✓</span> : null}
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 当前筛选条件 */}
      {(activeCharacter || activeQuery || isFilterActive || isNsfwActive || isSortActive) ? (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t-4 border-black pt-2">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-black/60">筛选：</span>
          {modCount !== undefined ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[#ffd84f] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              共 {modCount} 个 MOD
            </span>
          ) : null}
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
          {isFilterActive ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[#4ade80] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              {filterLabel}
            </span>
          ) : null}
          {isNsfwActive ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[#bcaeff] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              {nsfwLabel}
            </span>
          ) : null}
          {isSortActive ? (
            <span className="inline-flex items-center gap-1 border-[3px] border-black bg-[#ffd84f] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_#000]">
              排序: {sortLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
