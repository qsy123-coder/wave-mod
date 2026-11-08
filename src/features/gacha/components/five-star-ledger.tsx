"use client";

import { useMemo, useState } from "react";

import { formatDay, formatPity } from "@/features/gacha/lib/format";
import { buildCombinedCostProfile, buildCostProfile } from "@/features/gacha/lib/stats";
import type {
  Acquisition,
  CostProfile,
  GachaRecord,
  Overview,
  QualityLevel,
  ResourceType,
} from "@/features/gacha/lib/types";

import { ResourceAvatar } from "./resource-avatar";

type LedgerRow = {
  poolType: string;
  poolName: string;
  resourceId: number;
  resourceType: ResourceType;
  qualityLevel: QualityLevel;
  name: string;
  time: string;
  pulls: number;
  isLowerBound: boolean;
  isOffRate: boolean;
};

type ProfileMode = "role" | "weapon" | "combined";

type Selected = {
  poolType: string;
  resourceId: number;
  resourceType: ResourceType;
  mode: ProfileMode;
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-white px-2.5 py-1.5">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/45">{label}</p>
      <p className="mt-0.5 text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}

function ProfileTiles({ profile }: { profile: CostProfile }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile
        label="总成本"
        value={`${profile.isLowerBound ? "≥" : ""}${profile.totalPulls} 抽`}
      />
      <Tile label="平均" value={`${formatPity(profile.averagePulls)} 抽`} />
      <Tile label="最欧" value={profile.bestPulls === null ? "—" : `${profile.bestPulls} 抽`} />
      <Tile label="最非" value={profile.worstPulls === null ? "—" : `${profile.worstPulls} 抽`} />
    </div>
  );
}

type ListItem = { acquisition: Acquisition; kind?: "role" | "weapon" };

