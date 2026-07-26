"use client";

import { cn } from "@/lib/utils";

import type { Chapter } from "../types";

type TutorialNavProps = {
  chapters: Chapter[];
  activeId: string;
  onChange: (id: string) => void;
};

/**
 * Sticky tab bar — each chapter is a tab button.
 * Fixed at the top, highlights the active tab with neo-brutalist style.
 */
export function TutorialNav({ chapters, activeId, onChange }: TutorialNavProps) {
  return (
    <nav className="z-50 border-b-4 border-black bg-[var(--neo-panel)] px-4 py-1.5 shadow-[0_4px_0px_0px_#000] sm:px-5 lg:px-6">
      <div className="flex flex-wrap gap-2">
        {chapters.map((ch) => {
          const isActive = ch.id === activeId;

          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => onChange(ch.id)}
              className={cn(
                "inline-flex items-center gap-1.5 border-4 border-black px-3 py-1 transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                isActive
                  ? "shadow-[4px_4px_0px_0px_#000]"
                  : "bg-white hover:shadow-[4px_4px_0px_0px_#000]",
              )}
              style={{ background: isActive ? "var(--neo-accent)" : undefined }}
            >
              <span className="text-xs font-black">{ch.id}</span>
              <span className="hidden text-[10px] font-bold sm:inline">
                {ch.title}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
