"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Scan, Sparkles, X } from "lucide-react";
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

/** 选区按比例换算成 CSS 定位（选区可以有很多个，样式复用） */
function selectionStyle(selection: Selection): React.CSSProperties {
  return {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.w * 100}%`,
    height: `${selection.h * 100}%`,
  };
}

/**
 * 把一块选区的马赛克/模糊画到目标画布上。
 * 预览画布和导出画布都用原图像素坐标，所以两边共用同一份逻辑，
 * 不会出现「预览是这样、导出却是另一样」。
 */
function paintSelection(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  selection: Selection,
  width: number,
  height: number,
  effect: CensorEffect,
  strength: number,
): void {
  const sx = Math.max(0, Math.round(selection.x * width));
  const sy = Math.max(0, Math.round(selection.y * height));
  const sw = Math.max(1, Math.round(selection.w * width));
  const sh = Math.max(1, Math.round(selection.h * height));

  if (effect === "mosaic") {
    const block = Math.max(4, Math.round(strength));
    const tw = Math.max(1, Math.round(sw / block));
    const th = Math.max(1, Math.round(sh / block));
    const temp = document.createElement("canvas");
    temp.width = tw;
    temp.height = th;
    const tempCtx = temp.getContext("2d");
    if (!tempCtx) return;
    tempCtx.drawImage(image, sx, sy, sw, sh, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp, 0, 0, tw, th, sx, sy, sw, sh);
    ctx.imageSmoothingEnabled = true;
    return;
  }

  const radius = Math.max(4, Math.round(strength));
  const pad = radius * 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, sw, sh);
  ctx.clip();
  ctx.filter = `blur(${radius}px)`;
  // 模糊要多取一圈源像素，否则区域边缘会露出一圈没糊到的"描边"
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

export function CensorDialog({ open, file, onOpenChange, onApply }: CensorDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  /** 已提交的选区，可以有很多个 */
  const [selections, setSelections] = useState<Selection[]>([]);
  /** 正在拖、还没松手的那一个 */
  const [draft, setDraft] = useState<Selection | null>(null);
  const [effect, setEffect] = useState<CensorEffect>("mosaic");
  const [strength, setStrength] = useState(14);
  const [dragging, setDragging] = useState(false);
  const [applying, setApplying] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  /** draft 的镜像：pointerup 里要读最新值，又不能把 setState 当读取用 */
  const draftRef = useRef<Selection | null>(null);

  const setDraftValue = (value: Selection | null) => {
    draftRef.current = value;
    setDraft(value);
  };

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageLoaded(false);
    setSelections([]);
    setDraftValue(null);
    setEffect("mosaic");
    setStrength(14);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) {
      setSelections([]);
      setDraftValue(null);
      setDragging(false);
      dragStartRef.current = null;
    }
  }, [open]);

  /**
   * 选区的实时效果预览：把所有选区（含正在拖的那块）画到一张覆盖整张图的 canvas。
   * 没有这块，用户拖完只看到一个半透明框，会以为「马赛克没出来」。
   */
  useEffect(() => {
    if (!imageLoaded) return;

    const image = imageRef.current;
    const canvas = previewCanvasRef.current;
    if (!image || !canvas) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const regions = draft ? [...selections, draft] : selections;
    for (const region of regions) {
      if (region.w <= 0 || region.h <= 0) continue;
      paintSelection(ctx, image, region, canvas.width, canvas.height, effect, strength);
    }
  }, [draft, effect, imageLoaded, imageUrl, selections, strength]);

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
    setDraftValue({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging || !dragStartRef.current) return;
    setDraftValue(normalizeSelection(dragStartRef.current, pointFromEvent(event)));
  };

  const handlePointerUp = () => {
    if (!dragging) return;

    const current = draftRef.current;
    setDragging(false);
    dragStartRef.current = null;
    setDraftValue(null);

    // 尺寸太小的当作误触，不留在列表里
    if (!current || current.w < MIN_SELECTION || current.h < MIN_SELECTION) return;
    setSelections((list) => [...list, current]);
  };

  const removeSelection = (index: number) => {
    setSelections((list) => list.filter((_, i) => i !== index));
  };

  const selectAll = () => {
    setDraftValue(null);
    setSelections([{ x: 0, y: 0, w: 1, h: 1 }]);
  };

  const clearSelections = () => {
    setDraftValue(null);
    setSelections([]);
  };

  const applyCensor = async () => {
    const image = imageRef.current;
    if (!image || !file || selections.length === 0) {
      toast.error("先在图上拖出至少一个矩形（或点「全图」）。");
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
      for (const selection of selections) {
        paintSelection(ctx, image, selection, canvas.width, canvas.height, effect, strength);
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

  const selectionLabel =
    selections.length > 0 ? `已选 ${selections.length} 个区域` : "未选择区域";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-4 border-black bg-[var(--neo-panel)] p-5 text-black">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">预览图打码</DialogTitle>
          <DialogDescription className="text-sm font-bold text-black/70">
            在图片上按住鼠标拖出要打码的矩形，可以拖多个区域；每个区域右上角的 × 可单独删除。选「马赛克」或「高斯模糊」后应用。打码图会替换原图上传，原图不会进 COS。
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
            <Button type="button" variant="outline" size="sm" onClick={clearSelections}>
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
                  onLoad={() => setImageLoaded(true)}
                  className="block max-h-[60vh] max-w-full"
                />
                {imageLoaded ? (
                  <>
                    {/* 一块全图大小的 canvas，所有选区的效果都画在这上面 */}
                    <canvas
                      ref={previewCanvasRef}
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    />
                    {selections.map((region, index) => (
                      <div
                        key={index}
                        className="pointer-events-none absolute border-4 border-white"
                        style={selectionStyle(region)}
                      >
                        <button
                          type="button"
                          aria-label="删除这个选区"
                          title="删除这个选区"
                          className="pointer-events-auto absolute left-full top-0 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-black bg-white text-black shadow-[2px_2px_0_0_#000] hover:bg-red-300"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSelection(index);
                          }}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    {draft && draft.w > 0 && draft.h > 0 ? (
                      <div
                        className="pointer-events-none absolute border-4 border-dashed border-cyan-300"
                        style={selectionStyle(draft)}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : (
              <p className="p-8 text-sm font-black text-white">没有可编辑的图片</p>
            )}
          </div>

          <p className="text-xs font-black text-black/70">
            {selections.length > 0
              ? "点区域右上角 × 删掉单个区域；点底部「应用打码」把所有选区一起打码。"
              : "在图片或黑色留白里按住鼠标拖出矩形，一次可以拖多个；拖完点底部「应用打码」"}
          </p>
        </div>

        <DialogFooter className="sticky bottom-0 -mx-5 mt-2 border-t-4 border-black bg-[var(--neo-panel)] px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={applying || selections.length === 0}
            onClick={() => void applyCensor()}
          >
            <Sparkles className="size-4" />
            {applying ? "处理中…" : "应用打码"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
