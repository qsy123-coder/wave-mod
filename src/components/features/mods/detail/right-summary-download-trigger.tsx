"use client";

import { Download } from "lucide-react";

type RightSummaryDownloadTriggerProps = {
  className?: string;
};

export function RightSummaryDownloadTrigger({ className }: RightSummaryDownloadTriggerProps) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("wavemod:open-action-dock"))}
      className={className ?? "inline-flex h-12 w-full items-center justify-center gap-2 border-4 border-black bg-[#FFD93D] px-4 text-sm font-black uppercase tracking-[0.14em] shadow-[5px_5px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"}
    >
      <Download className="size-4" />下载 MOD
    </button>
  );
}
