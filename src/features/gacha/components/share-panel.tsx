"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatRange, maskUid } from "@/features/gacha/lib/format";
import { renderShareCard } from "@/features/gacha/lib/share-card";
import type { Overview } from "@/features/gacha/lib/types";

/**
 * 分享图预览与下载。
 *
 * 图片完全在浏览器里画出来，既不经过服务端，也不会出现在网络请求里 ——
 * 这是「不落库」承诺的一部分，所以这里不用 `<Image>` 也不需要任何上传接口。
 */
export function SharePanel({ overview, uid }: { overview: Overview; uid: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(false);

  const payload = useMemo(
    () => ({
      uidMasked: maskUid(uid),
      range: formatRange(overview.earliestTime, overview.latestTime),
      totalPulls: overview.totalPulls,
      fiveStarRate: overview.fiveStarRate,
      averagePity: overview.averagePity,
      winRate: overview.featuredWinRate,
      pools: overview.pools
        .slice()
        .sort((a, b) => b.currentPity - a.currentPity)
        .map((pool) => ({
          name: pool.poolName,
          pity: pool.currentPity,
          hardPity: pool.hardPity,
        })),
    }),
    [overview, uid],
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    renderShareCard(payload)
      .then((image) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(image);
        setBlob(image);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [payload]);

  function handleDownload() {
    if (!blob) {
      toast.error("分享图还没生成好，稍等一下");
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `唤取分析-${maskUid(uid)}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("分享图已保存");
  }

  return (
    <section className="border-4 border-black bg-[var(--neo-panel)] p-4 text-black shadow-[6px_6px_0px_0px_#000]">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.14em]">分享图</h2>
          <p className="mt-1 text-[11px] font-bold text-black/50">
            UID 已打码：{maskUid(uid)}。图片在本机生成，不上传、不保存。
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!blob}
          className="border-4 border-black bg-[var(--neo-accent)] px-4 py-2 text-xs font-black text-black shadow-[4px_4px_0px_0px_#000] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下载 PNG
        </button>
      </header>

      <div className="mt-4 flex justify-center">
        {error ? (
          <p className="border-2 border-dashed border-black/30 px-4 py-8 text-xs font-bold text-black/50">
            分享图生成失败，可以稍后重试。其他分析结果不受影响。
          </p>
        ) : previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="唤取分析分享图预览"
            className="w-full max-w-[420px] border-4 border-black shadow-[6px_6px_0px_0px_#000]"
          />
        ) : (
          <div className="flex aspect-[4/5] w-full max-w-[420px] items-center justify-center border-4 border-black bg-white text-xs font-bold text-black/40">
            正在绘制分享图…
          </div>
        )}
      </div>
    </section>
  );
}
