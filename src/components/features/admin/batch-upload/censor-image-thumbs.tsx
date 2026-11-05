"use client";

import { useEffect, useMemo } from "react";
import { GripVertical, ImagePlus, RotateCcw, Sparkles, X } from "lucide-react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { BatchPreviewImage } from "@/lib/admin/batch-upload-types";
import { hasCensoredPreview } from "@/lib/admin/upload-preview-images";

type CensorImageThumbsProps = {
  images: BatchPreviewImage[];
  onCensor: (index: number) => void;
  /** 不传则不显示删除按钮 */
  onRemove?: (index: number) => void;
  onReorder?: (from: number, to: number) => void;
  onReset?: () => void;
  emptyLabel?: string;
};

type SortableThumbProps = {
  image: BatchPreviewImage;
  index: number;
  url: string;
  onCensor: (index: number) => void;
  onRemove?: (index: number) => void;
};

/**
 * 单张缩略图：拖拽手柄 + 删除 + 打码。
 *
 * 拖拽手柄是独立的小按钮，而不是整张图 —— 否则「打码 / 删除」按钮会跟拖拽手势打架，
 * 手机上也会把点击吞成拖动。
 */
function SortableThumb({ image, index, url, onCensor, onRemove }: SortableThumbProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex w-16 flex-col items-center gap-0.5"
    >
      <div className="relative">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`preview-${index + 1}`}
            className="size-16 border-2 border-black bg-white object-cover"
          />
        ) : (
          <div className="size-16 border-2 border-black bg-[#e5e5e5]" aria-hidden />
        )}

        {index === 0 ? (
          <span className="absolute -left-1.5 -top-1.5 border-2 border-black bg-[#d8f5c8] px-1 text-[8px] font-black text-black">
            主图
          </span>
        ) : null}

        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center border-2 border-black bg-[#ffb5c3] text-black hover:bg-[#ff7a7a]"
            title="删除这张预览图"
            aria-label={`删除第 ${index + 1} 张预览图`}
          >
            <X className="size-2.5" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="cursor-grab touch-none border-2 border-black bg-white p-0.5 text-black/50 hover:text-black active:cursor-grabbing"
          title="按住拖动调整顺序（第 1 张是主图）"
          aria-label={`拖动调整第 ${index + 1} 张预览图的位置`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-2.5" />
        </button>

        <button
          type="button"
          onClick={() => onCensor(index)}
          className="inline-flex items-center gap-0.5 border-2 border-black bg-[#ffd84f] px-1 py-0.5 text-[9px] font-black text-black"
          title="对这张图打码"
        >
          <Sparkles className="size-2.5" />
          {image.censored ? "重打" : "打码"}
        </button>
      </div>
    </div>
  );
}

export function CensorImageThumbs({
  images,
  onCensor,
  onRemove,
  onReorder,
  onReset,
  emptyLabel = "缺图（用占位图）",
}: CensorImageThumbsProps) {
  // 按图片 id 建 blob URL。列表一变就整组重建，旧 URL 在下次渲染的 cleanup 里释放 ——
  // 不永久缓存是故意的：预览图动辄几十张，留着不 revoke 会一直占着内存。
  const urlMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const image of images) map.set(image.id, URL.createObjectURL(image.file));
    return map;
  }, [images]);

  useEffect(() => {
    return () => {
      for (const url of urlMap.values()) URL.revokeObjectURL(url);
    };
  }, [urlMap]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (images.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 border-4 border-black bg-[#ffd84f] px-2 py-1 font-black text-black">
        <ImagePlus className="size-3.5" /> {emptyLabel}
      </span>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const from = images.findIndex((image) => image.id === active.id);
    const to = images.findIndex((image) => image.id === over.id);
    if (from < 0 || to < 0) return;

    onReorder(from, to);
  };

  return (
    <div className="space-y-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={images.map((image) => image.id)} strategy={rectSortingStrategy}>
          <div className="flex max-w-[360px] flex-wrap items-start gap-2">
            {images.map((image, index) => (
              <SortableThumb
                key={image.id}
                image={image}
                index={index}
                url={urlMap.get(image.id) ?? ""}
                onCensor={onCensor}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-black text-black">{images.length} 张</span>
        <span className="text-[9px] font-bold text-black/50">拖手柄排序，第 1 张为主图</span>

        {onReset && hasCensoredPreview(images) ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-0.5 border-2 border-black bg-white px-1 py-0.5 text-[9px] font-black text-black"
          >
            <RotateCcw className="size-2.5" /> 还原打码
          </button>
        ) : null}
      </div>
    </div>
  );
}
