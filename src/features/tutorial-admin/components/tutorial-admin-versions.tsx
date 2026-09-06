"use client";

import { useCallback, useState } from "react";
import {
  Eye,
  EyeOff,
  Flag,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

import type {
  TutorialVersionRow,
  VersionMetaInput,
} from "../types";

type TutorialAdminVersionsProps = {
  versions: TutorialVersionRow[];
  activeVersionId: string;
  onCreate: (input: VersionMetaInput) => Promise<void>;
  onUpdateMeta: (versionId: string, input: VersionMetaInput) => Promise<void>;
  onDelete: (versionId: string) => Promise<void>;
  onSelect: (versionId: string) => void;
};

/**
 * 后台教程版本管理区。
 * - 每版本一行：名称 + 可见/默认徽标 + 排序 + 操作（编辑/删除）
 * - 新增版本：弹窗输入名称
 * - 编辑版本：弹窗编辑名称/描述/排序/可见/默认
 * - 选中版本 → 通知父级加载该版本内容
 * 操作完成后通过 onCreate/onUpdateMeta/onDelete 回父级刷新列表。
 */
export function TutorialAdminVersions({
  versions,
  activeVersionId,
  onCreate,
  onUpdateMeta,
  onDelete,
  onSelect,
}: TutorialAdminVersionsProps) {
  const [modal, setModal] = useState<"create" | string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [visible, setVisible] = useState(true);
  const [defaultFlag, setDefaultFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setName("");
    setDescription("");
    setSortOrder(versions.length);
    setVisible(true);
    setDefaultFlag(versions.length === 0);
    setError(null);
    setModal("create");
  }, [versions.length]);

  const openEdit = useCallback((v: TutorialVersionRow) => {
    setName(v.name);
    setDescription(v.description ?? "");
    setSortOrder(v.sort_order);
    setVisible(v.is_visible);
    setDefaultFlag(v.is_default);
    setError(null);
    setModal(v.id);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!modal) return;
    if (!name.trim()) {
      setError("版本名称不能为空");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: VersionMetaInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        sort_order: sortOrder,
        is_visible: visible,
        is_default: defaultFlag,
      };
      if (modal === "create") {
        await onCreate(input);
      } else {
        await onUpdateMeta(modal, input);
      }
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }, [modal, name, description, sortOrder, visible, defaultFlag, onCreate, onUpdateMeta]);

  const handleDelete = useCallback(
    async (v: TutorialVersionRow) => {
      if (!window.confirm(`确认删除版本「${v.name}」？该版本的全部内容将被删除。`)) return;
      await onDelete(v.id);
    },
    [onDelete],
  );

  return (
    <div className="border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-black">教程版本</h2>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[var(--neo-accent)] px-3 py-1.5 text-xs font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <Plus className="size-3.5" />
          新增版本
        </button>
      </div>

      <div className="space-y-2">
        {versions.map((v) => {
          const isActive = v.id === activeVersionId;
          return (
            <div
              key={v.id}
              className={cn(
                "flex flex-wrap items-center gap-3 border-[3px] border-black px-3 py-2 transition",
                isActive ? "bg-[var(--neo-accent)]/20" : "bg-white",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(v.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-black text-black">{v.name}</span>
                  {v.is_default && (
                    <span className="inline-flex items-center gap-0.5 rounded border-2 border-black bg-[var(--neo-accent)] px-1 py-0.5 text-[9px] font-black uppercase">
                      <Star className="size-2.5" /> 默认
                    </span>
                  )}
                  {v.is_visible ? (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-black/50">
                      <Eye className="size-2.5" /> 可见
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-red-500">
                      <EyeOff className="size-2.5" /> 隐藏
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-black/40">
                  <span className="font-mono">id: {v.id}</span>
                  <span>排序: {v.sort_order}</span>
                </div>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openEdit(v)}
                  className="rounded border border-black/30 p-1.5 text-black/50 transition hover:bg-[var(--neo-accent)] hover:text-black"
                  aria-label={`编辑 ${v.name}`}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(v)}
                  disabled={versions.length <= 1}
                  className="rounded border border-black/30 p-1.5 text-red-400 transition hover:bg-red-100 hover:text-red-600 disabled:opacity-30"
                  aria-label={`删除 ${v.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / edit modal */}
      {modal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="w-full max-w-lg border-4 border-black bg-white p-5 shadow-[8px_8px_0px_0px_#000]">
            <h3 className="mb-3 text-base font-black">
              {modal === "create" ? "新增教程版本" : "编辑版本"}
            </h3>

            {error && (
              <p className="mb-2 border-2 border-red-400 bg-red-50 px-2 py-1 text-xs font-bold text-red-600">
                {error}
              </p>
            )}

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.1em] text-black/60">名称</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full border-[3px] border-black px-3 py-2 text-sm font-bold outline-none"
                  placeholder="如：V1.0 常规安装"
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.1em] text-black/60">描述</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full border-[3px] border-black px-3 py-2 text-sm font-bold outline-none"
                  placeholder="简要说明该版本适用场景（可选）"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.1em] text-black/60">排序</span>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-32 border-[3px] border-black px-3 py-2 text-sm font-bold outline-none"
                />
              </label>

              <div className="flex items-center gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    className="size-4 accent-black"
                  />
                  前台可见
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={defaultFlag}
                    onChange={(e) => setDefaultFlag(e.target.checked)}
                    className="size-4 accent-black"
                  />
                  设为默认
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="border-[3px] border-black bg-white px-4 py-1.5 text-xs font-black"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy}
                className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[var(--neo-accent)] px-4 py-1.5 text-xs font-black shadow-[2px_2px_0px_0px_#000] disabled:opacity-50"
              >
                <Flag className="size-3.5" />
                {busy ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
