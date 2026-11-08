"use client";

import { ImageOff, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isCosStorageUrl } from "@/lib/cos/shared";
import type { AdminMod } from "@/lib/mods";

/**
 * 后台列表的「预览图管理」弹窗。
 *
 * 列表卡片只显示封面，但很多 MOD 有 4–10 张预览图 —— 之前点封面只能处理 images[0]，
 * 其余图只能去编辑页改 URL。这里把整条 MOD 的图都列出来，任意一张都能直接打码，
 * 打码结果按原下标写回 images，不会打乱顺序（第 0 张仍然是封面）。
 */

type ModImagesDialogProps = {
  mod: AdminMod | null;
  /** 正在读取/下载哪一张（按下标），用来禁用按钮并显示进度 */
  loadingIndex: number | null;
  onOpenChange: (open: boolean) => void;
  onCensor: (index: number) => void;
};

function imagesOf(mod: AdminMod): string[] {
  const images = mod.images ?? [];
  if (images.length > 0) return images;
  // 没有 images 时 coverImage 就是唯一一张，下标 0 与 replaceModImageAction 的语义一致
  return mod.coverImage ? [mod.coverImage] : [];
}

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(url.split("?")[0]?.split("/").pop() || "") || url;
  } catch {
    return url;
  }
}

export function ModImagesDialog({
  mod,
  loadingIndex,
  onOpenChange,
  onCensor,
}: ModImagesDialogProps) {
  const images = mod ? imagesOf(mod) : [];

  return (
    <Dialog open={Boolean(mod)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto border-4 border-black bg-[var(--neo-panel)] p-5 text-black">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">预览图管理</DialogTitle>
          <DialogDescription className="text-sm font-bold text-black/70">
            {mod ? `${mod.character} · ${mod.title}` : ""}
            {images.length > 0 ? ` ｜ 共 ${images.length} 张，点任意一张的「打码」处理。` : ""}
          </DialogDescription>
        </DialogHeader>

        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-3 border-4 border-black bg-white py-12 text-sm font-black text-black/60">
            <ImageOff className="size-8" />
            这条 MOD 没有可编辑的预览图
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((url, index) => {
              const busy = loadingIndex === index;
              return (
                <div
                  key={`${url}-${index}`}
                  className="border-4 border-black bg-[#fff8ef] p-2 shadow-[4px_4px_0_0_#000]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden border-2 border-black bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`预览图 ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 border-2 border-black bg-[#ffd84f] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]">
                      {index === 0 ? "封面" : `图 ${index + 1}`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[10px] font-bold text-black/55" title={url}>
                      {fileNameOf(url)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={loadingIndex !== null}
                      title={isCosStorageUrl(url) ? "给这张图打码" : "这张不是 COS 图，无法打码"}
                      onClick={() => onCensor(index)}
                    >
                      <Sparkles className="size-3.5" />
                      {busy ? "读取中…" : "打码"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 -mx-5 mt-1 border-t-4 border-black bg-[var(--neo-panel)] px-5 py-3">
          <p className="mr-auto text-xs font-black text-black/60">
            删除或新增图片请到编辑页处理。
          </p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
