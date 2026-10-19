"use client";

import { ChevronDown, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/layout/theme-provider";
import type { ThemeName } from "@/lib/theme/constants";

type ThemeOption = {
  id: ThemeName;
  /** 英文代号（按钮与选项标题） */
  label: string;
  /** 中文名（副标题） */
  zh: string;
  /** 页面大底色（色板预览第一格） */
  background: string;
  /** 主色（色板预览第二格） */
  color: string;
  /** 强调/辅色（色板预览第三格） */
  secondary: string;
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
    label: "Default",
    zh: "新野兽派",
    background: "#3A2418",
    color: "#FF6B6B",
    secondary: "#FFD93D",
    panel: "#FFFDF5",
    text: "#000000",
    desc: "褐色底 + 奶油面板 + 红/黄/紫",
  },
  "theme-soft": {
    label: "Soft",
    zh: "柔和野兽派",
    background: "#F5F5F5",
    color: "#F472B6",
    secondary: "#A3E635",
    panel: "#FFFFFF",
    text: "#1A1A1A",
    desc: "浅灰底 + 粉/青柠/天蓝",
  },
  "theme-macaron": {
    label: "Lavender",
    zh: "薰衣草",
    background: "#F6F0FA",
    color: "#FF9E7A",
    secondary: "#8FD9BE",
    panel: "#FFFAF5",
    text: "#2B2233",
    desc: "线上薰衣草 + 珊瑚薄荷",
  },
};

// 对象字符串键的遍历顺序＝插入顺序，所以下拉里的排列与上面声明一致。
const THEME_OPTIONS: readonly ThemeOption[] = (Object.keys(THEME_OPTION_BY_ID) as ThemeName[])
  .map((id) => ({ id, ...THEME_OPTION_BY_ID[id] }));

type ThemeToggleProps = {
  /**
   * desktop：头部右上角的下拉（`md:block`）；
   * mobile：移动端抽屉里的内联列表；
   * bar：手机导航栏上的紧凑入口（`md:hidden`），点开复用 mobile 那套列表。
   */
  variant?: "desktop" | "mobile" | "bar";
};

