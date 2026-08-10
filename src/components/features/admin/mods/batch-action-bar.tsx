"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, PencilRuler, Trash2, CheckCircle, XCircle, Star, StarOff } from "lucide-react";

import { batchDeleteMods, batchFeatureMods, batchPublishMods, type BatchResult } from "@/actions/admin/batch-actions";
import { BatchEditModal } from "./batch-edit-modal";

type BatchActionBarProps = {
  selectedIds: string[];
  onClearSelection: () => void;
};

export function BatchActionBar({ selectedIds, onClearSelection }: BatchActionBarProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // 结果展示 5 秒后自动消失
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 5000);
    return () => clearTimeout(timer);
  }, [result]);

  // 无选中 + 无结果 → 不显示
  if (selectedIds.length === 0 && !result) return null;

  const dismiss = () => {
    setResult(null);
    onClearSelection();
  };

  const handlePublish = async (publish: boolean) => {
    setLoading(true);
    setResult(null);
    const res = await batchPublishMods(selectedIds, publish);
    setResult(res);
    setLoading(false);
    onClearSelection();
  };

  const handleDelete = async () => {
    if (!window.confirm(`确认删除 ${selectedIds.length} 个 MOD？此操作不可撤销！`)) return;
    setLoading(true);
    setResult(null);
    const res = await batchDeleteMods(selectedIds);
    setResult(res);
    setLoading(false);
    onClearSelection();
  };

  const handleFeature = async (feature: boolean) => {
    setLoading(true);
    setResult(null);
    const res = await batchFeatureMods(selectedIds, feature);
    setResult(res);
    setLoading(false);
    onClearSelection();
  };

  const handleEditComplete = (res: BatchResult) => {
    setResult(res);
    setShowEditModal(false);
    onClearSelection();
  };

  const hasSelection = selectedIds.length > 0;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center">
        <div className="mx-4 mb-4 flex w-full max-w-[1680px] flex-wrap items-center gap-3 border-4 border-black bg-[#fff8ef] px-4 py-3 shadow-[8px_8px_0px_0px_#000]">
          {/* 有选中：显示操作按钮 */}
          {hasSelection ? (
            <>
              <span className="text-sm font-black uppercase tracking-[0.14em] text-black">
                已选 <span className="text-[#ff7a7a]">{selectedIds.length}</span> 个 MOD
              </span>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setShowEditModal(true)} disabled={loading}
                  className="inline-flex items-center gap-1.5 border-[3px] border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
                  <PencilRuler className="size-3.5" />批量编辑
                </button>
                <button type="button" onClick={() => handlePublish(true)} disabled={loading}
                  className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[#4ade80] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
                  <CheckCircle className="size-3.5" />批量上线
                </button>
                <button type="button" onClick={() => handlePublish(false)} disabled={loading}
                  className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[#ffd84f] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
                  <XCircle className="size-3.5" />批量下线
                </button>
                <button type="button" onClick={() => handleFeature(true)} disabled={loading}
                  className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[#bcaeff] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
                  <Star className="size-3.5" />批量推荐
                </button>
                <button type="button" onClick={() => handleFeature(false)} disabled={loading}
                  className="inline-flex items-center gap-1.5 border-[3px] border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
                  <StarOff className="size-3.5" />取消推荐
                </button>
                <button type="button" onClick={handleDelete} disabled={loading}
                  className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[#ff7a7a] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
                  <Trash2 className="size-3.5" />批量删除
                </button>
                <button type="button" onClick={dismiss} disabled={loading}
                  className="ml-2 inline-flex items-center gap-1 border-[3px] border-black bg-white px-2 py-2 text-xs font-black uppercase tracking-[0.12em] text-black/55 shadow-[3px_3px_0px_0px_#000] transition hover:text-black disabled:opacity-40">
                  取消
                </button>
              </div>
            </>
          ) : null}

          {/* 加载中 */}
          {loading ? (
            <div className="flex w-full items-center gap-2 text-xs font-bold text-black/60">
              <LoaderCircle className="size-3.5 animate-spin" />正在处理...
            </div>
          ) : null}

          {/* 结果（操作完成后显示，选中已清空） */}
          {result && !hasSelection ? (
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-[#4ade80]">成功 {result.success} 个</span>
                {result.failed.length > 0 ? (
                  <span className="text-[#ff7a7a]">失败 {result.failed.length} 个</span>
                ) : null}
              </div>
              <button type="button" onClick={dismiss}
                className="border-[3px] border-black bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-black/55 shadow-[3px_3px_0px_0px_#000] transition hover:text-black">
                关闭
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showEditModal ? (
        <BatchEditModal
          selectedIds={selectedIds}
          onClose={() => setShowEditModal(false)}
          onComplete={handleEditComplete}
        />
      ) : null}
    </>
  );
}
