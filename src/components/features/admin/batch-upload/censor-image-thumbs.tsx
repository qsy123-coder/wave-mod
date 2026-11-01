"use client";

import { useEffect, useMemo } from "react";
import { ImagePlus, RotateCcw, Sparkles } from "lucide-react";

type CensorImageThumbsProps = {
  files: File[];
  originals?: File[];
  onCensor: (index: number) => void;
  onReset?: () => void;
  emptyLabel?: string;
};

export function CensorImageThumbs({
  files,
  originals,
  onCensor,
  onReset,
  emptyLabel = "缺图（用占位图）",
}: CensorImageThumbsProps) {
  const urls = useMemo(
    () => files.slice(0, 6).map((file) => URL.createObjectURL(file)),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [urls]);

  if (files.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 border-4 border-black bg-[#ffd84f] px-2 py-1 font-black text-black">
        <ImagePlus className="size-3.5" /> {emptyLabel}
      </span>
    );
  }

  const hasCensored = Boolean(originals?.some((file, index) => file !== files[index]));

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-1.5">
        {urls.map((url, index) => {
          const censored = Boolean(originals && originals[index] && originals[index] !== files[index]);
          return (
            <div key={`${url}-${index}`} className="flex flex-col items-center gap-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`preview-${index + 1}`}
                className="size-14 border-2 border-black bg-white object-cover"
              />
              <button
                type="button"
                onClick={() => onCensor(index)}
                className="inline-flex items-center gap-0.5 border-2 border-black bg-[#ffd84f] px-1 py-0.5 text-[9px] font-black text-black"
                title="对这张图打码"
              >
                <Sparkles className="size-2.5" />
                {censored ? "重打" : "打码"}
              </button>
            </div>
          );
        })}
        <span className="font-black text-black">{files.length} 张</span>
      </div>

      {hasCensored && onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-0.5 border-2 border-black bg-white px-1 py-0.5 text-[9px] font-black text-black"
        >
          <RotateCcw className="size-2.5" /> 还原全部
        </button>
      ) : null}
    </div>
  );
}
