"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

type DownloadButtonProps = {
  compact?: boolean;
  modId: string;
  downloadUrl: string;
  downloadCount: number;
};

export function DownloadButton({ compact = false, modId, downloadUrl, downloadCount }: DownloadButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const hasDownload = Boolean(downloadUrl.trim());

  const handleDownload = async () => {
    if (!hasDownload || isPending) return;

    setIsPending(true);

    try {
      const response = await fetch(`/api/mods/${modId}/download`, { method: "POST" });
      const result = (await response.json()) as { ok?: boolean; error?: string; downloadUrl?: string };

      if (!response.ok || !result.ok || !result.downloadUrl) return;
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={!hasDownload || isPending}
      className={`inline-flex w-full items-center justify-center gap-2 border-4 border-black font-black uppercase shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${compact ? "h-11 px-3 text-[11px] tracking-[0.12em]" : "h-14 px-5 text-sm tracking-[0.16em]"} ${hasDownload ? "bg-[#FFD93D] text-black hover:-translate-y-0.5" : "cursor-not-allowed bg-white text-black/45"}`}
    >
      {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
      {isPending ? "跳转中" : hasDownload ? compact ? "直链下载" : `直链下载 ZIP · ${downloadCount}` : "暂未提供下载"}
    </button>
  );
}
