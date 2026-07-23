"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getCharacterImagePath } from "@/lib/constants/character-images";

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
    <aside className={cn("flex shrink-0 flex-col gap-1.5 border-4 border-black bg-[#fff8ef] p-2.5 shadow-[6px_6px_0px_0px_#000]", className)}>
      {/* 全部 */}
      <Link
        href={allHref}
        className={cn(
          "border-[3px] border-black px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
          isAllActive
            ? "bg-[#ff7a7a] text-black"
            : "bg-white text-black/75"
        )}
      >
        {allLabel}
        <span className="ml-1 text-[9px] opacity-50">{allCount}</span>
      </Link>

      {/* 特殊分类 */}
      {specialCategories.map((item, i) => {
        const avatarPath = getCharacterImagePath(item.label);

        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-2 border-[3px] border-black px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
              item.isActive
                ? "bg-[#ff7a7a] text-black"
                : cn("bg-white text-black/75", tagColors[i % tagColors.length])
            )}
          >
            {avatarPath ? (
              <Image
                src={avatarPath}
                alt={item.label}
                width={32}
                height={32}
                unoptimized
                className="size-8 shrink-0 rounded-full border-2 border-black object-cover"
              />
            ) : null}
            {item.label}
            <span className="ml-1 text-[9px] opacity-50">{item.count}</span>
          </Link>
        );
      })}

      {/* 分隔线 */}
      <div className="my-0.5 border-t-[3px] border-black" />

      {/* 角色列表 - 隐藏滚动条 */}
      <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {characterItems.map((item, i) => {
          const avatarPath = getCharacterImagePath(item.label);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-2 border-[3px] border-black px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
                item.isActive
                  ? "bg-[#ff7a7a] text-black"
                  : cn("bg-white text-black/75", tagColors[i % tagColors.length])
              )}
            >
              {avatarPath ? (
                <Image
                  src={avatarPath}
                  alt={item.label}
                  width={32}
                  height={32}
                  unoptimized
                  className="size-8 shrink-0 rounded-full border-2 border-black object-cover"
                />
              ) : null}
              {item.label}
              <span className="ml-1 text-[9px] opacity-50">{item.count}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
