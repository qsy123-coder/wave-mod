"use client";

import { useMemo, useState } from "react";

import { formatDay, formatPity } from "@/features/gacha/lib/format";
import { buildCostProfile } from "@/features/gacha/lib/stats";
import type { GachaRecord, Overview } from "@/features/gacha/lib/types";

type LedgerRow = {
  poolType: string;
  poolName: string;
  resourceId: number;
  name: string;
  time: string;
  pulls: number;
  isLowerBound: boolean;
  isOffRate: boolean;
};

/**
 * 五星账本：按时间倒序列出每一次五星，点开看这个角色/武器的完整获取成本。
 *
 * 成本口径与源项目一致：从上一个同名目标（或历史起点）开始算，包含前置歪。
 */
export function FiveStarLedger({
  overview,
  records,
}: {
  overview: Overview;
  records: GachaRecord[];
}) {
  const [selected, setSelected] = useState<{ poolType: string; resourceId: number } | null>(null);

  const rows = useMemo<LedgerRow[]>(() => {
    return overview.pools
      .flatMap((pool) =>
        pool.intervals.map((interval) => ({
          poolType: pool.poolType,
          poolName: pool.poolName,
          resourceId: interval.record.resourceId,
          name: interval.record.name,
          time: interval.record.time,
          pulls: interval.pulls,
          isLowerBound: interval.isLowerBound,
          isOffRate: interval.isOffRate,
        })),
      )
      .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  }, [overview]);

  const profile = useMemo(() => {
    if (!selected) return null;
    return buildCostProfile(selected.poolType, records, selected.resourceId);
  }, [selected, records]);

  if (rows.length === 0) {
    return (
      <p className="border-4 border-dashed border-black/40 bg-[var(--neo-panel)] px-4 py-8 text-center text-xs font-bold text-black/50">
        这段记录里还没有五星。官方只保留约 6 个月，更早的抽卡需要自己另行保存。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border-4 border-black bg-[var(--neo-panel)] text-black shadow-[6px_6px_0px_0px_#000]">
        <header className="border-b-4 border-black bg-[var(--neo-secondary)] px-4 py-2">
          <h2 className="text-sm font-black uppercase tracking-[0.14em]">
            五星账本 · {rows.length} 次
          </h2>
        </header>

        <ul className="divide-y-2 divide-black/10">
          {rows.map((row, index) => {
            const active =
              selected?.poolType === row.poolType && selected?.resourceId === row.resourceId;

            return (
              <li key={`${row.poolType}-${row.resourceId}-${row.time}-${index}`}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      active ? null : { poolType: row.poolType, resourceId: row.resourceId },
                    )
                  }
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition hover:bg-black/[0.04] ${
                    active ? "bg-black/[0.06]" : ""
                  }`}
                >
                  <span className="border-2 border-black bg-[var(--neo-secondary)] px-1.5 py-0.5 text-[10px] font-black">
                    5★
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-black">{row.name}</span>
                  {row.isOffRate ? (
                    <span className="border-2 border-black bg-[var(--neo-accent)] px-1.5 py-0.5 text-[9px] font-black text-black">
                      歪
                    </span>
                  ) : null}
                  <span className="text-[10px] font-bold text-black/45">{row.poolName}</span>
                  <span className="text-[10px] font-bold tabular-nums text-black/45">
                    {formatDay(row.time)}
                  </span>
                  <span className="w-14 text-right text-xs font-black tabular-nums">
                    {row.isLowerBound ? "≥" : ""}
                    {row.pulls} 抽
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selected && profile ? (
        <section className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-black">
                {profile.name}
                <span className="ml-2 text-[10px] font-black text-black/45">
                  {profile.poolName}
                </span>
              </h3>
              <p className="mt-0.5 text-[10px] font-bold text-black/45">
                {profile.acquisitions.length} 次获取 · 每次成本从上一个同名目标算起，含前置歪
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="border-2 border-black bg-white px-2 py-1 text-[10px] font-black hover:bg-black hover:text-white"
            >
              收起
            </button>
          </header>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="border-2 border-black bg-white px-2.5 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/45">
                总成本
              </p>
              <p className="mt-0.5 text-sm font-black tabular-nums">
                {profile.isLowerBound ? "≥" : ""}
                {profile.totalPulls} 抽
              </p>
            </div>
            <div className="border-2 border-black bg-white px-2.5 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/45">
                平均
              </p>
              <p className="mt-0.5 text-sm font-black tabular-nums">
                {formatPity(profile.averagePulls)} 抽
              </p>
            </div>
            <div className="border-2 border-black bg-white px-2.5 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/45">
                最欧
              </p>
              <p className="mt-0.5 text-sm font-black tabular-nums">
                {profile.bestPulls === null ? "—" : `${profile.bestPulls} 抽`}
              </p>
            </div>
            <div className="border-2 border-black bg-white px-2.5 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/45">
                最非
              </p>
              <p className="mt-0.5 text-sm font-black tabular-nums">
                {profile.worstPulls === null ? "—" : `${profile.worstPulls} 抽`}
              </p>
            </div>
          </div>

          <ol className="mt-3 space-y-1.5">
            {profile.acquisitions.map((acquisition, index) => (
              <li
                key={`${acquisition.record.time}-${index}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-black/15 bg-white px-2.5 py-1.5 text-[11px] font-bold"
              >
                <span className="text-black/45">#{index + 1}</span>
                <span className="tabular-nums">{formatDay(acquisition.record.time)}</span>
                <span className="tabular-nums">本次出金 {acquisition.pulls} 抽</span>
                <span className="tabular-nums">
                  前置歪 {acquisition.offRateBefore} 次
                </span>
                <span className="ml-auto tabular-nums">
                  {acquisition.isLowerBound ? "≥" : ""}
                  本次成本 {acquisition.costPulls} 抽
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
