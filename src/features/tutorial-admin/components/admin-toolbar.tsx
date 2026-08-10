"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, Send, Undo2, AlertTriangle } from "lucide-react";

type AdminToolbarProps = {
  hasChanges: boolean;
  saving: boolean;
  publishing: boolean;
  hasDraft: boolean;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onDiscard: () => Promise<void>;
};

/**
 * Sticky admin toolbar for the tutorial admin page.
 * Shows save/publish/discard buttons and an unsaved-changes indicator.
 * Registers a beforeunload listener to warn about unsaved changes.
 */
export function AdminToolbar({
  hasChanges,
  saving,
  publishing,
  hasDraft,
  onSave,
  onPublish,
  onDiscard,
}: AdminToolbarProps) {
  const [statusText, setStatusText] = useState<string | null>(null);

  // ── beforeunload: warn if unsaved changes ──
  useEffect(() => {
    if (!hasChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  const handleSave = useCallback(async () => {
    setStatusText(null);
    try {
      await onSave();
      setStatusText("草稿已保存");
    } catch {
      setStatusText("保存失败");
    }
  }, [onSave]);

  const handlePublish = useCallback(async () => {
    setStatusText(null);
    try {
      await onPublish();
      setStatusText("已发布！");
    } catch {
      setStatusText("发布失败");
    }
  }, [onPublish]);

  const handleDiscard = useCallback(async () => {
    setStatusText(null);
    try {
      await onDiscard();
      setStatusText("已放弃修改");
    } catch {
      setStatusText("操作失败");
    }
  }, [onDiscard]);

  return (
    <div className="sticky top-[5rem] z-[100] -mx-4 border-b-4 border-black px-4 py-2.5 sm:px-6 lg:px-8" style={{ background: "var(--neo-panel)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Unsaved indicator */}
          {hasChanges && (
            <span className="inline-flex items-center gap-1.5 rounded border-2 border-black bg-[var(--neo-accent)] px-3 py-1 text-xs font-black">
              <AlertTriangle className="size-3" />
              有未保存的修改
            </span>
          )}
          {!hasChanges && (
            <span className="text-xs font-bold text-black/40">
              草稿已保存
            </span>
          )}
          {statusText && (
            <span className="text-xs font-bold text-black/60">
              {statusText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[var(--neo-accent)] px-4 py-2 text-xs font-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
          >
            <Save className="size-3.5" />
            {saving ? "保存中..." : "保存草稿"}
          </button>
          {hasDraft && (
            <>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="inline-flex items-center gap-1.5 border-[3px] border-black bg-green-300 px-4 py-2 text-xs font-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
              >
                <Send className="size-3.5" />
                {publishing ? "发布中..." : "发布"}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="inline-flex items-center gap-1.5 border-[3px] border-black bg-red-100 px-4 py-2 text-xs font-black text-red-700 shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                <Undo2 className="size-3.5" />
                放弃修改
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
