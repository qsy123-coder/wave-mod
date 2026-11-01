"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Scan, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CensorEffect = "mosaic" | "blur";

type Selection = {
  /** 相对图片宽高的比例，0–1 */
  x: number;
  y: number;
  w: number;
  h: number;
};

type CensorDialogProps = {
  open: boolean;
  file: File | null;
  onOpenChange: (open: boolean) => void;
  onApply: (file: File) => void;
};

const MIN_SELECTION = 0.02;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeSelection(start: { x: number; y: number }, end: { x: number; y: number }): Selection {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  return { x, y, w, h };
}

export function CensorDialog({ open, file, onOpenChange, onApply }: CensorDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [effect, setEffect] = useState<CensorEffect>("mosaic");
  const [strength, setStrength] = useState(14);
  const [dragging, setDragging] = useState(false);
  const [applying, setApplying] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setSelection(null);
    setEffect("mosaic");
    setStrength(14);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) {
      setSelection(null);
      setDragging(false);
      dragStartRef.current = null;
    }
  }, [open]);

  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    // 拖到图片外的黑色留白也接受：clamp 到 0–1，选区贴着图片边缘
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    dragStartRef.current = point;
    setDragging(true);
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging || !dragStartRef.current) return;
    setSelection(normalizeSelection(dragStartRef.current, pointFromEvent(event)));
  };

  const handlePointerUp = () => {
    setDragging(false);
    setSelection((current) => {
      if (!current || current.w < MIN_SELECTION || current.h < MIN_SELECTION) return null;
      return current;
    });
  };

  const selectAll = () => setSelection({ x: 0, y: 0, w: 1, h: 1 });

  const applyCensor = async () => {
    const image = imageRef.current;
    if (!image || !file || !selection) {
      toast.error("先在图上拖一个矩形（或点「全图」）。");
      return;
    }

    setApplying(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("浏览器不支持 Canvas");

      ctx.drawImage(image, 0, 0);

      const sx = Math.max(0, Math.round(selection.x * canvas.width));
      const sy = Math.max(0, Math.round(selection.y * canvas.height));
      const sw = Math.max(1, Math.round(selection.w * canvas.width));
      const sh = Math.max(1, Math.round(selection.h * canvas.height));

      if (effect === "mosaic") {
        const block = Math.max(4, Math.round(strength));
        const tw = Math.max(1, Math.round(sw / block));
        const th = Math.max(1, Math.round(sh / block));
        const temp = document.createElement("canvas");
        temp.width = tw;
        temp.height = th;
        const tempCtx = temp.getContext("2d");
        if (!tempCtx) throw new Error("浏览器不支持 Canvas");
        tempCtx.drawImage(image, sx, sy, sw, sh, 0, 0, tw, th);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(temp, 0, 0, tw, th, sx, sy, sw, sh);
        ctx.imageSmoothingEnabled = true;
      } else {
        const radius = Math.max(4, Math.round(strength));
        const pad = radius * 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(
          image,
          Math.max(0, sx - pad),
          Math.max(0, sy - pad),
          sw + pad * 2,
          sh + pad * 2,
          Math.max(0, sx - pad),
          Math.max(0, sy - pad),
          sw + pad * 2,
          sh + pad * 2,
        );
        ctx.restore();
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), "image/webp", 0.9);
      });

      if (!blob) throw new Error("导出打码图失败");

      const base = file.name.replace(/\.[^.]+$/, "");
      onApply(new File([blob], `${base}-censored.webp`, { type: "image/webp" }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打码失败");
    } finally {
      setApplying(false);
    }
  };

  const selectionLabel = selection
    ? `${Math.round(selection.w * 100)}% × ${Math.round(selection.h * 100)}%`
    : "未选择区域";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-4 border-black bg-[var(--neo-panel)] p-5 text-black">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">预览图打码</DialogTitle>
          <DialogDescription className="text-sm font-bold text-black/70">
            在图片上按住鼠标拖出要打码的矩形；选「马赛克」或「高斯模糊」后应用。打码图会替换原图上传，原图不会进 COS。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 border-4 border-black bg-white p-3 text-xs font-black">
            <label className="inline-flex items-center gap-2">
              效果
              <select
                value={effect}
                onChange={(event) => setEffect(event.target.value as CensorEffect)}
                className="border-4 border-black bg-white px-2 py-1 text-xs font-black text-black"
              >
                <option value="mosaic">马赛克</option>
                <option value="blur">高斯模糊</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              {effect === "mosaic" ? "块大小" : "模糊半径"}
              <input
                type="range"
                min={4}
                max={40}
                value={strength}
                onChange={(event) => setStrength(Number(event.target.value))}
                className="accent-black"
              />
              <span className="w-8 text-center">{strength}</span>
            </label>
            <span className="border-2 border-black bg-[#ffd84f] px-2 py-1">{selectionLabel}</span>
            <Button type="button" variant="outline" size="sm" onClick={selectAll}>
              <Scan className="size-3.5" /> 全图
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelection(null)}>
              <Eraser className="size-3.5" /> 清除选区
            </Button>
          </div>

          <div
            ref={viewerRef}
            className="flex cursor-crosshair justify-center overflow-auto border-4 border-black bg-[#3a2418] p-3 select-none touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {imageUrl ? (
              <div ref={wrapperRef} className="relative inline-block max-w-full select-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="待打码预览图"
                  draggable={false}
                  className="block max-h-[60vh] max-w-full"
                />
                {selection && selection.w > 0 && selection.h > 0 ? (
                  <div
                    className="pointer-events-none absolute border-4 border-white bg-white/25 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                    style={{
                      left: `${selection.x * 100}%`,
                      top: `${selection.y * 100}%`,
                      width: `${selection.w * 100}%`,
                      height: `${selection.h * 100}%`,
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <p className="p-8 text-sm font-black text-white">没有可编辑的图片</p>
            )}
          </div>

          <p className="text-xs font-black text-black/70">
            {selection
              ? "已选区域：点底部「应用打码」生效（可先在图上继续调整）"
              : "在图片或黑色留白里按住鼠标拖出矩形；拖完点底部「应用打码」"}
          </p>
        </div>

        <DialogFooter className="sticky bottom-0 -mx-5 mt-2 border-t-4 border-black bg-[var(--neo-panel)] px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={applying || !selection} onClick={() => void applyCensor()}>
            <Sparkles className="size-4" />
            {applying ? "处理中…" : "应用打码"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
