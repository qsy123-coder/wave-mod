"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type CharacterSidebarItem = {
  label: string;
  href: string;
  count: number;
  isActive: boolean;
};

type CharacterSidebarProps = {
  allLabel: string;
  allHref: string;
  allCount: number;
  isAllActive: boolean;
  characters: CharacterSidebarItem[];
  className?: string;
};

const tagColors = [
  "bg-[#ff7a7a]",
  "bg-[#ffd84f]",
  "bg-[#bcaeff]",
];

export function CharacterSidebar({
  allLabel,
  allHref,
  allCount,
  isAllActive,
  characters,
  className,
}: CharacterSidebarProps) {
  const specialCategories = characters.filter((c) =>
    ["Skins", "Other/Misc", "UI"].includes(c.label)
  );
  const characterItems = characters.filter(
    (c) => !["Skins", "Other/Misc", "UI"].includes(c.label)
  );

  return (
    <aside className={cn("flex shrink-0 flex-col gap-1 border-4 border-black bg-[#fff8ef] p-3 shadow-[6px_6px_0px_0px_#000]", className)}>
      {/* 全部 */}
      <Link
        href={allHref}
        className={cn(
          "border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000]",
          isAllActive
            ? "bg-[#ff7a7a] text-black"
            : "bg-white text-black/75"
        )}
      >
        {allLabel}
        <span className="ml-1.5 text-[10px] opacity-50">{allCount}</span>
      </Link>

      {/* 特殊分类 */}
      {specialCategories.map((item, i) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000]",
            item.isActive
              ? "bg-[#ff7a7a] text-black"
              : cn("bg-white text-black/75", tagColors[i % tagColors.length])
          )}
        >
          {item.label}
          <span className="ml-1.5 text-[10px] opacity-50">{item.count}</span>
        </Link>
      ))}

      {/* 分隔线 */}
      <div className="my-1 border-t-4 border-black" />

      {/* 角色列表 - 隐藏滚动条 */}
      <div className="flex flex-col gap-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {characterItems.map((item, i) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "border-4 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000]",
              item.isActive
                ? "bg-[#ff7a7a] text-black"
                : cn("bg-white text-black/75", tagColors[i % tagColors.length])
            )}
          >
            {item.label}
            <span className="ml-1.5 text-[10px] opacity-50">{item.count}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
