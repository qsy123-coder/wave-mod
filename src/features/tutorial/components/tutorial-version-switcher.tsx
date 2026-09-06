"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

import type { TutorialVersionMeta } from "../types";

type TutorialVersionSwitcherProps = {
  versions: TutorialVersionMeta[];
  activeVersionId: string;
  onChange: (versionId: string) => void;
};

/**
 * 前台「先看我」顶部版本切换器。
 * 版本 ≤ 3 时用分段按钮组；版本 > 3 时自动降级为下拉，避免拥挤。
 * 纯展示 + 受控回调，选中/记忆逻辑由父级（guide server page）处理。
 */
export function TutorialVersionSwitcher({
  versions,
  activeVersionId,
  onChange,
}: TutorialVersionSwitcherProps) {
  const [open, setOpen] = useState(false);
  const active = versions.find((v) => v.id === activeVersionId);

  // 单版本：无需切换器
  if (versions.length <= 1) return null;

  // 分段按钮组（版本较少）
  if (versions.length <= 3) {
    return (
      <div className="inline-flex flex-wrap items-center gap-2 rounded-none border-4 border-black bg-[var(--neo-panel)] p-1 shadow-[4px_4px_0px_0px_#000]">
        {versions.map((v) => {
          const isActive = v.id === activeVersionId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={cn(
                "flex min-w-0 flex-col items-start gap-0.5 px-4 py-1.5 text-left transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                isActive
                  ? "bg-[var(--neo-accent)] text-black shadow-[3px_3px_0px_0px_#000]"
                  : "bg-white text-black/70 hover:text-black",
              )}
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em]">
                {isActive && <Check className="size-3.5" />}
                {v.name}
              </span>
              {v.description && (
                <span className="line-clamp-1 max-w-[12rem] text-[10px] font-medium normal-case tracking-normal text-black/60">
                  {v.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // 下拉（版本较多）
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 border-4 border-black bg-[var(--neo-panel)] px-4 py-1.5 text-xs font-black uppercase tracking-[0.12em] shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
      >
        {active ? (
          <span className="flex flex-col items-start gap-0.5">
            <span>{active.name}</span>
            {active.description && (
              <span className="line-clamp-1 max-w-[12rem] text-[10px] font-medium normal-case tracking-normal text-black/60">
                {active.description}
              </span>
            )}
          </span>
        ) : (
          <span>选择版本</span>
        )}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[220px] border-4 border-black bg-white shadow-[6px_6px_0px_0px_#000]">
            {versions.map((v) => {
              const isActive = v.id === activeVersionId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onChange(v.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-black transition hover:bg-[var(--neo-accent)]",
                    isActive ? "bg-[var(--neo-accent)]" : "bg-white",
                  )}
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="truncate">{v.name}</span>
                    {v.description && (
                      <span className="line-clamp-1 text-xs font-medium normal-case tracking-normal text-black/60">
                        {v.description}
                      </span>
                    )}
                  </span>
                  {isActive && <Check className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
