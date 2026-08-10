"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Plus, Video } from "lucide-react";

import type { Chapter } from "../types";

type TutorialNavProps = {
  chapters: Chapter[];
  activeId: string;
  onChange: (id: string) => void;
  // ── Admin edit props (all optional — omit for normal user mode) ──
  /** Enable drag-and-drop reordering */
  draggable?: boolean;
  /** Called when chapters are reordered via drag-and-drop */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Called when edit button on a chapter tab is clicked */
  onEditChapter?: (chapterId: string) => void;
  /** Called when delete button on a chapter tab is clicked */
  onDeleteChapter?: (chapterId: string) => void;
  /** Called when the "+" add-chapter button is clicked */
  onAddChapter?: () => void;
  /** Called when video edit button on a chapter tab is clicked */
  onEditChapterVideo?: (chapterId: string) => void;
};

/** Single sortable tab button */
function SortableTab({
  chapter,
  isActive,
  onClick,
  draggable,
  onEdit,
  onDelete,
  onEditVideo,
}: {
  chapter: Chapter;
  isActive: boolean;
  onClick: () => void;
  draggable: boolean;
  onEdit?: (chapterId: string) => void;
  onDelete?: (chapterId: string) => void;
  onEditVideo?: (chapterId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="inline-flex items-center gap-0.5">
      {/* Drag handle — only visible when draggable */}
      {draggable && (
        <button
          type="button"
          className="cursor-grab touch-none p-0.5 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`拖拽排序 ${chapter.id}`}
        >
          <GripVertical className="size-3.5 text-black/40" />
        </button>
      )}

      {/* Tab button */}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 border-4 border-black px-3 py-1 transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
          isActive
            ? "shadow-[4px_4px_0px_0px_#000]"
            : "bg-white hover:shadow-[4px_4px_0px_0px_#000]",
        )}
        style={{ background: isActive ? "var(--neo-accent)" : undefined }}
      >
        <span className="text-xs font-black">{chapter.id}</span>
        <span className="hidden text-[10px] font-bold sm:inline">
          {chapter.title}
        </span>
      </button>

      {/* Edit / Delete buttons — only in admin mode */}
      {draggable && (
        <div className="ml-0.5 flex items-center gap-0.5">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(chapter.id);
              }}
              className="rounded border border-black/30 p-0.5 text-black/50 hover:bg-[var(--neo-accent)] hover:text-black"
              aria-label={`编辑 ${chapter.id}`}
            >
              <Pencil className="size-3" />
            </button>
          )}
          {onEditVideo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditVideo(chapter.id);
              }}
              className="rounded border border-black/30 p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-600"
              aria-label={`编辑 ${chapter.id} 视频`}
              title="编辑视频URL"
            >
              <Video className="size-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(chapter.id);
              }}
              className="rounded border border-black/30 p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600"
              aria-label={`删除 ${chapter.id}`}
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Sticky tab bar — each chapter is a tab button.
 * Fixed at the top, highlights the active tab with neo-brutalist style.
 *
 * In admin mode (draggable=true), tabs show drag handles, edit/delete buttons,
 * and a "+" button at the end for adding new chapters.
 */
export function TutorialNav({
  chapters,
  activeId,
  onChange,
  draggable = false,
  onReorder,
  onEditChapter,
  onDeleteChapter,
  onAddChapter,
  onEditChapterVideo,
}: TutorialNavProps) {
  // ── Drag-and-drop sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorder) return;

      const oldIndex = chapters.findIndex((ch) => ch.id === active.id);
      const newIndex = chapters.findIndex((ch) => ch.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(oldIndex, newIndex);
      }
    },
    [chapters, onReorder],
  );

  const tabs = (
    <div className="flex flex-wrap items-center gap-1">
      {chapters.map((ch) => {
        const isActive = ch.id === activeId;
        return (
          <SortableTab
            key={ch.id}
            chapter={ch}
            isActive={isActive}
            onClick={() => onChange(ch.id)}
            draggable={draggable}
            onEdit={onEditChapter}
            onDelete={onDeleteChapter}
            onEditVideo={onEditChapterVideo}
          />
        );
      })}

      {/* Add chapter button — only in admin mode */}
      {draggable && onAddChapter && (
        <button
          type="button"
          onClick={onAddChapter}
          className="inline-flex items-center gap-1 rounded border-2 border-dashed border-black/30 px-2 py-1 text-[10px] font-bold text-black/40 hover:border-black hover:text-black"
          aria-label="添加章节"
        >
          <Plus className="size-3" />
          <span className="hidden sm:inline">添加章节</span>
        </button>
      )}
    </div>
  );

  // ── Render ──
  return (
    <nav className="z-50 border-b-4 border-black bg-[var(--neo-panel)] px-4 py-1.5 shadow-[0_4px_0px_0px_#000] sm:px-5 lg:px-6">
      {draggable ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={chapters.map((ch) => ch.id)}
            strategy={rectSortingStrategy}
          >
            {tabs}
          </SortableContext>
        </DndContext>
      ) : (
        tabs
      )}
    </nav>
  );
}
