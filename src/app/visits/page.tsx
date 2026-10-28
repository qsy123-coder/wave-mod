import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { shanghaiDayKey } from "@/lib/engagement/store-core";
import { buildVisitRange, chartMax, summarizeVisits } from "@/lib/visits/aggregate";
import { VISITS_COOKIE, verifyVisitsCookieNow } from "@/lib/visits/cookie";
import { readVisitDays } from "@/lib/visits/store";
import type { VisitRow } from "@/lib/visits/types";

/**
 * 站点访问统计（站长专用）。
 *
 * 访问门槛是 `VISITS_TOKEN` + 签名 cookie，**不走 Supabase 登录**：
 * 2026-10 起 Supabase Auth 被免费出口额度锁成 402，`/admin` 进不去，
 * 而流量数据恰恰是额度挂掉时最需要看的东西。
 *
 * 这个页面不出现在任何导航里，metadata 也去索引；无凭证访问直接 404。
 */
export const metadata: Metadata = {
  title: "站点访问统计",
  robots: { index: false, follow: false },
};

/** 凭证在 cookie 里，页面必须按请求渲染 */
export const dynamic = "force-dynamic";

const RANGE_DAYS = 30;
const numberFormatter = new Intl.NumberFormat("zh-CN");

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

/** `2026-10-28` → `10-28`，图上只显示月日 */
function shortDate(date: string) {
  return date.slice(5);
}

