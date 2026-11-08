"use client";

import { cumulativeProbability } from "@/features/gacha/lib/theory";
import type { DistributionBin } from "@/features/gacha/lib/types";

/** 五星抽数分布直方图（纯 SVG，不引入图表库） */
export function PityHistogram({ bins }: { bins: DistributionBin[] }) {
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const chartWidth = 480;
  const chartHeight = 168;
  const baseline = 138;
  const barArea = 108;
  const slot = chartWidth / bins.length;
  const barWidth = slot - 10;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="h-44 w-full"
      role="img"
      aria-label="五星抽数分布直方图"
    >
      <line x1="0" y1={baseline} x2={chartWidth} y2={baseline} stroke="currentColor" strokeOpacity="0.25" />
      {bins.map((bin, index) => {
        const height = (bin.count / maxCount) * barArea;
        const x = index * slot + 5;

        return (
          <g key={bin.label}>
            <rect
              x={x}
              y={baseline - height}
              width={barWidth}
              height={Math.max(bin.count > 0 ? 4 : 0, height)}
              fill="var(--neo-secondary)"
              stroke="#000"
              strokeWidth="2.5"
            />
            {bin.count > 0 ? (
              <text
                x={x + barWidth / 2}
                y={baseline - height - 8}
                textAnchor="middle"
                fontSize="13"
                fontWeight="800"
                fill="currentColor"
              >
                {bin.count}
              </text>
            ) : null}
            <text
              x={x + barWidth / 2}
              y={baseline + 20}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="currentColor"
              fillOpacity="0.6"
            >
              {bin.start}
            </text>
          </g>
        );
      })}
      <text
        x={chartWidth - 2}
        y={baseline + 20}
        textAnchor="end"
        fontSize="12"
        fontWeight="700"
        fill="currentColor"
        fillOpacity="0.6"
      >
        {bins.at(-1)?.end ?? 80} 抽
      </text>
    </svg>
  );
}

type CumulativeChartProps = {
  points: { pull: number; percentage: number }[];
  hardPity: number;
  median: number | null;
};

/**
 * 实际累计出金率 vs 规则模型。
 *
 * 实线是玩家自己的经验分布，虚线是官方分段软保底模型 —— 两条线放在一起，
 * 玩家能直观看到「我的出金速度」和「理论值」差多少。
 */
export function CumulativeChart({ points, hardPity, median }: CumulativeChartProps) {
  const chartWidth = 480;
  const chartHeight = 200;
  const left = 34;
  const right = 466;
  const top = 18;
  const bottom = 158;

  const xOf = (pull: number) => left + ((pull - 1) / Math.max(1, hardPity - 1)) * (right - left);
  const yOf = (percentage: number) => bottom - (percentage / 100) * (bottom - top);

  const actualPath =
    points.length === 0
      ? ""
      : points
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"}${xOf(point.pull).toFixed(1)},${yOf(point.percentage).toFixed(1)}`,
          )
          .join(" ");

  const theoryCommands: string[] = [];
  for (let pull = 1; pull <= hardPity; pull++) {
    const percentage = cumulativeProbability(pull) * 100;
    theoryCommands.push(`${pull === 1 ? "M" : "L"}${xOf(pull).toFixed(1)},${yOf(percentage).toFixed(1)}`);
  }
  const theoryPath = theoryCommands.join(" ");

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="h-52 w-full"
      role="img"
      aria-label="累计出金率曲线"
    >
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line
            x1={left}
            y1={yOf(tick)}
            x2={right}
            y2={yOf(tick)}
            stroke="currentColor"
            strokeOpacity={tick === 0 ? 0.3 : 0.14}
            strokeDasharray={tick === 0 ? undefined : "4 5"}
          />
          <text x={left - 8} y={yOf(tick) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.55">
            {tick}%
          </text>
        </g>
      ))}

      {[1, Math.round(hardPity / 2), hardPity].map((pull) => (
        <text key={pull} x={xOf(pull)} y={bottom + 20} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.55">
          {pull}
        </text>
      ))}

      {median !== null ? (
        <line
          x1={xOf(median)}
          y1={top}
          x2={xOf(median)}
          y2={bottom}
          stroke="var(--neo-accent)"
          strokeWidth="2"
          strokeDasharray="6 5"
          strokeOpacity="0.7"
        />
      ) : null}

      <path d={theoryPath} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2.5" strokeDasharray="6 6" />
      <path d={actualPath} fill="none" stroke="var(--neo-accent)" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}
