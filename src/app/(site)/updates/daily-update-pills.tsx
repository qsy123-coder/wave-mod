"use client";

import { useEffect, useMemo, useState } from "react";

import type { DailyUpdateDay } from "@/lib/mods";
import { cn } from "@/lib/utils";

/**
 * 每日更新页的日期导航（参考角色分类页左侧 CharacterSidebar 的布局与风格）。
 * - ≥lg：左侧固定吸顶侧边栏（DailyDateSidebar），点击平滑滚动到对应日期分组。
 * - <lg：降级为一排可横向滚动的日期胶囊（DailyMobilePills）。
 * 二者共用同一条 scroll-spy 逻辑，激活项 = 当前视口可见的日期分组。
 */

/** 滚动监听：返回当前视口内最靠顶部的日期分组 id */
function useActiveDate(days: DailyUpdateDay[]) {
  const daysWithMods = useMemo(() => days.filter((d) => d.mods.length > 0), [days]);

  const [activeDate, setActiveDate] = useState<string | null>(
    daysWithMods.length > 0 ? daysWithMods[0].date : null,
  );

  useEffect(() => {
    const sections = daysWithMods
      .map((d) => document.getElementById(`day-${d.date}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const probe = 150; // 接近视口顶部即视作当前分组
        let current = sections[0].id.replace("day-", "");
        for (const sec of sections) {
          if (sec.getBoundingClientRect().top <= probe) {
            current = sec.id.replace("day-", "");
          } else {
            break;
          }
        }
        setActiveDate(current);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [daysWithMods]);

  return { daysWithMods, activeDate };
}

const scrollToDate = (date: string) => {
  const el = document.getElementById(`day-${date}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

/** 桌面端固定侧边栏（参考 CharacterSidebar 视觉） */
export function DailyDateSidebar({ days }: { days: DailyUpdateDay[] }) {
  const { daysWithMods, activeDate } = useActiveDate(days);

  return (
    <div className="hidden w-[180px] shrink-0 lg:block">
      <div className="sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto pb-8">
        <aside className="flex shrink-0 flex-col gap-1.5 border-4 border-black bg-[#fff8ef] p-2.5 shadow-[6px_6px_0px_0px_#000]">
          {daysWithMods.map((day) => {
            const isActive = day.date === activeDate;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => scrollToDate(day.date)}
                title={day.fullLabel}
                className={cn(
                  "flex items-center justify-between gap-2 border-[3px] border-black px-2.5 py-2 text-left text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
                  isActive ? "bg-[#ff7a7a] text-black" : "bg-white text-black/75",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {day.isToday ? <span className="size-1.5 shrink-0 rounded-full bg-black" /> : null}
                  {day.shortLabel}
                </span>
                <span className="shrink-0 text-[9px] opacity-50">+{day.count}</span>
              </button>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

/** 移动端降级：横向滚动的日期胶囊 */
export function DailyMobilePills({ days }: { days: DailyUpdateDay[] }) {
  const { daysWithMods, activeDate } = useActiveDate(days);

  if (daysWithMods.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 lg:hidden">
      {daysWithMods.map((day) => {
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => scrollToDate(day.date)}
            title={day.fullLabel}
            className={cn(
              "inline-flex items-center gap-1.5 border-[3px] border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
              day.isToday
                ? "bg-[var(--neo-accent)] text-black"
                : day.date === activeDate
                  ? "bg-[#ff7a7a] text-black"
                  : "bg-white text-black hover:-translate-y-0.5",
            )}
          >
            {day.isToday ? <span className="size-1.5 shrink-0 rounded-full bg-black" /> : null}
            {day.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
