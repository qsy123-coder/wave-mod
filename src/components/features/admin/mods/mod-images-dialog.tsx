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
 *
 * 多变体合并卡（同帖多个附件合并成一张卡）的图在 `variant_images`，不在 `images`：
 * 这里同样按变体分节列出，打码时把 `variant` 一起带回，写回 `variant_images[variant]`。
 */

type ModImagesDialogProps = {
  mod: AdminMod | null;
  /** 正在读取/下载哪张（main:<i> 或 variant:<label>:<i>），用来禁用按钮并显示进度 */
  loadingKey: string | null;
  onOpenChange: (open: boolean) => void;
  /** variant 为空 = 主图 images；否则是 variant_images 里的那个变体 */
  onCensor: (index: number, variant?: string) => void;
};

function imagesOf(mod: AdminMod): string[] {
  const images = mod.images ?? [];
  if (images.length > 0) return images;
  // 没有 images 时 coverImage 就是唯一一张，下标 0 与 replaceModImageAction 的语义一致
  return mod.coverImage ? [mod.coverImage] : [];
}

function variantGroupsOf(mod: AdminMod): { label: string; images: string[] }[] {
  return Object.entries(mod.variantImages ?? {})
    .map(([label, images]) => ({ label, images: images ?? [] }))
    .filter((group) => group.images.length > 0);
}

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(url.split("?")[0]?.split("/").pop() || "") || url;
  } catch {
    return url;
  }
}

function mainKey(index: number): string {
  return `main:${index}`;
}

function variantKey(label: string, index: number): string {
  return `variant:${label}:${index}`;
}

export function ModImagesDialog({
  mod,
  loadingKey,
  onOpenChange,
  onCensor,
}: ModImagesDialogProps) {
  const images = mod ? imagesOf(mod) : [];
  const variantGroups = mod ? variantGroupsOf(mod) : [];
  const total = images.length + variantGroups.reduce((n, g) => n + g.images.length, 0);

  return (
    <Dialog open={Boolean(mod)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto border-4 border-black bg-[var(--neo-panel)] p-5 text-black">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">预览图管理</DialogTitle>
          <DialogDescription className="text-sm font-bold text-black/70">
            {mod ? `${mod.character} · ${mod.title}` : ""}
            {total > 0 ? ` ｜ 共 ${total} 张，点任意一张的「打码」处理。` : ""}
          </DialogDescription>
        </DialogHeader>

        {total === 0 ? (
          <div className="flex flex-col items-center gap-3 border-4 border-black bg-white py-12 text-sm font-black text-black/60">
            <ImageOff className="size-8" />
            这条 MOD 没有可编辑的预览图
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((url, index) => {
                  const busy = loadingKey === mainKey(index);
                  return (
                    <ImageTile
                      key={mainKey(index)}
                      url={url}
                      index={index}
                      busy={busy}
                      onCensor={() => onCensor(index)}
                    />
                  );
                })}
              </div>
            )}

            {variantGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 border-l-4 border-black pl-2 text-xs font-black uppercase tracking-[0.14em] text-black/60">
                  变体 · {group.label}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {group.images.map((url, index) => {
                    const busy = loadingKey === variantKey(group.label, index);
                    return (
                      <ImageTile
                        key={variantKey(group.label, index)}
                        url={url}
                        index={index}
                        busy={busy}
                        onCensor={() => onCensor(index, group.label)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
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

function ImageTile({
  url,
  index,
  busy,
  onCensor,
}: {
  url: string;
  index: number;
  busy: boolean;
  onCensor: () => void;
}) {
  return (
    <div className="border-4 border-black bg-[#fff8ef] p-2 shadow-[4px_4px_0_0_#000]">
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
          disabled={busy}
          title={isCosStorageUrl(url) ? "给这张图打码" : "这张不是 COS 图，无法打码"}
          onClick={onCensor}
        >
          <Sparkles className="size-3.5" />
          {busy ? "读取中…" : "打码"}
        </Button>
      </div>
    </div>
  );
}