export function ThemeToggle({ variant = "desktop" }: ThemeToggleProps) {
  if (variant === "mobile") return <ThemeInlinePicker />;
  if (variant === "bar") return <ThemeBarMenu />;
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
        className="neo-card neo-card-sm inline-flex items-center gap-1.5 whitespace-nowrap bg-[var(--neo-search)] px-2.5 py-1.5 text-black"
        aria-expanded={open}
        aria-label="展开风格切换"
      >
        <Palette className="size-3.5" />
        <span className="text-[11px] font-black uppercase tracking-[0.1em]">风格</span>
        {mounted ? (
          <span className="inline-flex items-center border-2 border-black px-1.5 text-[9px] font-black uppercase leading-[1.1] shadow-[2px_2px_0px_0px_#000]" style={{ background: activeTheme.color }}>
            {activeTheme.label}
          </span>
        ) : (
          <span className="inline-flex items-center border-2 border-black px-1.5 text-[9px] font-black uppercase leading-[1.1] shadow-[2px_2px_0px_0px_#000]" style={{ background: THEME_OPTIONS[0].color }}>
            {THEME_OPTIONS[0].label}
          </span>
        )}
        <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : "rotate-0"}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[340px] border-4 border-black bg-[var(--neo-panel)] p-3 text-black shadow-[10px_10px_0px_0px_#000]">
          <div className="mb-3 border-4 border-black bg-[var(--neo-secondary)] px-3 py-2 text-black shadow-[4px_4px_0px_0px_#000]">
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
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-[0.14em]">
                        {item.label}
                        <span className="ml-1.5 text-[10px] font-bold normal-case tracking-normal opacity-65">{item.zh}</span>
                      </p>
                      <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">{item.desc}</p>
                    </div>
                    <div className="flex shrink-0 gap-1" aria-hidden>
                      <span className="size-6 border-[3px] border-black shadow-[2px_2px_0px_0px_#000]" style={{ background: item.background }} />
                      <span className="size-6 border-[3px] border-black shadow-[2px_2px_0px_0px_#000]" style={{ background: item.color }} />
                      <span className="size-6 border-[3px] border-black shadow-[2px_2px_0px_0px_#000]" style={{ background: item.secondary }} />
                    </div>
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
 * 手机导航栏上的紧凑入口。
 *
 * 桌面端那个「风格」下拉是 `hidden md:block`，手机上原先只能先进汉堡抽屉再找
 * 「页面风格」。这里把入口提到导航栏：按钮只留调色板 + 当前主色，点开**复用**
 * 抽屉里那套 `ThemeInlinePicker`（同一份选项元数据，不另写一套卡片）。
 *
 * 面板用 `fixed` 水平居中而不是 `absolute right-0`：按钮紧挨右侧汉堡，在 320px
 * 窄屏上向右锚定的 340px 面板会溢出屏幕。`--site-header-h` 由 header 的
 * ResizeObserver 实测写入，面板正好贴在头部下方。
 */
function ThemeBarMenu() {
  const { mounted, activeTheme } = useActiveTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 水合前按默认皮肤渲染，与 ThemeDropdown 的处理一致（避免读 cookie 造成 mismatch）
  const current = mounted ? activeTheme : THEME_OPTIONS[0];

  useEffect(() => {
    if (!open) return;

    // 点空白处收起。用 mousedown + contains（同 mods-toolbar / tool-download-card）：
    // 用 blur 会在点击落地前卸载面板，表现为「点了没反应」。
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    // `ml-auto` 在手机上是把「风格 + 汉堡」一起推到右边的那个元素；
    // 桌面上本组件 `md:hidden`，auto margin 不参与布局，不影响原排列。
    <div ref={rootRef} className="ml-auto md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`切换页面风格（当前：${current.zh}）`}
        title="切换页面风格"
        className="neo-card neo-card-sm inline-flex items-center gap-1.5 bg-[var(--neo-search)] px-2 py-2 text-black"
      >
        <Palette className="size-4" strokeWidth={2.5} />
        <span
          aria-hidden
          className="size-3.5 border-2 border-black shadow-[1px_1px_0px_0px_#000]"
          style={{ background: current.color }}
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="选择页面风格"
          className="fixed left-1/2 top-[calc(var(--site-header-h,0px)+10px)] z-50 max-h-[calc(100dvh-var(--site-header-h,0px)-20px)] w-[min(92vw,340px)] -translate-x-1/2 overflow-y-auto border-4 border-black bg-[var(--neo-panel)] p-3 shadow-[8px_8px_0px_0px_#000]"
        >
          <ThemeInlinePicker onSelect={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * 移动端内联选择器——放进导航抽屉里，也给导航栏的 `ThemeBarMenu` 复用。
 *
 * 原本风格切换只在 `md:block` 的头部触发，手机上**完全没有入口**。
 * 抽屉里用平铺列表而不是下拉：抽屉本身已是浮层，再叠一层绝对定位的弹层
 * 在窄屏上容易溢出视口。触控目标按规范拉到 44px 以上。
 */
function ThemeInlinePicker({ onSelect }: { onSelect?: () => void }) {
  const { theme, setTheme, mounted } = useActiveTheme();

  return (
    <div className="grid gap-3">
      <div className="border-4 border-black bg-[var(--neo-secondary)] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[6px_6px_0px_0px_#000]">
        页面风格
      </div>
      {THEME_OPTIONS.map((item, index) => {
        const isActive = mounted ? theme === item.id : index === 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTheme(item.id);
              onSelect?.();
            }}
            aria-pressed={isActive}
            className="flex min-h-11 items-center justify-between gap-3 border-4 border-black px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]"
            style={{ background: item.panel, color: item.text }}
          >
            <span className="min-w-0">
              <span className="block truncate">
                {item.label}
                <span className="ml-1.5 text-[10px] opacity-65">{item.zh}</span>
              </span>
              <span className="mt-0.5 block text-[11px] font-bold normal-case tracking-normal opacity-80">
                {item.desc}
              </span>
            </span>
            <span className="flex shrink-0 gap-1" aria-hidden>
              <span className="size-6 border-[3px] border-black shadow-[2px_2px_0px_0px_#000]" style={{ background: item.background }} />
              <span className="size-6 border-[3px] border-black shadow-[2px_2px_0px_0px_#000]" style={{ background: item.color }} />
              <span className="size-6 border-[3px] border-black shadow-[2px_2px_0px_0px_#000]" style={{ background: item.secondary }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
