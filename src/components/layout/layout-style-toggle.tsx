"use client";

import { useEffect, useState } from "react";
import { Paintbrush } from "lucide-react";

import { useLayoutStyle } from "@/components/layout/layout-style-provider";
import type { LayoutStyle } from "@/lib/layout-style/constants";

const STYLE_OPTIONS: { id: LayoutStyle; label: string; shortLabel: string }[] = [
  { id: "zzz-immersive", label: "Neo 新粗野主义", shortLabel: "Neo" },
  { id: "zzz-dark", label: "深色沉浸式", shortLabel: "深色" },
];

type LayoutStyleToggleProps = { variant?: "glass" | "neo" };

const variantClassNames: Record<string, string> = {
  glass: "text-white/80 hover:text-white border-white/20 hover:border-white/40 bg-white/5 backdrop-blur",
  neo: "neo-card bg-[var(--neo-search)] text-black",
};

export function LayoutStyleToggle({ variant = "glass" }: LayoutStyleToggleProps) {
  const { layoutStyle, setLayoutStyle } = useLayoutStyle();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const activeIndex = STYLE_OPTIONS.findIndex((s) => s.id === layoutStyle);
  const nextStyle = STYLE_OPTIONS[(activeIndex + 1) % STYLE_OPTIONS.length] ?? STYLE_OPTIONS[0];
  const activeLabel = mounted ? (STYLE_OPTIONS[activeIndex]?.shortLabel ?? "Neo") : "Neo";

  if (!mounted) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${variantClassNames[variant]}`} aria-hidden>
        <Paintbrush className="size-3" />Neo
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setLayoutStyle(nextStyle.id)}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${variantClassNames[variant]}`}
      title={`当前：${STYLE_OPTIONS[activeIndex]?.label}。点击切换为 ${nextStyle.label}`}
    >
      <Paintbrush className="size-3" /><span>{activeLabel}</span>
    </button>
  );
}
