"use client";

import { ChevronDown, Palette } from "lucide-react";
import { useEffect, useState } from "react";

import { useTheme } from "@/components/layout/theme-provider";
import type { ThemeName } from "@/lib/theme/constants";

type ThemeOption = {
  id: ThemeName;
  label: string;
  color: string;
  panel: string;
  text: string;
  desc: string;
};

/**
 * 皮肤的展示元数据，**按 ThemeName 全集声明**。
 *
 * 用 `Record<ThemeName, …>` 而不是数组，是为了拿到真正的编译期兜底：
 * 一旦 `THEMES`（`@/lib/theme/constants`）新增了皮肤，这里就会直接报
 * "缺少属性" —— 而漏加选项的后果（能存进 cookie、下拉里却选不到）是静默的，
 * 光靠自觉发现不了。
 */
const THEME_OPTION_BY_ID: Record<ThemeName, Omit<ThemeOption, "id">> = {
  "theme-arcade": {
    label: "Arcade",
    color: "#FF6B6B",
    panel: "#FFFDF5",
    text: "#000000",
    desc: "奶油底 + 红黄街机风",
  },
  "theme-neon-night": {
    label: "Neon",
    color: "#00F0FF",
    panel: "#111827",
    text: "#FFFFFF",
    desc: "高对比冷色夜景霓虹",
  },
  "theme-sunset-flyer": {
    label: "Sunset",
    color: "#FF9B54",
    panel: "#2B1B17",
    text: "#FFF7ED",
    desc: "落日海报感暖色拼贴",
  },
};

// 对象字符串键的遍历顺序＝插入顺序，所以下拉里的排列与上面声明一致。
const THEME_OPTIONS: readonly ThemeOption[] = (Object.keys(THEME_OPTION_BY_ID) as ThemeName[])
  .map((id) => ({ id, ...THEME_OPTION_BY_ID[id] }));

type ThemeToggleProps = {
  /** desktop：头部右上角的下拉；mobile：移动端抽屉里的内联列表 */
  variant?: "desktop" | "mobile";
};

export function ThemeToggle({ variant = "desktop" }: ThemeToggleProps) {
  if (variant === "mobile") return <ThemeInlinePicker />;
  return <ThemeDropdown />;
}

function useActiveTheme() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const activeTheme = THEME_OPTIONS.find((item) => item.id === theme) ?? THEME_OPTIONS[0];
  return { theme, setTheme, mounted, activeTheme };
}

/** 头部右上角的下拉——桌面端用 */
function ThemeDropdown() {
  const { theme, setTheme, mounted, activeTheme } = useActiveTheme();
  const [open, setOpen] = useState(false);

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
        {mounted ? (
          <span className="inline-flex items-center border-4 border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[3px_3px_0px_0px_#000]" style={{ background: activeTheme.color }}>
            {activeTheme.label}
          </span>
        ) : (
          <span className="inline-flex items-center border-4 border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[3px_3px_0px_0px_#000]" style={{ background: THEME_OPTIONS[0].color }}>
            {THEME_OPTIONS[0].label}
          </span>
        )}
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : "rotate-0"}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[320px] border-4 border-black bg-[#FFFDF5] p-3 shadow-[10px_10px_0px_0px_#000]">
          <div className="mb-3 border-4 border-black bg-[#FFD93D] px-3 py-2 shadow-[4px_4px_0px_0px_#000]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">Theme Switcher</p>
            <p className="mt-1 text-sm font-black uppercase">选择页面风格</p>
          </div>

          <div className="grid gap-3">
            {THEME_OPTIONS.map((item, index) => {
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

/**
 * 移动端内联选择器——放进导航抽屉里。
 *
 * 原本风格切换只在 `md:block` 的头部触发，手机上**完全没有入口**。
 * 抽屉里用平铺列表而不是下拉：抽屉本身已是浮层，再叠一层绝对定位的弹层
 * 在窄屏上容易溢出视口。触控目标按规范拉到 44px 以上。
 */
function ThemeInlinePicker() {
  const { theme, setTheme, mounted } = useActiveTheme();

  return (
    <div className="grid gap-3">
      <div className="border-4 border-black bg-[#FFD93D] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
        页面风格
      </div>
      {THEME_OPTIONS.map((item, index) => {
        const isActive = mounted ? theme === item.id : index === 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTheme(item.id)}
            aria-pressed={isActive}
            className="flex min-h-11 items-center justify-between gap-3 border-4 border-black px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]"
            style={{ background: item.panel, color: item.text }}
          >
            <span className="min-w-0">
              <span className="block truncate">{item.label}</span>
              <span className="mt-0.5 block text-[11px] font-bold normal-case tracking-normal opacity-80">
                {item.desc}
              </span>
            </span>
            <span className="size-8 shrink-0 border-4 border-black shadow-[3px_3px_0px_0px_#000]" style={{ background: item.color }} />
          </button>
        );
      })}
    </div>
  );
}