function buildLinePath(days: VisitRow[], pick: (row: VisitRow) => number, max: number): string {
  const width = 720;
  const height = 220;
  const padX = 8;
  const padY = 16;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const step = days.length > 1 ? innerWidth / (days.length - 1) : 0;

  return days
    .map((row, index) => {
      const x = padX + step * index;
      const y = height - padY - (pick(row) / max) * innerHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function VisitChart({ days }: { days: VisitRow[] }) {
  const max = chartMax(days, (row) => Math.max(row.uv, row.pv));
  const uvPath = buildLinePath(days, (row) => row.uv, max);
  const pvPath = buildLinePath(days, (row) => row.pv, max);
  const last = days[days.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-black uppercase tracking-[0.14em]">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 border-2 border-black bg-black" />UV
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 border-2 border-black bg-[var(--neo-accent)]" />PV
        </span>
        <span className="font-bold normal-case tracking-normal text-black/50">纵轴上限 {formatNumber(max)}</span>
      </div>

      <svg
        viewBox="0 0 720 220"
        role="img"
        aria-label={`近 ${days.length} 天访问趋势`}
        className="h-auto w-full border-4 border-black bg-white"
      >
        {/* 三条横网格：0 / 中位 / 上限 */}
        {[0, 0.5, 1].map((ratio) => {
          const y = 16 + (1 - ratio) * (220 - 32);
          return (
            <line
              key={ratio}
              x1={8}
              x2={712}
              y1={y}
              y2={y}
              stroke="#000"
              strokeOpacity={ratio === 0 ? 0.55 : 0.15}
              strokeWidth={ratio === 0 ? 2 : 1}
            />
          );
        })}

        <path d={uvPath} fill="none" stroke="#000000" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {/* 用 style 而不是 stroke 属性：var() 在呈现属性里各浏览器支持不一致 */}
        <path
          d={pvPath}
          fill="none"
          style={{ stroke: "var(--neo-accent)" }}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 今天的两个点标出来，避免满屏线里找不到当前位置 */}
        {last ? (
          <>
            <circle
              cx={712}
              cy={16 + (1 - last.uv / max) * (220 - 32)}
              r={5}
              fill="#000"
              stroke="#fff"
              strokeWidth={2}
            />
            <circle
              cx={712}
              cy={16 + (1 - last.pv / max) * (220 - 32)}
              r={5}
              style={{ fill: "var(--neo-accent)" }}
              stroke="#fff"
              strokeWidth={2}
            />
          </>
        ) : null}
      </svg>

      <div className="mt-2 flex justify-between text-xs font-bold text-black/60">
        <span>{days[0] ? shortDate(days[0].date) : ""}</span>
        <span>{days[Math.floor(days.length / 2)] ? shortDate(days[Math.floor(days.length / 2)].date) : ""}</span>
        <span>{last ? shortDate(last.date) : ""}</span>
      </div>
    </div>
  );
}

function DeltaBadge({ delta, label }: { delta: number | null; label: string }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[11px] font-black text-black/50">
        {label} —
      </span>
    );
  }

  const positive = delta > 0;
  const flat = delta === 0;
  const className = flat
    ? "border-2 border-black bg-white text-black/60"
    : positive
      ? "border-2 border-black bg-[var(--neo-secondary)] text-black"
      : "border-2 border-black bg-[var(--neo-accent)] text-black";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-black ${className}`}>
      {label} {positive ? "+" : ""}
      {formatNumber(delta)}
    </span>
  );
}

function MetricCard({
  title,
  accent,
  row,
  uvDelta = null,
  pvDelta = null,
  showDeltas = true,
}: {
  title: string;
  accent: string;
  row: VisitRow;
  uvDelta?: number | null;
  pvDelta?: number | null;
  /** 昨日卡片不需要环比（它已经是基准），只显示数字 */
  showDeltas?: boolean;
}) {
  return (
    <div className="border-4 border-black p-5 text-black shadow-[6px_6px_0px_0px_#000]" style={{ background: accent }}>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-black/60">{title}</p>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-4xl font-black leading-none">{formatNumber(row.uv)}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-black/60">UV 访客</p>
        </div>
        <div>
          <p className="text-3xl font-black leading-none">{formatNumber(row.pv)}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-black/60">PV 浏览</p>
        </div>
      </div>
      {showDeltas ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <DeltaBadge delta={uvDelta} label="UV" />
          <DeltaBadge delta={pvDelta} label="PV" />
        </div>
      ) : null}
    </div>
  );
}

export default async function VisitsPage({ searchParams }: PageProps) {
  const token = process.env.VISITS_TOKEN?.trim();
  if (!token) notFound();

  const params = await searchParams;
  const rawKey = params.key;
  const key = typeof rawKey === "string" ? rawKey : "";

  const jar = await cookies();
  const authed = verifyVisitsCookieNow(token, jar.get(VISITS_COOKIE)?.value);

  if (!authed) {
    // 带密钥来的交给 /visits/unlock 发凭证（Server Component 不能写 cookie）
    if (key) redirect(`/visits/unlock?key=${encodeURIComponent(key)}`);
    notFound();
  }

  const today = shanghaiDayKey();
  const rows = await readVisitDays(RANGE_DAYS, today);
  const days = rows ? buildVisitRange(rows, RANGE_DAYS, today) : [];
  const summary = summarizeVisits(days, today);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-black/50">Site Analytics</p>
        <h1 className="mt-1 text-3xl font-black">站点访问统计</h1>
        <p className="mt-2 text-sm font-bold text-black/60">
          按上海日历日统计 · 同一设备同一天只计 1 个 UV · 爬虫不计入
        </p>
      </header>

      {rows === null ? (
        <section className="border-4 border-black bg-[var(--neo-accent)] p-5 text-black shadow-[6px_6px_0px_0px_#000]">
          <p className="text-lg font-black">数据暂不可用</p>
          <p className="mt-2 text-sm font-bold">
            读不到访问统计服务（香港计数服务未响应）。这里刻意不显示 0 —— 0 会被误读成「没人来」。
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              title="今日"
              accent="var(--neo-secondary)"
              row={summary.today}
              uvDelta={summary.uvDelta}
              pvDelta={summary.pvDelta}
            />
            <MetricCard title="昨日" accent="#ffffff" row={summary.yesterday} showDeltas={false} />
          </section>

          <section className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
            <div className="mb-3 inline-flex items-center gap-2 border-4 border-black bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em]">
              近 {RANGE_DAYS} 天趋势
            </div>
            <VisitChart days={days} />
          </section>

          <section className="border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_#000]">
            <div className="border-b-4 border-black bg-[var(--neo-panel)] px-4 py-3 text-xs font-black uppercase tracking-[0.14em]">
              每日明细（最近 {RANGE_DAYS} 天）
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-black text-white">
                  <tr>
                    <th className="px-4 py-2 text-left font-black">日期</th>
                    <th className="px-4 py-2 text-right font-black">UV</th>
                    <th className="px-4 py-2 text-right font-black">PV</th>
                    <th className="px-4 py-2 text-right font-black">PV/UV</th>
                  </tr>
                </thead>
                <tbody>
                  {days
                    .slice()
                    .reverse()
                    .map((row) => (
                      <tr key={row.date} className="border-b-2 border-black/10 last:border-b-0">
                        <td className="px-4 py-2 font-bold">{row.date}</td>
                        <td className="px-4 py-2 text-right font-black">{formatNumber(row.uv)}</td>
                        <td className="px-4 py-2 text-right font-black">{formatNumber(row.pv)}</td>
                        <td className="px-4 py-2 text-right font-bold text-black/60">
                          {row.uv > 0 ? (row.pv / row.uv).toFixed(1) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs font-bold text-black/50">
            今天（{today}）的 UV/PV 会随着访客实时增长；本设备已标记为「不计入」，你自己的浏览不会污染数据。
          </p>
        </>
      )}
    </main>
  );
}
