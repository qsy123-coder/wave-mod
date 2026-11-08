"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BarChart3,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
} from "lucide-react";

import { formatRange, maskUid } from "@/features/gacha/lib/format";
import { buildOverview } from "@/features/gacha/lib/stats";
import type { GachaRecord, ServerRegion } from "@/features/gacha/lib/types";

import { FiveStarLedger } from "./five-star-ledger";
import { GachaOverview } from "./gacha-overview";
import { PoolPanel } from "./pool-panel";
import { SharePanel } from "./share-panel";

type FetchResponse = {
  uid: string;
  region: ServerRegion;
  fetchedAt: string;
  records: GachaRecord[];
  failedPools: { poolType: string; message: string }[];
};

type Status = "idle" | "loading" | "error" | "success";
type Tab = "overview" | "pools" | "ledger" | "share";

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: "overview", label: "总览", icon: Sparkles },
  { key: "pools", label: "卡池", icon: BarChart3 },
  { key: "ledger", label: "五星账本", icon: Swords },
  { key: "share", label: "分享图", icon: ImageIcon },
];

export function GachaWorkbench() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [data, setData] = useState<FetchResponse | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [showUid, setShowUid] = useState(false);

  const overview = useMemo(
    () => (data ? buildOverview(data.records) : null),
    [data],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setError("");
    setData(null);

    try {
      const response = await fetch("/api/gacha/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (FetchResponse & { message?: string })
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        setError(
          (payload && "message" in payload && payload.message) ||
            "分析失败，请检查链接后重试",
        );
        setStatus("error");
        return;
      }

      setData(payload as FetchResponse);
      setTab("overview");
      setStatus("success");
    } catch {
      setError("网络请求失败，请稍后重试");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[8px_8px_0px_0px_#000]"
      >
        <label htmlFor="gacha-url" className="text-sm font-black">
          粘贴官方唤取记录链接
        </label>
        <p className="mt-1 text-[11px] font-bold text-black/50">
          游戏内「唤取 → 唤取记录」页面里复制。链接包含一次性凭证，约 1 小时有效。
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="gacha-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?..."
            className="min-w-0 flex-1 border-4 border-black bg-white px-3 py-2.5 text-xs font-bold text-black outline-none placeholder:text-black/30 focus:bg-[var(--neo-secondary)]/20"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={status === "loading" || url.trim().length === 0}
            className="inline-flex items-center justify-center gap-2 border-4 border-black bg-[var(--neo-accent)] px-5 py-2.5 text-xs font-black text-black shadow-[4px_4px_0px_0px_#000] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                抓取 13 个卡池…
              </>
            ) : (
              <>
                <Search className="size-4" />
                开始分析
              </>
            )}
          </button>
        </div>

        <details className="mt-3 border-2 border-black/15 bg-white px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-black text-black/60">
            怎么拿到这条链接？
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] font-semibold leading-relaxed text-black/55">
            <li>打开游戏，进入「唤取」页面，切到「唤取记录」。</li>
            <li>在记录页面复制官方提供的链接（PC 端也可从 Client.log 中提取）。</li>
            <li>整条粘贴到上面的输入框，点击「开始分析」。</li>
          </ol>
          <p className="mt-2 text-[11px] font-bold text-[var(--neo-accent)]">
            链接大约 1 小时失效；失效后重新从游戏里复制即可。
          </p>
        </details>
      </form>

      {status === "error" ? (
        <div className="flex items-start gap-3 border-4 border-black bg-[var(--neo-accent)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-black">没能拿到记录</p>
            <p className="mt-1 text-xs font-bold text-black/70">{error}</p>
          </div>
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-24 animate-pulse border-4 border-black bg-[var(--neo-panel)] shadow-[6px_6px_0px_0px_#000]"
            />
          ))}
        </div>
      ) : null}

      {status === "success" && data && overview ? (
        <div className="space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3 border-4 border-black bg-[var(--neo-secondary)] px-4 py-2.5 text-black shadow-[6px_6px_0px_0px_#000]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-xs font-black">
                UID {showUid ? data.uid : maskUid(data.uid)}
                <button
                  type="button"
                  onClick={() => setShowUid((value) => !value)}
                  className="ml-2 inline-flex items-center gap-1 border-2 border-black bg-white px-1.5 py-0.5 text-[9px] font-black"
                >
                  {showUid ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  {showUid ? "隐藏" : "显示"}
                </button>
              </p>
              <p className="text-[10px] font-black text-black/55">
                {data.region === "cn" ? "国服" : "国际服"} ·{" "}
                {formatRange(overview.earliestTime, overview.latestTime)}
              </p>
            </div>
            <p className="inline-flex items-center gap-1.5 text-[10px] font-black text-black/55">
              <ShieldCheck className="size-3.5" />
              分析完即弃，未保存任何数据
            </p>
          </header>

          {data.failedPools.length > 0 ? (
            <div className="flex items-start gap-2 border-4 border-black bg-white p-3 text-black shadow-[4px_4px_0px_0px_#000]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="text-[11px] font-bold text-black/60">
                有 {data.failedPools.length} 个卡池没抓到（不影响其余结果）：
                {data.failedPools.map((pool) => pool.poolType).join("、")}。可以稍后重试。
              </p>
            </div>
          ) : null}

          {data.records.length === 0 ? (
            <div className="border-4 border-black bg-[var(--neo-panel)] px-4 py-10 text-center text-black shadow-[6px_6px_0px_0px_#000]">
              <p className="text-sm font-black">这个账号还没有可分析的唤取记录</p>
              <p className="mt-1 text-[11px] font-bold text-black/50">
                确认链接来自有抽卡记录的账号；官方通常只保留最近约 6 个月。
              </p>
            </div>
          ) : (
            <>
              <nav className="flex flex-wrap gap-2">
                {TABS.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setTab(item.key)}
                      className={`inline-flex items-center gap-1.5 border-4 border-black px-3 py-1.5 text-[11px] font-black shadow-[3px_3px_0px_0px_#000] transition ${
                        active
                          ? "bg-black text-white"
                          : "bg-[var(--neo-panel)] text-black hover:-translate-y-0.5"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              {tab === "overview" ? <GachaOverview overview={overview} /> : null}
              {tab === "pools" ? (
                <div className="space-y-4">
                  {overview.pools.map((pool) => (
                    <PoolPanel key={pool.poolType} pool={pool} />
                  ))}
                </div>
              ) : null}
              {tab === "ledger" ? (
                <FiveStarLedger overview={overview} records={data.records} />
              ) : null}
              {tab === "share" ? <SharePanel overview={overview} uid={data.uid} /> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
