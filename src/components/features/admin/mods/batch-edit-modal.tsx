"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

import {
  batchGetModDetails,
  batchUpdateModsIndividually,
  type BatchResult,
  type ModUpdateFields,
} from "@/actions/admin/batch-actions";
import { StorageImageUpload } from "@/components/features/admin/upload/storage-image-upload";
import { games } from "@/config/games";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import type { SiteMod } from "@/lib/mods";

type BatchEditModalProps = {
  selectedIds: string[];
  onClose: () => void;
  onComplete: (result: BatchResult) => void;
};

type ModFormData = {
  title: string;
  character: string;
  description: string;
  gameKey: string;
  downloadUrl: string;
  videoUrl: string;
  imageUrls: string;
  nsfw: boolean;
};

function modToFormData(mod: SiteMod): ModFormData {
  return {
    title: mod.title ?? "",
    character: mod.character ?? "",
    description: mod.description ?? "",
    gameKey: mod.gameKey ?? "",
    downloadUrl: mod.downloadUrl ?? "",
    videoUrl: (mod as Record<string, unknown>).videoUrl as string ?? "",
    imageUrls: ((mod as Record<string, unknown>).images as string[])?.join("\n") ?? mod.coverImage ?? "",
    nsfw: mod.nsfw ?? false,
  };
}

function formDataToFields(form: ModFormData): ModUpdateFields {
  return {
    title: form.title,
    character: form.character,
    description: form.description,
    gameKey: form.gameKey,
    downloadUrl: form.downloadUrl,
    videoUrl: form.videoUrl,
    imageUrls: form.imageUrls.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
    nsfw: form.nsfw,
  };
}

