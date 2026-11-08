"use client";

import { formatPity, formatRate } from "@/features/gacha/lib/format";
import { expectedFiveStarPulls, theoreticalMedianPull } from "@/features/gacha/lib/theory";
import type { PoolInsight } from "@/features/gacha/lib/types";

import { CumulativeChart, PityHistogram } from "./pity-charts";
import { PityBar } from "./pity-bar";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-white px-2.5 py-1.5">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/45">{label}</p>
      <p className="mt-0.5 text-sm font-black tabular-nums text-black">{value}</p>
    </div>
  );
}

export function PoolPanel({ pool }: { pool: PoolInsight }) {
  const completeCount = pool.intervals.filter((interval) => !interval.isLowerBound).length;
  const hasFeatured = pool.featuredAttempts > 0 || pool.featuredCycles.length > 0;

  return (
    <section className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black">{pool.poolName}</h3>
          <span className="border-2 border-black bg-[var(--neo-muted)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em]">
            {pool.groupLabel}
          </span>
        </div>
        <p className="text-[11px] font-black text-black/50">
          {pool.totalPulls} 抽 · {pool.fiveStarCount} 个五星
        </p>
      </header>

      <div className="mt-3 border-2 border-black bg-white px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/50">
            当前垫抽
          </p>
          <p className="text-2xl font-black tabular-nums">
            {pool.currentPityLowerBound ? "≥" : ""}
            {pool.currentPity}
            <span className="ml-1 text-xs font-black text-black/40">/ {pool.hardPity}</span>
          </p>
        </div>
        <div className="mt-2">
          <PityBar current={pool.currentPity} hardPity={pool.hardPity} />
        </div>
        <p className="mt-1.5 text-[10px] font-bold text-black/45">
          {pool.currentPity >= pool.hardPity
            ? "已经到硬保底"
            : `距硬保底还差 ${pool.hardPity - pool.currentPity} 抽`}
          {pool.currentPityLowerBound ? " · 历史可能被截断，实际只会更多" : ""}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="平均出金" value={formatPity(pool.averagePity)} />
        <Stat label="中位" value={formatPity(pool.medianPity)} />
        <Stat label="最欧" value={pool.bestPity === null ? "—" : String(pool.bestPity)} />
        <Stat label="最非" value={pool.worstPity === null ? "—" : String(pool.worstPity)} />
      </div>

      <p className="mt-1.5 text-[10px] font-bold text-black/45">
        {pool.hardPity === 50
          ? "新手池硬保底 50 抽，不套用分段软保底模型。"
          : `理论：平均 ${expectedFiveStarPulls().toFixed(1)} 抽 · 中位 ${theoreticalMedianPull()} 抽`}
      </p>

      {hasFeatured ? (
        <div className="mt-3 border-2 border-black bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/50">
              50/50 与 UP 成本
            </p>
            <p className="text-xs font-black tabular-nums">
              不歪率 {formatRate(pool.featuredWinRate)}
              <span className="ml-2 text-[10px] font-bold text-black/45">
                歪 {pool.featuredOffRate} / 参与 {pool.featuredAttempts}
              </span>
            </p>
          </div>
          <p className="mt-1 text-[10px] font-bold text-black/45">
            UP 平均成本 {formatPity(pool.featuredAveragePulls)} 抽
            {pool.featuredBestPulls === null
              ? ""
              : ` · 最欧 ${pool.featuredBestPulls} · 最非 ${pool.featuredWorstPulls}`}
            　（大保底那一发不计入 50/50 分母，成本含前置歪）
          </p>
        </div>
      ) : null}

      {completeCount >= 3 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="border-2 border-black bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/50">
              五星抽数分布
            </p>
            <PityHistogram bins={pool.distribution} />
          </div>
          <div className="border-2 border-black bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/50">
              累计出金率（实线实际 · 虚线理论）
            </p>
            <CumulativeChart
              points={pool.cumulative}
              hardPity={pool.hardPity}
              median={pool.medianPity}
            />
          </div>
        </div>
      ) : (
        <p className="mt-3 border-2 border-dashed border-black/30 px-3 py-2 text-[10px] font-bold text-black/45">
          完整五星区间不足 3 个，先不画分布曲线，避免样本太少误导判断。
        </p>
      )}
    </section>
  );
}
