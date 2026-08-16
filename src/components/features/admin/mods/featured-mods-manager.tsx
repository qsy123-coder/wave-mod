"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { GripVertical, LoaderCircle, Star, StarOff, X } from "lucide-react";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  getFeaturedModsAdmin,
  reorderFeaturedMods,
  setModFeatured,
} from "@/actions/admin/featured-actions";
import type { AdminMod } from "@/lib/mods";
import { MAX_CAROUSEL_SLOTS } from "@/lib/mods-domain/sorting";

type FeaturedModsManagerProps = {
  onClose: () => void;
};

type SortableItemProps = {
  mod: AdminMod;
  index: number;
  removing: boolean;
  onRemove: (id: string) => void;
};

/** 单个可拖拽的推荐项 */
function SortableItem({ mod, index, removing, onRemove }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: mod.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 border-2 border-black bg-white px-3 py-2 shadow-[3px_3px_0px_0px_#000]"
    >
      {/* 序号（反映当前视觉顺序，保存后写入 featured_order） */}
      <span className="w-6 shrink-0 text-center text-sm font-black text-black/45">{index + 1}</span>

      {/* 拖拽手柄 */}
      <button
        type="button"
        className="cursor-grab touch-none p-0.5 text-black/40 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`拖拽排序 ${mod.title}`}
      >
        <GripVertical className="size-4" />
      </button>

      {/* 封面缩略图 */}
      <div className="relative size-12 shrink-0 overflow-hidden border-2 border-black bg-black">
        {mod.coverImage ? (
          <Image src={mod.coverImage} alt={mod.title} fill unoptimized className="object-cover" sizes="48px" />
        ) : (
          <div className="flex size-full items-center justify-center text-[8px] font-black text-white/40">无图</div>
        )}
      </div>

      {/* 标题 / 角色 / 状态 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-black text-black">{mod.title}</p>
          {!mod.isPublished ? (
            <span className="shrink-0 border-2 border-black bg-[#ff7a7a] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-black">
              已下线
            </span>
          ) : null}
          {index >= MAX_CAROUSEL_SLOTS ? (
            <span className="shrink-0 border-2 border-black bg-[#ffd84f] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-black">
              待轮播
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[10px] font-bold text-black/45">{mod.character}</p>
      </div>

      {/* 取消推荐 */}
      <button
        type="button"
        onClick={() => onRemove(mod.id)}
        disabled={removing}
        className="inline-flex shrink-0 items-center gap-1 border-2 border-black bg-white px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-black/60 shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5 hover:text-black disabled:opacity-40"
        aria-label={`取消推荐 ${mod.title}`}
      >
        <StarOff className="size-3" />
        取消
      </button>
    </div>
  );
}

/** 推荐管理弹窗：展示已推荐 mod，拖拽排序 + 取消推荐 */
function FeaturedModsManager({ onClose }: FeaturedModsManagerProps) {
  const [mods, setMods] = useState<AdminMod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let mounted = true;
    getFeaturedModsAdmin().then((data) => {
      if (!mounted) return;
      setMods(data);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setMods((prev) => {
        const oldIndex = prev.findIndex((m) => m.id === active.id);
        const newIndex = prev.findIndex((m) => m.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [],
  );

  const handleSaveOrder = async () => {
    if (mods.length === 0) return;
    setSaving(true);
    setMessage(null);
    const res = await reorderFeaturedMods(mods.map((m) => m.id));
    setSaving(false);

    if (res.failed.length === 0) {
      setMessage({ type: "success", text: `顺序已保存（${res.success} 个）` });
    } else {
      setMessage({ type: "error", text: `保存失败 ${res.failed.length} 个，请重试` });
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    setMessage(null);
    const res = await setModFeatured(id, false);
    setRemovingId(null);

    if (res.ok) {
      setMods((prev) => prev.filter((m) => m.id !== id));
      setMessage({ type: "success", text: "已取消推荐" });
    } else {
      setMessage({ type: "error", text: res.error ?? "取消失败，请重试" });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border-4 border-black bg-[#fff8ef] shadow-[12px_12px_0px_0px_#000]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b-4 border-black bg-[var(--neo-secondary)] px-5 py-3">
          <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-[0.14em] text-black">
            <Star className="size-4" />
            管理推荐
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="border-[3px] border-black bg-white px-3 py-1 text-xs font-black text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
          >
            关闭
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16">
              <LoaderCircle className="size-5 animate-spin" />
              <span className="text-sm font-black text-black/60">加载推荐列表...</span>
            </div>
          ) : mods.length === 0 ? (
            <div className="border-4 border-black bg-white px-5 py-10 text-center shadow-[6px_6px_0px_0px_#000]">
              <p className="text-sm font-black text-black/70">暂无推荐 MOD</p>
              <p className="mt-2 text-xs font-bold text-black/45">
                回到列表，勾选 MOD 后点击「批量推荐」即可添加。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold text-black/55">
                共 <span className="font-black text-black">{mods.length}</span> 个推荐 · 拖拽到前{" "}
                <span className="font-black text-black">{MAX_CAROUSEL_SLOTS}</span> 位进入轮播，其余为「待轮播」
              </p>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={mods.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {mods.map((mod, index) => (
                      <SortableItem
                        key={mod.id}
                        mod={mod}
                        index={index}
                        removing={removingId === mod.id}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t-4 border-black bg-white px-5 py-3">
          <div className="min-w-0 flex-1">
            {message ? (
              <p className={`text-xs font-black ${message.type === "success" ? "text-[#4ade80]" : "text-[#ff7a7a]"}`}>
                {message.text}
              </p>
            ) : (
              <p className="text-xs font-bold text-black/45">添加推荐请回到列表使用「批量推荐」</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex items-center gap-1 border-[3px] border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              <X className="size-3.5" />
              关闭
            </button>
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={saving || mods.length === 0}
              className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[var(--neo-accent)] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Star className="size-3.5" />}
              {saving ? "保存中..." : "保存顺序"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 白色筛选卡片上的「管理推荐」按钮（含弹窗状态） */
export function ManageFeaturedButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 border-[3px] border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
      >
        <Star className="size-3.5" />
        管理推荐
      </button>

      {open ? <FeaturedModsManager onClose={() => setOpen(false)} /> : null}
    </>
  );
}