export function BatchEditModal({ selectedIds, onClose, onComplete }: BatchEditModalProps) {
  const [mods, setMods] = useState<SiteMod[]>([]);
  const [loadingMods, setLoadingMods] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  // 每个 Mod 的独立表单数据（state 管理，切换不丢失）
  const [forms, setForms] = useState<Map<string, ModFormData>>(new Map());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line
    setLoadingMods(true);
    batchGetModDetails(selectedIds).then((data) => {
      setMods(data);
      const map = new Map<string, ModFormData>();
      for (const mod of data) {
        map.set(mod.id, modToFormData(mod));
      }
      setForms(map);
      setLoadingMods(false);
    });
  }, [selectedIds]);

  const activeMod = mods[activeIndex];
  const activeForm = activeMod ? forms.get(activeMod.id) : null;

  const updateField = (key: keyof ModFormData, value: string | boolean) => {
    if (!activeMod) return;
    setForms((prev) => {
      const next = new Map(prev);
      const form = next.get(activeMod.id);
      if (!form) return prev;
      next.set(activeMod.id, { ...form, [key]: value });
      return next;
    });
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(activeMod.id);
      return next;
    });
  };

  const dirtyCount = dirtyIds.size;

  const handleSubmitAll = async () => {
    const updates: { id: string; fields: ModUpdateFields }[] = [];
    for (const id of dirtyIds) {
      const form = forms.get(id);
      if (!form) continue;
      updates.push({ id, fields: formDataToFields(form) });
    }

    if (updates.length === 0) return;

    setLoading(true);
    setResult(null);
    const res = await batchUpdateModsIndividually(updates);
    setResult(res);
    setLoading(false);

    if (res.failed.length === 0) {
      setTimeout(() => onComplete(res), 1500);
    }
  };

  if (loadingMods) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="flex items-center gap-3 border-4 border-black bg-[#fff8ef] px-8 py-6 shadow-[10px_10px_0px_0px_#000]">
          <LoaderCircle className="size-5 animate-spin" />
          <span className="text-sm font-black">加载 {selectedIds.length} 个 MOD 数据...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border-4 border-black bg-[#fff8ef] shadow-[12px_12px_0px_0px_#000]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b-4 border-black bg-[var(--neo-secondary)] px-5 py-3">
          <h2 className="text-lg font-black uppercase tracking-[0.14em] text-black">
            批量编辑 {mods.length} 个 MOD
          </h2>
          <button type="button" onClick={onClose}
            className="border-[3px] border-black bg-white px-3 py-1 text-xs font-black text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5">
            关闭
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* 左侧 Tab 列表 */}
          <div className="w-[250px] shrink-0 overflow-y-auto border-r-4 border-black bg-white" style={{ scrollbarWidth: "thin" }}>
            {mods.map((mod, i) => {
              const isDirty = dirtyIds.has(mod.id);
              const isActive = i === activeIndex;

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`flex w-full items-start gap-2 border-b-2 border-black px-3 py-2.5 text-left transition ${
                    isActive ? "bg-black text-white" : "bg-white text-black hover:bg-[#f5f5f5]"
                  }`}
                >
                  <div className="relative size-12 shrink-0 overflow-hidden border-2 border-black bg-black">
                    {mod.coverImage ? (
                      <Image src={mod.coverImage} alt={mod.title} fill className="object-cover" sizes="48px" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[8px] font-black text-white/40">无图</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {isDirty && <span className="size-1.5 shrink-0 rounded-full bg-[#ffd84f]" title="有未保存修改" />}
                      <p className={`truncate text-[11px] font-black leading-tight ${isActive ? "text-white" : "text-black"}`}>
                        {mod.title}
                      </p>
                    </div>
                    <p className={`mt-0.5 text-[10px] font-bold ${isActive ? "text-white/55" : "text-black/45"}`}>
                      {mod.character}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右侧编辑表单 */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeForm && activeMod ? (
              <div className="space-y-4">
                {/* 游戏 + 标题 */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">游戏分站 *</label>
                    <select value={activeForm.gameKey} onChange={(e) => updateField("gameKey", e.target.value)}
                      className="w-full border-[3px] border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none">
                      {games.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">标题 *</label>
                    <input value={activeForm.title} onChange={(e) => updateField("title", e.target.value)}
                      className="w-full border-[3px] border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none" />
                  </div>
                </div>

                {/* 角色 + NSFW */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">角色名 *</label>
                    <input value={activeForm.character} onChange={(e) => updateField("character", e.target.value)}
                      list="batch-characters"
                      className="w-full border-[3px] border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none" />
                    <datalist id="batch-characters">
                      {defaultCharacterSuggestions.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">NSFW</label>
                    <label className="flex cursor-pointer items-center gap-2 pt-2">
                      <input type="checkbox" checked={activeForm.nsfw} onChange={(e) => updateField("nsfw", e.target.checked)}
                        className="size-5 border-[3px] border-black accent-black" />
                      <span className="text-xs font-bold">标记为 NSFW 内容</span>
                    </label>
                  </div>
                </div>

                {/* 描述 */}
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">描述 *</label>
                  <textarea value={activeForm.description} onChange={(e) => updateField("description", e.target.value)} rows={3}
                    className="w-full border-[3px] border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none" />
                </div>

                {/* 下载链接 + 视频链接 */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">直链下载</label>
                    <input value={activeForm.downloadUrl} onChange={(e) => updateField("downloadUrl", e.target.value)}
                      placeholder="https://..."
                      className="w-full border-[3px] border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">演示视频</label>
                    <input value={activeForm.videoUrl} onChange={(e) => updateField("videoUrl", e.target.value)}
                      placeholder="https://..."
                      className="w-full border-[3px] border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none" />
                  </div>
                </div>

                {/* 预览图 */}
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-black/60">
                    预览图 URL（每行一个）
                  </label>
                  <textarea value={activeForm.imageUrls} onChange={(e) => updateField("imageUrls", e.target.value)} rows={4}
                    placeholder="https://...&#10;https://..."
                    className="w-full border-[3px] border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] outline-none" />
                  {(() => {
                    const urls = activeForm.imageUrls.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
                    if (urls.length === 0) return null;
                    return (
                      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                        {urls.map((url, i) => (
                          <div key={i} className="group relative overflow-hidden border-2 border-black bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`preview-${i}`} loading="lazy"
                              className="aspect-[4/3] w-full object-cover" />
                            <button type="button" onClick={() => {
                              const remaining = urls.filter((_, j) => j !== i);
                              updateField("imageUrls", remaining.join("\n"));
                            }}
                              className="absolute right-1 top-1 border-2 border-black bg-[#ff8fab] p-0.5 opacity-0 transition group-hover:opacity-100">
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <p className="mt-1 text-[10px] font-bold text-black/40">
                    已写入 {activeForm.imageUrls.split(/[\n,]+/).filter(Boolean).length} 张预览图
                  </p>
                  <div className="mt-2">
                    <StorageImageUpload
                      defaultCharacter={activeForm.character || "未分类"}
                      onUploaded={(urls) => {
                        const current = activeForm.imageUrls.trim();
                        const appended = current ? `${current}\n${urls.join("\n")}` : urls.join("\n");
                        updateField("imageUrls", appended);
                      }}
                    />
                  </div>
                </div>

                {/* 结果 */}
                {loading ? (
                  <div className="flex items-center gap-2 border-[3px] border-black bg-white p-3 text-sm font-bold shadow-[3px_3px_0px_0px_#000]">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在保存...
                  </div>
                ) : null}

                {result ? (
                  <div className="border-[3px] border-black bg-white p-3 shadow-[4px_4px_0px_0px_#000]">
                    <p className="text-sm font-black">
                      <span className="text-[#4ade80]">成功 {result.success} 个</span>
                      {result.failed.length > 0 ? <span className="ml-3 text-[#ff7a7a]">失败 {result.failed.length} 个</span> : null}
                    </p>
                    {result.failed.map((f) => (
                      <p key={f.id} className="mt-1 text-xs font-bold text-[#ff7a7a]">{f.title || f.id}: {f.error}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t-4 border-black bg-white px-5 py-3">
          <p className="text-xs font-bold text-black/45">
            {dirtyCount > 0 ? `${dirtyCount} 个 MOD 有修改` : "暂无修改"}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} disabled={loading}
              className="border-[3px] border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
              取消
            </button>
            <button type="button" onClick={handleSubmitAll} disabled={loading || dirtyCount === 0}
              className="border-[3px] border-black bg-[var(--neo-accent)] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-40">
              {loading ? "保存中..." : `保存全部 ${dirtyCount} 个 MOD`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
