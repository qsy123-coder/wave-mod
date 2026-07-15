"use client";

import { useState } from "react";
import { Cloud, Download, LoaderCircle } from "lucide-react";

import type { DriveLink } from "@/lib/mods-domain/types";

type DownloadButtonProps = {
  compact?: boolean;
  modId: string;
  downloadUrl: string | null;
  downloadCount: number;
  driveLinks: DriveLink[];
};

export function DownloadButton({ compact = false, modId, downloadUrl, downloadCount, driveLinks }: DownloadButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const hasDownload = Boolean(downloadUrl?.trim());

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

  if (!hasDownload && driveLinks.length === 0) return null;

  return (
    <div className="space-y-2">
      {hasDownload ? (
        <button
          type="button"
          onClick={handleDownload}
          disabled={isPending}
          className={`inline-flex w-full items-center justify-center gap-2 border-4 border-black bg-[#FFD93D] font-black uppercase text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${compact ? "h-11 px-3 text-[11px] tracking-[0.12em]" : "h-14 px-5 text-sm tracking-[0.16em]"}`}
        >
          {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          {isPending ? "跳转中" : compact ? "直链下载" : `直链下载 ZIP · ${downloadCount}`}
        </button>
      ) : null}

      {driveLinks.length > 0 ? (
        <div className="space-y-1.5">
          {driveLinks.map((drive) => (
            <a
              key={`${drive.platform}-${drive.url}`}
              href={drive.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex w-full items-center justify-center gap-2 border-4 border-black bg-[#C4B5FD] font-black uppercase text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${compact ? "h-11 px-3 text-[11px] tracking-[0.12em]" : "h-14 px-5 text-sm tracking-[0.16em]"}`}
            >
              <Cloud className="size-4" />
              {drive.platform}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
