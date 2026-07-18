"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GameConfig } from "@/config/games";

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

export function CharacterSidebar({
  allLabel,
  allHref,
  allCount,
  isAllActive,
  characters,
  className,
}: CharacterSidebarProps) {
  // 特殊分类项（始终在顶部）
  const specialCategories = characters.filter((c) =>
    ["Skins", "Other/Misc", "UI"].includes(c.label)
  );
  const characterItems = characters.filter(
    (c) => !["Skins", "Other/Misc", "UI"].includes(c.label)
  );

  return (
    <aside className={cn("flex shrink-0 flex-col gap-1", className)}>
      {/* 全部 */}
      <Link
        href={allHref}
        className={cn(
          "border-2 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] transition hover:-translate-y-0.5",
          isAllActive
            ? "border-black bg-black text-white shadow-[3px_3px_0px_0px_#000]"
            : "border-transparent text-black/70 hover:border-black hover:shadow-[3px_3px_0px_0px_#000]"
        )}
      >
        {allLabel}
        <span className="ml-1.5 text-[10px] opacity-60">{allCount}</span>
      </Link>

      {/* 特殊分类 */}
      {specialCategories.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "border-2 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] transition hover:-translate-y-0.5",
            item.isActive
              ? "border-black bg-black text-white shadow-[3px_3px_0px_0px_#000]"
              : "border-transparent text-black/70 hover:border-black hover:shadow-[3px_3px_0px_0px_#000]"
          )}
        >
          {item.label}
          <span className="ml-1.5 text-[10px] opacity-60">{item.count}</span>
        </Link>
      ))}

      {/* 分隔线 */}
      <div className="my-1 border-t-2 border-black/20" />

      {/* 角色列表 */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {characterItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "border-2 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] transition hover:-translate-y-0.5",
              item.isActive
                ? "border-black bg-black text-white shadow-[3px_3px_0px_0px_#000]"
                : "border-transparent text-black/70 hover:border-black hover:shadow-[3px_3px_0px_0px_#000]"
            )}
          >
            {item.label}
            <span className="ml-1.5 text-[10px] opacity-60">{item.count}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
