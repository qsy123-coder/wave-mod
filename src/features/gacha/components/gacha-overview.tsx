"use client";

import { formatPity, formatRate } from "@/features/gacha/lib/format";
import { expectedFiveStarPulls, expectedUpPulls } from "@/features/gacha/lib/theory";
import type { Overview } from "@/features/gacha/lib/types";

import { PityBar } from "./pity-bar";

function MetricTile({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="border-4 border-black bg-white px-4 py-3 shadow-[4px_4px_0px_0px_#000]">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/50">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-black">
        {value}
        {unit ? <span className="ml-1 text-xs font-black text-black/50">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] font-bold text-black/45">{hint}</p> : null}
    </div>
  );
}

export function GachaOverview({ overview }: { overview: Overview }) {
  const theoryAverage = expectedFiveStarPulls();
  const theoryUp = expectedUpPulls();

  const averageDelta =
    overview.averagePity === null ? null : overview.averagePity - theoryAverage;
  const featuredDelta =
    overview.featuredWinRate === null ? null : overview.featuredWinRate - 50;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile label="总唤取" value={overview.totalPulls} unit="抽" />
        <MetricTile
          label="五星"
          value={overview.fiveStarCount}
          unit="个"
          hint={`出金率 ${formatRate(overview.fiveStarRate)}`}
        />
        <MetricTile
          label="平均出金"
          value={formatPity(overview.averagePity)}
          unit="抽"
          hint={`理论 ${theoryAverage.toFixed(1)}`}
        />
        <MetricTile
          label="最欧"
          value={overview.bestPity === null ? "—" : overview.bestPity}
          unit="抽"
          hint={overview.medianPity === null ? undefined : `中位 ${formatPity(overview.medianPity)}`}
        />
        <MetricTile
          label="UP 不歪率"
          value={formatRate(overview.featuredWinRate)}
          hint={
            overview.featuredAttempts > 0
              ? `${overview.featuredWins} / ${overview.featuredAttempts} 次 50/50`
              : "还没有 50/50 样本"
          }
        />
      </div>

      <section className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
        <h2 className="text-sm font-black uppercase tracking-[0.14em]">和理论值对照</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="border-2 border-black bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/50">
              平均出金 vs 理论
            </p>
            <p className="mt-1 text-lg font-black tabular-nums">
              {formatPity(overview.averagePity)} 抽
              <span className="ml-2 text-xs font-black text-black/50">
                {averageDelta === null
                  ? "样本不足"
                  : `${averageDelta >= 0 ? "+" : ""}${averageDelta.toFixed(1)} 抽`}
              </span>
            </p>
            <p className="mt-1 text-[11px] font-semibold text-black/50">
              官方分段软保底模型的长期期望：{theoryAverage.toFixed(1)} 抽
            </p>
          </div>

          <div className="border-2 border-black bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/50">
              不歪率 vs 50%
            </p>
            <p className="mt-1 text-lg font-black tabular-nums">
              {formatRate(overview.featuredWinRate)}
              <span className="ml-2 text-xs font-black text-black/50">
                {featuredDelta === null
                  ? "还没有 50/50 样本"
                  : `${featuredDelta >= 0 ? "+" : ""}${featuredDelta.toFixed(1)} 个百分点`}
              </span>
            </p>
            <p className="mt-1 text-[11px] font-semibold text-black/50">
              UP 成本理论期望：{theoryUp.toFixed(2)} 抽（含前置歪）
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] font-semibold leading-relaxed text-black/50">
          样本较少时数字波动很大，这只是对照，不是「欧非判决」。历史被官方截断的首个区间已标 ≥，不计入平均值。
        </p>
      </section>

      <section className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
        <h2 className="text-sm font-black uppercase tracking-[0.14em]">各卡池垫抽</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {overview.pools.map((pool) => (
            <div key={pool.poolType} className="border-2 border-black bg-white px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-black">{pool.poolName}</p>
                <p className="text-xs font-black tabular-nums">
                  {pool.currentPityLowerBound ? "≥" : ""}
                  {pool.currentPity}
                  <span className="text-black/40"> / {pool.hardPity}</span>
                </p>
              </div>
              <div className="mt-2">
                <PityBar current={pool.currentPity} hardPity={pool.hardPity} />
              </div>
              <p className="mt-1.5 text-[10px] font-bold text-black/45">
                {pool.totalPulls} 抽 · {pool.fiveStarCount} 个五星
                {pool.averagePity === null ? "" : ` · 平均 ${formatPity(pool.averagePity)}`}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