function AcquisitionList({ items }: { items: ListItem[] }) {
  if (items.length === 0) return null;

  return (
    <ol className="mt-3 space-y-1.5">
      {items.map(({ acquisition, kind }, index) => (
        <li
          key={`${acquisition.record.time}-${index}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-black/15 bg-white px-2.5 py-1.5 text-[11px] font-bold"
        >
          {kind ? (
            <span
              className={`border-2 border-black px-1.5 py-0.5 text-[9px] font-black ${
                kind === "role" ? "bg-[var(--neo-secondary)]" : "bg-[var(--neo-muted)]"
              }`}
            >
              {kind === "role" ? "角色" : "专武"}
            </span>
          ) : null}
          <span className="text-black/45">#{index + 1}</span>
          <span className="tabular-nums">{formatDay(acquisition.record.time)}</span>
          <span className="tabular-nums">本次出金 {acquisition.pulls} 抽</span>
          <span className="tabular-nums">前置歪 {acquisition.offRateBefore} 次</span>
          <span className="ml-auto tabular-nums">
            {acquisition.isLowerBound ? "≥" : ""}
            本次成本 {acquisition.costPulls} 抽
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 五星账本：按时间倒序列出每一次五星，点开看这个角色/武器的完整获取成本。
 *
 * 成本口径与源项目一致：从上一个同名目标（或历史起点）开始算，包含前置歪。
 * 角色如果能在资源包里找到专武映射，额外提供「角色 / 专武 / 合计」三种视角。
 */
export function FiveStarLedger({
  overview,
  records,
}: {
  overview: Overview;
  records: GachaRecord[];
}) {
  const [selected, setSelected] = useState<Selected | null>(null);

  const rows = useMemo<LedgerRow[]>(() => {
    return overview.pools
      .flatMap((pool) =>
        pool.intervals.map((interval) => ({
          poolType: pool.poolType,
          poolName: pool.poolName,
          resourceId: interval.record.resourceId,
          resourceType: interval.record.resourceType,
          qualityLevel: interval.record.qualityLevel,
          name: interval.record.name,
          time: interval.record.time,
          pulls: interval.pulls,
          isLowerBound: interval.isLowerBound,
          isOffRate: interval.isOffRate,
        })),
      )
      .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  }, [overview]);

  const selectedProfile = useMemo(() => {
    if (!selected) return null;
    return buildCostProfile(selected.poolType, records, selected.resourceId);
  }, [selected, records]);

  const combined = useMemo(() => {
    if (!selected) return null;
    return buildCombinedCostProfile(records, selected.poolType, selected.resourceId);
  }, [selected, records]);

  const hasSignature = Boolean(combined?.signatureWeaponId);

  const mode: ProfileMode = hasSignature ? (selected?.mode ?? "role") : "role";

  const header =
    mode === "weapon" && combined?.signatureWeaponId
      ? {
          resourceId: combined.signatureWeaponId,
          name: combined.weaponName ?? "专武",
          resourceType: "weapon" as ResourceType,
        }
      : selectedProfile
        ? {
            resourceId: selectedProfile.resourceId,
            name: selectedProfile.name,
            resourceType: selectedProfile.resourceType,
          }
        : null;

  const mergedItems: ListItem[] = useMemo(() => {
    if (!combined) return [];
    return [
      ...(combined.role?.acquisitions ?? []).map((acquisition) => ({
        acquisition,
        kind: "role" as const,
      })),
      ...(combined.weapon?.acquisitions ?? []).map((acquisition) => ({
        acquisition,
        kind: "weapon" as const,
      })),
    ].sort((a, b) =>
      a.acquisition.record.time < b.acquisition.record.time
        ? -1
        : a.acquisition.record.time > b.acquisition.record.time
          ? 1
          : 0,
    );
  }, [combined]);

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
                      active
                        ? null
                        : {
                            poolType: row.poolType,
                            resourceId: row.resourceId,
                            resourceType: row.resourceType,
                            mode: "role",
                          },
                    )
                  }
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition hover:bg-black/[0.04] ${
                    active ? "bg-black/[0.06]" : ""
                  }`}
                >
                  <span className="border-2 border-black bg-[var(--neo-secondary)] px-1.5 py-0.5 text-[10px] font-black">
                    5★
                  </span>
                  <ResourceAvatar
                    resourceId={row.resourceId}
                    name={row.name}
                    resourceType={row.resourceType}
                    qualityLevel={row.qualityLevel}
                    size="sm"
                  />
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

      {selected && selectedProfile && header ? (
        <section className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ResourceAvatar
                resourceId={header.resourceId}
                name={header.name}
                resourceType={header.resourceType}
                qualityLevel={5}
                size="lg"
              />
              <div>
                <h3 className="text-sm font-black">
                  {header.name}
                  <span className="ml-2 text-[10px] font-black text-black/45">
                    {mode === "weapon"
                      ? "专武 · 武器池 2/9/11"
                      : selectedProfile.poolName}
                  </span>
                </h3>
                <p className="mt-0.5 text-[10px] font-bold text-black/45">
                  {mode === "combined"
                    ? "角色 + 专武合计；角色按 UP 周期计成本，前置歪计入下一个 UP"
                    : mode === "weapon"
                      ? "专武获取成本，含前置歪"
                      : `${selectedProfile.acquisitions.length} 次获取 · 成本按 UP 周期计算，前置歪计入下一个 UP`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="border-2 border-black bg-white px-2 py-1 text-[10px] font-black hover:bg-black hover:text-white"
            >
              收起
            </button>
          </header>

          {hasSignature ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["role", "角色"],
                  ["weapon", "专武"],
                  ["combined", "合计"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setSelected((previous) => (previous ? { ...previous, mode: value } : previous))
                  }
                  className={`border-2 border-black px-2.5 py-1 text-[10px] font-black transition ${
                    mode === value ? "bg-black text-white" : "bg-white text-black hover:bg-black/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3">
            {mode === "role" ? (
              <>
                <ProfileTiles profile={selectedProfile} />
                <AcquisitionList
                  items={selectedProfile.acquisitions.map((acquisition) => ({ acquisition }))}
                />
              </>
            ) : null}

            {mode === "weapon" ? (
              combined?.weapon ? (
                <>
                  <ProfileTiles profile={combined.weapon} />
                  <AcquisitionList
                    items={combined.weapon.acquisitions.map((acquisition) => ({ acquisition }))}
                  />
                </>
              ) : (
                <p className="border-2 border-dashed border-black/30 px-3 py-6 text-center text-[11px] font-bold text-black/50">
                  还没有抽到 {combined?.weaponName ?? "这把专武"}。
                  <br />
                  专武成本只统计活动 / 新旅 / 联动武器池（2、9、11），常驻武器池不计入。
                </p>
              )
            ) : null}

            {mode === "combined" ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Tile
                    label="角色"
                    value={
                      combined?.role
                        ? `${combined.role.isLowerBound ? "≥" : ""}${combined.role.totalPulls} 抽`
                        : "未获取"
                    }
                  />
                  <Tile
                    label="专武"
                    value={
                      combined?.weapon
                        ? `${combined.weapon.isLowerBound ? "≥" : ""}${combined.weapon.totalPulls} 抽`
                        : "未获取"
                    }
                  />
                  <Tile
                    label="合计"
                    value={`${combined?.isLowerBound ? "≥" : ""}${combined?.totalPulls ?? 0} 抽`}
                  />
                </div>
                <p className="mt-1.5 text-[10px] font-bold text-black/45">
                  共 {combined?.totalCount ?? 0} 次获取
                  {combined?.averagePulls === null || combined?.averagePulls === undefined
                    ? ""
                    : ` · 平均 ${formatPity(combined.averagePulls)} 抽/次`}
                </p>
                <AcquisitionList items={mergedItems} />
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
