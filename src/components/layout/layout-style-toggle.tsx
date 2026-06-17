"use client";

import { useEffect, useState } from "react";
import { Paintbrush } from "lucide-react";

import { useLayoutStyle } from "@/components/layout/layout-style-provider";
import type { LayoutStyle } from "@/lib/layout-style/constants";

const STYLE_OPTIONS: { id: LayoutStyle; label: string; shortLabel: string; desc: string }[] = [
  { id: "zzz-immersive", label: "ZZZ 沉浸式", shortLabel: "ZZZ", desc: "深色背景 + 毛玻璃面板 + 多列布局" },
  { id: "neo-brutalism", label: "经典新粗野主义", shortLabel: "经典", desc: "亮色面板 + 粗黑边框 + 复古街机风" },
];

type ToggleVariant = "glass" | "neo";
const variantClassNames: Record<ToggleVariant, string> = {
  glass: "text-white/80 hover:text-white border-white/20 hover:border-white/40 bg-white/5 backdrop-blur",
  neo: "neo-card bg-[var(--neo-search)] text-black",
};

type LayoutStyleToggleProps = { variant: ToggleVariant };

export function LayoutStyleToggle({ variant }: LayoutStyleToggleProps) {
  const { layoutStyle, setLayoutStyle, isPending } = useLayoutStyle();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const activeIndex = STYLE_OPTIONS.findIndex((s) => s.id === layoutStyle);
  const nextStyle = STYLE_OPTIONS[(activeIndex + 1) % STYLE_OPTIONS.length] ?? STYLE_OPTIONS[0];
  const activeLabel = mounted ? (STYLE_OPTIONS[activeIndex]?.shortLabel ?? "ZZZ") : "ZZZ";

  const handleToggle = () => { setLayoutStyle(nextStyle.id); };

  if (!mounted) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${variantClassNames[variant]}`} aria-hidden>
        <Paintbrush className="size-3" />ZZZ
      </span>
    );
  }

  return (
    <button type="button" onClick={handleToggle} disabled={isPending}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition disabled:pointer-events-none disabled:opacity-50 ${variantClassNames[variant]}`}
      title={`当前：${STYLE_OPTIONS[activeIndex]?.label}。点击切换为 ${nextStyle.label}`}
      aria-label={`当前视觉风格：${STYLE_OPTIONS[activeIndex]?.label}，点击切换为 ${nextStyle.label}`}
    >
      <Paintbrush className="size-3" /><span>{activeLabel}</span>
    </button>
  );
}
