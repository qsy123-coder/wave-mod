"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { ModCard } from "@/components/common/mod-card";
import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { MotionReveal } from "@/components/layout/motion-reveal";
import type { DailyUpdateDay } from "@/lib/mods";

type UpdatesGridProps = {
  days: DailyUpdateDay[];
  isLoggedIn?: boolean;
};

/**
 * 每日更新页卡片网格：点击卡片不再跳转到 /mods/[id]，
 * 改为在本页弹出 mod 详情抽屉（复用 ModDetailDrawer，按 modId 拉取详情）。
 * 日期分组从服务端传入（纯可序列化数据，作为 client props 安全）。
 */
export function UpdatesGrid({ days, isLoggedIn = false }: UpdatesGridProps) {
  const [drawerModId, setDrawerModId] = useState<string | null>(null);

  const daysWithMods = useMemo(() => days.filter((d) => d.mods.length > 0), [days]);

  const openDrawer = (modId: string) => setDrawerModId(modId);
  const closeDrawer = () => setDrawerModId(null);

  return (
    <>
      {daysWithMods.length > 0 ? (
        <div className="space-y-12">
          {daysWithMods.map((day, dayIdx) => (
            <section
              key={day.date}
              id={`day-${day.date}`}
              className="scroll-mt-28"
            >
              <div className="mb-4 flex items-center gap-3">
                <MotionReveal delay={0.04} rotate={-1}>
                  <h2 className="shrink-0 border-4 border-black bg-[var(--neo-secondary)] px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-black shadow-[5px_5px_0px_0px_#000]">
                    {day.fullLabel}
                  </h2>
                </MotionReveal>
                <div className="h-px flex-1 bg-white/40 shadow-[0_1px_0_#000]" />
                <span className="shrink-0 border-4 border-black bg-[var(--neo-muted)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000]">
                  +{day.count}
                </span>
              </div>

              <div className="grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {day.mods.map((mod, idx) => (
                  <MotionReveal key={mod.id} delay={0.02 + idx * 0.02} y={12} rotate={idx % 2 === 0 ? -1 : 1}>
                    <ModCard
                      mod={mod}
                      href={`/mods/${mod.id}`}
                      linkMode="card"
                      onCardClick={openDrawer}
                      isLoggedIn={isLoggedIn}
                      variant="list"
                      className="bg-[#fff8ef] p-2.5"
                      imageAspectClassName="aspect-[5/6] sm:aspect-[4/5]"
                      imagePriority={dayIdx === 0 && idx < 4}
                      imageFetchPriority={dayIdx === 0 && idx < 4 ? "high" : "auto"}
                      imageSizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                      mediaTopRight={
                        mod.downloadUrl ? (
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center border-2 border-black bg-[#4ade80] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black shadow-[2px_2px_0px_0px_#000]">
                              直链下载
                            </span>
                          </div>
                        ) : undefined
                      }
                      mediaTopRightClassName="absolute right-2 top-4"
                    />
                  </MotionReveal>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="border-4 border-black bg-white p-8 text-black shadow-[10px_10px_0px_0px_#000]">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]">
            <Download className="size-4" />
            最近 14 天暂无新 mod 更新
          </div>
          <p className="mt-2 text-sm font-bold leading-7 text-black/75">
            主理人每天会陆续上新，可以稍后再来看看，或到
            <Link href="/mods" className="mx-1 inline-block border-2 border-black bg-[var(--neo-secondary)] px-1.5 py-0.5 font-black">MOD 列表</Link>
            浏览全部内容。
          </p>
        </div>
      )}

      {drawerModId && (
        <ModDetailDrawer
          isLoggedIn={isLoggedIn}
          modId={drawerModId}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
