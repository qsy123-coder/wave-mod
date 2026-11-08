"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { replaceModImageAction } from "@/actions/admin/mod-image-actions";
import { ModCard } from "@/components/common/mod-card";
import { CensorDialog } from "@/components/features/admin/batch-upload/censor-dialog";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { uploadRowImage } from "@/lib/admin/batch-image-upload";
import { isCosStorageUrl } from "@/lib/cos/shared";
import { BatchActionBar } from "./batch-action-bar";
import { FixCreatorButton } from "./fix-creator-button";
import { ManageFeaturedButton } from "./featured-mods-manager";
import { ModImagesDialog } from "./mod-images-dialog";
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
  const router = useRouter();

  // 批量选择模式：只有点击「批量选择」按钮后才进入，勾选框才出现
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 预览图管理：先选择这条 MOD 的哪一张图，再打开打码弹窗
  const [imagesMod, setImagesMod] = useState<AdminMod | null>(null);
  const [censorTarget, setCensorTarget] = useState<{ mod: AdminMod; index: number } | null>(null);
  const [censorFile, setCensorFile] = useState<File | null>(null);
  const [censorLoadingIndex, setCensorLoadingIndex] = useState<number | null>(null);
  const [censorSaving, setCensorSaving] = useState(false);

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

  const openImages = (mod: AdminMod) => {
    if (censorLoadingIndex !== null || censorSaving) return;

    const images = mod.images ?? [];
    const hasAny = images.length > 0 || Boolean(mod.coverImage);

    if (!hasAny) {
      toast.error("这条 MOD 没有预览图，无法打码。");
      return;
    }

    setImagesMod(mod);
  };

  /** 从预览图管理里选一张读取原图，读取成功后打开打码弹窗 */
  const startCensor = async (index: number) => {
    if (!imagesMod || censorLoadingIndex !== null || censorSaving) return;

    const images = imagesMod.images ?? [];
    const imageUrl = images.length > 0 ? images[index] : index === 0 ? imagesMod.coverImage : undefined;

    if (!imageUrl || !isCosStorageUrl(imageUrl)) {
      toast.error("这张预览图不在 COS（旧图或占位图），无法打码。");
      return;
    }

    const loadingToast = toast.loading("正在读取预览图…");
    setCensorLoadingIndex(index);

    try {
      // 优先浏览器直连 COS：Vercel hkg1 → 广州 COS 有已知超时问题（见 hk-proxy-runbook 7.1），
      // 同源代理只作为 CORS 不可用时的兜底。
      let blob: Blob | null = null;

      try {
        const direct = await fetch(imageUrl, { mode: "cors", cache: "no-store" });
        if (direct.ok) blob = await direct.blob();
      } catch {
        // 跨域被拦或网络失败，走同源代理
      }

      if (!blob) {
        const response = await fetch(
          `/api/admin/fetch-image?url=${encodeURIComponent(imageUrl)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `读取预览图失败（${response.status}）`);
        }

        blob = await response.blob();
      }

      setCensorTarget({ mod: imagesMod, index });
      setCensorFile(
        new File([blob], `${imagesMod.id}-preview-${index + 1}.webp`, {
          type: blob.type || "image/webp",
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取预览图失败");
    } finally {
      toast.dismiss(loadingToast);
      setCensorLoadingIndex(null);
    }
  };

  const applyCensoredImage = async (file: File) => {
    if (!censorTarget || censorSaving) return;

    const { mod, index } = censorTarget;
    const savingToast = toast.loading("正在上传打码图…");
    setCensorSaving(true);

    try {
      const imageUrl = await uploadRowImage({
        character: mod.character,
        file,
        index,
        // 每次打码都用新前缀：COS 对象键不带内容哈希，复用同一个 key 时
        // max-age=604800 的缓存会让前台继续看到旧图。
        draftId: crypto.randomUUID(),
      });

      const result = await replaceModImageAction({
        modId: mod.id,
        imageIndex: index,
        imageUrl,
      });

      if (!result.ok) {
        throw new Error(result.error ?? "更新图片失败");
      }

      const nextImages = result.images;

      // 管理弹窗还开着：立刻换成新 URL，可以接着处理同一批图，不用关掉重来
      if (nextImages) {
        setImagesMod((current) =>
          current && current.id === mod.id
            ? { ...current, images: nextImages, coverImage: nextImages[0] ?? current.coverImage }
            : current,
        );
      }

      toast.success(index === 0 ? "封面已打码并更新。" : `第 ${index + 1} 张预览图已打码并更新。`);
      setCensorTarget(null);
      setCensorFile(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打码失败");
    } finally {
      toast.dismiss(savingToast);
      setCensorSaving(false);
    }
  };

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
                  showMetaBadges={true}
                  showCheckbox={selectionMode}
                  checkboxChecked={selectedIds.has(mod.id)}
                  onCheckboxChange={selectionMode ? (checked) => setSelect(mod.id, checked) : undefined}
                  // 选择模式下卡片不是链接（点了只勾选，不能导航；href 是给编辑页用的）
                  onCardSelect={selectionMode ? () => toggleSelect(mod.id) : undefined}
                  // 正常模式点封面打开预览图管理；标题仍是编辑页链接
                  onImageClick={selectionMode ? undefined : () => openImages(mod)}
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

      <ModImagesDialog
        mod={imagesMod}
        loadingIndex={censorLoadingIndex}
        onOpenChange={(open) => {
          if (!open) setImagesMod(null);
        }}
        onCensor={(index) => void startCensor(index)}
      />

      <CensorDialog
        open={Boolean(censorTarget && censorFile)}
        file={censorFile}
        onOpenChange={(open) => {
          if (!open) {
            setCensorTarget(null);
            setCensorFile(null);
          }
        }}
        onApply={(file) => void applyCensoredImage(file)}
      />
    </div>
  );
}
