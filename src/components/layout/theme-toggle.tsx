"use client";

import { ChevronDown, Palette } from "lucide-react";
import { useEffect, useState } from "react";

import { useTheme } from "@/components/layout/theme-provider";

const themes = [
  {
    id: "theme-arcade",
    label: "Arcade",
    color: "#FF6B6B",
    panel: "#FFFDF5",
    text: "#000000",
    desc: "奶油底 + 红黄街机风",
  },
  {
    id: "theme-neon-night",
    label: "Neon",
    color: "#00F0FF",
    panel: "#111827",
    text: "#FFFFFF",
    desc: "高对比冷色夜景霓虹",
  },
  {
    id: "theme-sunset-flyer",
    label: "Sunset",
    color: "#FF9B54",
    panel: "#2B1B17",
    text: "#FFF7ED",
    desc: "落日海报感暖色拼贴",
  },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const activeTheme = themes.find((item) => item.id === theme) ?? themes[0];

  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="neo-card inline-flex items-center gap-2 bg-[var(--neo-search)] px-3 py-2 text-black"
        aria-expanded={open}
        aria-label="展开风格切换"
      >
        <Palette className="size-4" />
        <span className="text-xs font-black uppercase tracking-[0.12em]">风格</span>
        <span className="inline-flex items-center border-4 border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[3px_3px_0px_0px_#000]" style={{ background: activeTheme.color }}>
          {activeTheme.label}
        </span>
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : "rotate-0"}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[320px] border-4 border-black bg-[#FFFDF5] p-3 shadow-[10px_10px_0px_0px_#000]">
          <div className="mb-3 border-4 border-black bg-[#FFD93D] px-3 py-2 shadow-[4px_4px_0px_0px_#000]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Theme Switcher</p>
            <p className="mt-1 text-sm font-black uppercase">选择页面风格</p>
          </div>

          <div className="grid gap-3">
            {themes.map((item, index) => {
              const isActive = mounted ? theme === item.id : index === 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTheme(item.id);
                    setOpen(false);
                  }}
                  className={`border-4 border-black p-3 text-left shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${isActive ? "rotate-[-1deg]" : "rotate-0"}`}
                  style={{ background: item.panel, color: item.text }}
                  aria-pressed={isActive}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.14em]">{item.label}</p>
                      <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">{item.desc}</p>
                    </div>
                    <div className="size-8 shrink-0 border-4 border-black shadow-[3px_3px_0px_0px_#000]" style={{ background: item.color }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
