"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

type CharacterTag = {
  className?: string;
  href: string;
  isActive?: boolean;
  label: string;
};

type CharacterTagCollapseProps = {
  allLabel?: string;
  allTagClassName?: string;
  allTagHref?: string;
  characterTags: CharacterTag[];
  collapsedCount?: number;
  itemClassName?: string;
  moreButtonClassName?: string;
};

export function CharacterTagCollapse({
  allLabel,
  allTagClassName,
  allTagHref,
  characterTags,
  collapsedCount = 6,
  itemClassName,
  moreButtonClassName,
}: CharacterTagCollapseProps) {
  const [expanded, setExpanded] = useState(false);

  const orderedTags = useMemo(() => {
    const activeTags = characterTags.filter((tag) => tag.isActive);
    const inactiveTags = characterTags.filter((tag) => !tag.isActive);
    return [...activeTags, ...inactiveTags];
  }, [characterTags]);

  const visibleTags = useMemo(() => {
    if (expanded) {
      return orderedTags;
    }

    return orderedTags.slice(0, collapsedCount);
  }, [orderedTags, collapsedCount, expanded]);

  const hasMore = orderedTags.length > collapsedCount;

  return (
    <div className="space-y-2">
      <div className={cn(
        "flex flex-wrap gap-2 overflow-hidden transition-all duration-300 ease-out",
        expanded ? "max-h-[480px] opacity-100" : "max-h-[108px] opacity-100",
      )}>
        {allLabel && allTagHref ? (
          <Link href={allTagHref} className={allTagClassName}>
            {allLabel}
          </Link>
        ) : null}

        {visibleTags.map((tag) => (
          <Link key={`${tag.label}-${tag.href}`} href={tag.href} className={cn(itemClassName, tag.className, tag.isActive && "ring-2 ring-black/55 ring-offset-2 ring-offset-transparent")}>
            {tag.label}
          </Link>
        ))}
      </div>

      {hasMore ? (
        <button type="button" onClick={() => setExpanded((value) => !value)} className={cn("inline-flex items-center gap-2", moreButtonClassName)}>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {expanded ? "收起角色" : `展开更多 (${orderedTags.length - visibleTags.length})`}
        </button>
      ) : null}
    </div>
  );
}
