"use client";

import { useCallback, useState, type ReactNode } from "react";

import { ModCard } from "@/components/common/mod-card";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { BatchActionBar } from "./batch-action-bar";
import { FixCreatorButton } from "./fix-creator-button";
import { ManageFeaturedButton } from "./featured-mods-manager";
import { AdminModsToolbar } from "./admin-mods-toolbar";
import type { AdminMod } from "@/lib/mods";
import type { AdminModsFilters } from "@/lib/admin/mods-filters";

type AdminModsListClientProps = {
  /** 当前筛选条件（透传给 AdminModsToolbar 渲染下拉筛选） */
  filters: AdminModsFilters;
  countLabel: ReactNode;
  mods: AdminMod[];
  pagination: ReactNode;
  emptyState: ReactNode;
};

export function AdminModsListClient({
  filters,
  countLabel,
  mods,
  pagination,
  emptyState,
}: AdminModsListClientProps) {
  // 批量选择模式：只有点击「批量选择」按钮后才进入，勾选框才出现
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 勾选框直接点击：按 checked 值精确设置（勾选框内部 stopPropagation，不会触发卡片点击）
  const setSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  // 卡片任意位置点击：纯切换
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const enterSelectionMode = useCallback(() => setSelectionMode(true), []);
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // 批量操作完成/取消后：仅清空选中，保持批量模式，可继续选择
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* 顶部筛选卡片（含右上角操作按钮 + 批量处理第二行）：sticky 固定，滚动时保持不动（z-50 盖住下方卡片的 z-20/z-30 标签） */}
      <div className="sticky top-0 z-50 bg-[var(--neo-dark)] pb-3">
        <AdminModsToolbar
          filters={filters}
          batchRow={
            <BatchActionBar
              selectedIds={Array.from(selectedIds)}
              onClearSelection={clearSelection}
              variant="inline"
            />
          }
          rightSlot={
            <div className="flex items-center gap-2">
              <ManageFeaturedButton />
              <FixCreatorButton />
              <button
                type="button"
                onClick={selectionMode ? exitSelectionMode : enterSelectionMode}
                aria-pressed={selectionMode}
                className={`inline-flex items-center gap-1.5 border-[3px] border-black px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 ${
                  selectionMode ? "bg-[var(--neo-accent)]" : "bg-white"
                }`}
              >
                {selectionMode ? "退出批量选择" : "批量选择"}
              </button>
            </div>
          }
        />
      </div>

      {countLabel}

      {mods.length === 0 ? (
        emptyState
      ) : (
        <>
          {selectionMode ? (
            <span className="text-xs font-black uppercase tracking-[0.14em] text-black/55">
              点击卡片任意位置勾选 · 已选 {selectedIds.size}
            </span>
          ) : null}

          {/* 一行 5 个；isolate 建立独立层叠上下文，避免卡片内部 z-20 标签盖过上方 sticky 筛选卡片 */}
          <section className="isolate grid w-full grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {mods.map((mod, index) => (
              <MotionReveal key={mod.id} delay={0.03 + (index % 8) * 0.02} y={14} rotate={index % 2 === 0 ? -1 : 1}>
                <ModCard
                  mod={mod}
                  href={`/admin/mods/${mod.id}/edit`}
                  linkMode={selectionMode ? "card" : "split"}
                  variant="list"
                  className="bg-[#fff8ef] p-2.5"
                  imageAspectClassName="aspect-[5/6] sm:aspect-[4/5]"
                  imagePriority={index < 5}
                  imageFetchPriority={index < 5 ? "high" : "auto"}
                  imageSizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                  titleTag="h3"
                  showInteractionBar={false}
                  showRatingSticker={false}
                  showMetaBadges={true}
                  showCheckbox={selectionMode}
                  checkboxChecked={selectedIds.has(mod.id)}
                  onCheckboxChange={selectionMode ? (checked) => setSelect(mod.id, checked) : undefined}
                  onCardClick={selectionMode ? () => toggleSelect(mod.id) : undefined}
                  extraMetaBadges={
                    <span className={`inline-flex items-center border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-black shadow-[2px_2px_0_0_#000] ${mod.isPublished ? "bg-[#4ade80]" : "bg-[#ffd84f]"}`}>
                      {mod.isPublished ? "已发布" : "草稿"}
                    </span>
                  }
                  bodyBottom={null}
                />
              </MotionReveal>
            ))}
          </section>

          {pagination}
        </>
      )}
    </div>
  );
}
