"use client";

import { useState, useCallback, useEffect } from "react";
import { Pencil, Database } from "lucide-react";
import COS from "cos-js-sdk-v5";

import { TutorialTabs } from "@/features/tutorial/components/tutorial-tabs";
import { VideoHintBanner } from "@/features/tutorial/components/video-hint-banner";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { AdminToolbar } from "./admin-toolbar";
import { TutorialAdminVersions } from "./tutorial-admin-versions";
import { TextChapterEditorModal } from "./text-chapter-editor-modal";
import { ChapterEditorModal } from "./chapter-editor-modal";
import type { TextChapterData } from "./text-chapter-editor-modal";
import {
  saveDraft,
  publishTutorial,
  discardDraft,
  migrateFromConfig,
  getAdminVersionTrees,
  createVersion,
  updateVersionMeta,
  deleteVersion,
} from "@/actions/tutorial/tutorial-actions";
import type {
  TutorialFullData,
  SaveDraftInput,
  TutorialVersionRow,
  VersionMetaInput,
} from "@/features/tutorial-admin/types";
import type { Chapter, ToolEntry } from "@/features/tutorial/types";

// ── Types ──

type TutorialAdminClientProps = {
  versions: TutorialVersionRow[];
  needsMigration: boolean;
};

// ── Convert DB data to UI Chapter format ──

function dbChaptersToUI(data: TutorialFullData): {
  title: string;
  subtitle: string;
  imageBasePath: string;
  chapters: Chapter[];
} {
  const { image_base_path } = data.config;
  return {
    title: data.config.title,
    subtitle: data.config.subtitle,
    imageBasePath: image_base_path,
    chapters: data.chapters.map((ch) => ({
      id: ch.chapter_key,
      title: ch.title,
      type: ch.type,
      intro: ch.intro ?? undefined,
      video: ch.video_src
        ? { src: ch.video_src, poster: ch.video_poster ?? undefined }
        : undefined,
      images: ch.images.map((img) =>
        img.url.startsWith("http") ? img.url : img.filename,
      ),
      tools: ch.tools.map((t) => ({
        name: t.name,
        url: t.url,
        description: t.description ?? undefined,
        required: t.required,
        cloudUrls: {
          baidu: t.cloud_baidu ?? undefined,
          quark: t.cloud_quark ?? undefined,
        },
      })),
    })),
  };
}

// ── Main Component ──

export function TutorialAdminClient({
  versions: initialVersions,
  needsMigration: initialNeedsMigration,
}: TutorialAdminClientProps) {
  // ── Version state ──
  const [versions, setVersions] = useState<TutorialVersionRow[]>(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState<string>(
    initialVersions[0]?.id ?? "",
  );

  // ── Current version content (published / draft) ──
  const [published, setPublished] = useState<TutorialFullData | null>(null);
  const [draft, setDraft] = useState<TutorialFullData | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);

  // Determine source data for editing (draft pre-empts published)
  const sourceData = draft ?? published;

  // ── Editable state ──
  const [title, setTitle] = useState(sourceData?.config.title ?? "");
  const [subtitle, setSubtitle] = useState(sourceData?.config.subtitle ?? "");
  const [imageBasePath, setImageBasePath] = useState(
    sourceData?.config.image_base_path ?? "/tutorial/",
  );
  const [chapters, setChapters] = useState<Chapter[]>(() =>
    sourceData ? dbChaptersToUI(sourceData).chapters : [],
  );

  // ── UI state ──
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(initialNeedsMigration);
  const [migrating, setMigrating] = useState(false);

  // ── Inline editing state ──
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [editingChapterVideo, setEditingChapterVideo] = useState<string | null>(null);
  const [editingVideoUrl, setEditingVideoUrl] = useState("");

  // ── Text chapter editor modal ──
  const [textEditorChapterId, setTextEditorChapterId] = useState<string | null>(null);
  const [textEditorData, setTextEditorData] = useState<TextChapterData | null>(null);

  // ── Chapter key + title editor modal ──
  const [chapterEditorId, setChapterEditorId] = useState<string | null>(null);

  const hasDraft = draft !== null;

  // ── Load a version's content into the editor ──
  const loadVersionData = useCallback(
    async (versionId: string, seedTitle?: string) => {
      if (!versionId) return;
      setLoadingVersion(true);
      setHasChanges(false);
      try {
        const data = await getAdminVersionTrees(versionId);
        setPublished(data.published);
        setDraft(data.draft);
        const src = data.draft ?? data.published;
        // 空版本（无草稿也无发布内容）的标题/副标题会置空，一保存就报「教程标题不能为空」。
        // 用版本名兜底标题 + 默认副标题，让新建版本立即可填、可存。
        const fallbackTitle = seedTitle ?? versions.find((v) => v.id === versionId)?.name ?? "";
        setTitle(src ? src.config.title : fallbackTitle);
        setSubtitle(src ? src.config.subtitle : "先看我");
        setImageBasePath(src?.config.image_base_path ?? "/tutorial/");
        setChapters(src ? dbChaptersToUI(src).chapters : []);
      } finally {
        setLoadingVersion(false);
      }
    },
    [versions],
  );

  // ── Select a version ──
  const handleSelectVersion = useCallback(
    (versionId: string) => {
      if (versionId === activeVersionId) return;
      setActiveVersionId(versionId);
      loadVersionData(versionId);
    },
    [activeVersionId, loadVersionData],
  );

  // ── Refresh version list after a version CRUD ──
  const refreshVersions = useCallback(async () => {
    const { listAllVersions } = await import("@/actions/tutorial/tutorial-actions");
    const list = await listAllVersions();
    setVersions(list);
    return list;
  }, []);

  // ── Version CRUD handlers ──
  const handleCreateVersion = useCallback(
    async (input: VersionMetaInput) => {
      const { key } = await createVersion(input);
      const list = await refreshVersions();
      setActiveVersionId(key);
      // Refresh list state, then load the new (empty) version
      const created = list.find((v) => v.id === key);
      if (created) await loadVersionData(key, created.name);
    },
    [refreshVersions, loadVersionData],
  );

  const handleUpdateVersionMeta = useCallback(
    async (versionId: string, input: VersionMetaInput) => {
      await updateVersionMeta(versionId, input);
      await refreshVersions();
    },
    [refreshVersions],
  );

  const handleDeleteVersion = useCallback(
    async (versionId: string) => {
      await deleteVersion(versionId);
      const list = await refreshVersions();
      const nextActive = list[0]?.id ?? "";
      setActiveVersionId(nextActive);
      await loadVersionData(nextActive);
    },
    [refreshVersions, loadVersionData],
  );

  // ── Initial load: fetch content for the first version on mount ──
  useEffect(() => {
    if (initialNeedsMigration) return;
    if (activeVersionId) loadVersionData(activeVersionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mark changes ──
  const markChanged = useCallback(() => setHasChanges(true), []);

  // ── Hero field edits ──
  const handleTitleChange = useCallback(
    (val: string) => {
      setTitle(val);
      markChanged();
      setEditingTitle(false);
    },
    [markChanged],
  );

  const handleSubtitleChange = useCallback(
    (val: string) => {
      setSubtitle(val);
      markChanged();
      setEditingSubtitle(false);
    },
    [markChanged],
  );

  // ── Chapter reorder ──
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setChapters((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
      markChanged();
    },
    [markChanged],
  );

  // ── Chapter edit (key + title via modal, replacing old window.prompt) ──
  const handleEditChapter = useCallback(
    (chapterId: string) => {
      setChapterEditorId(chapterId);
    },
    [],
  );

  const handleSaveChapterEditor = useCallback(
    (newKey: string, newTitle: string) => {
      if (!chapterEditorId) return;
      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterEditorId
            ? { ...c, id: newKey, title: newTitle }
            : c,
        ),
      );
      setChapterEditorId(null);
      markChanged();
    },
    [chapterEditorId, markChanged],
  );

  // ── Chapter edit (video URL) ──
  const handleEditChapterVideo = useCallback(
    (chapterId: string) => {
      const ch = chapters.find((c) => c.id === chapterId);
      if (ch) {
        setEditingChapterVideo(chapterId);
        setEditingVideoUrl(ch.video?.src ?? "");
      }
    },
    [chapters],
  );

  const handleSaveChapterVideo = useCallback(() => {
    if (!editingChapterVideo) return;
    setChapters((prev) =>
      prev.map((ch) =>
        ch.id === editingChapterVideo
          ? {
              ...ch,
              video: editingVideoUrl.trim()
                ? { src: editingVideoUrl.trim() }
                : undefined,
            }
          : ch,
      ),
    );
    setEditingChapterVideo(null);
    markChanged();
  }, [editingChapterVideo, editingVideoUrl, markChanged]);

  // ── Chapter delete ──
  const handleDeleteChapter = useCallback(
    (chapterId: string) => {
      setChapters((prev) => prev.filter((ch) => ch.id !== chapterId));
      markChanged();
    },
    [markChanged],
  );

  // ── Chapter add ──
  const handleAddChapter = useCallback(() => {
    const maxId = Math.max(
      ...chapters.map((ch) => parseInt(ch.id, 10) || 0),
      -1,
    );
    const newId = String(maxId + 1).padStart(2, "0");
    setChapters((prev) => [
      ...prev,
      { id: newId, title: "新章节", type: "images" as const, images: [] },
    ]);
    markChanged();
  }, [chapters, markChanged]);

  // ── Image operations ──
  const handleDeleteImage = useCallback(
    (chapterId: string, index: number) => {
      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === chapterId
            ? { ...ch, images: (ch.images ?? []).filter((_, i) => i !== index) }
            : ch,
        ),
      );
      markChanged();
    },
    [markChanged],
  );

  const handleMoveImage = useCallback(
    (chapterId: string, index: number, direction: "up" | "down") => {
      setChapters((prev) =>
        prev.map((ch) => {
          if (ch.id !== chapterId || !ch.images) return ch;
          const imgs = [...ch.images];
          const newIndex = direction === "up" ? index - 1 : index + 1;
          if (newIndex < 0 || newIndex >= imgs.length) return ch;
          [imgs[index], imgs[newIndex]] = [imgs[newIndex], imgs[index]];
          return { ...ch, images: imgs };
        }),
      );
      markChanged();
    },
    [markChanged],
  );

  const handleUploadImage = useCallback(
    async (
      chapterId: string,
      files: File[],
      onProgress?: (done: number) => void,
    ) => {
      const uploadedUrls: string[] = [];
      try {
        // 逐张（串行）转 WebP → 签名 → 上传 COS
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // Convert PNG/JPEG → WebP before upload (GIF stays as-is to preserve animation)
          let uploadFile = file;
          if (file.type === "image/png" || file.type === "image/jpeg") {
            uploadFile = await new Promise<File>((resolve, reject) => {
              const img = new Image();
              const url = URL.createObjectURL(file);
              img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  resolve(file); // fallback: upload as-is
                  return;
                }
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(
                  (blob) => {
                    if (!blob) {
                      resolve(file); // fallback
                      return;
                    }
                    const originalName = file.name.replace(/\.[^.]+$/, "");
                    resolve(new File([blob], `${originalName}.webp`, { type: "image/webp" }));
                  },
                  "image/webp",
                  0.85,
                );
              };
              img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(file); // fallback
              };
              img.src = url;
            });
          }

          const modId = crypto.randomUUID();
          const res = await fetch("/api/cos/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prefix: "tutorial",
              chapterKey: chapterId,
              contentType: uploadFile.type,
              fileSize: uploadFile.size,
              filename: uploadFile.name,
              modId,
            }),
          });

          const signData = await res.json();
          console.log("[admin-upload] sign response:", JSON.stringify({ ok: signData.ok, objectKey: signData.objectKey, publicUrl: signData.publicUrl, bucket: signData.bucket, region: signData.region, hasCredentials: !!signData.credentials }, null, 2));
          if (!signData.ok) throw new Error(signData.error ?? "获取上传凭证失败");

          // Upload to COS using the SDK with STS temporary credentials
          await new Promise<void>((resolve, reject) => {
            const cos = new COS({
              SecretId: signData.credentials.tmpSecretId,
              SecretKey: signData.credentials.tmpSecretKey,
              SecurityToken: signData.credentials.sessionToken,
              StartTime: signData.credentials.startTime,
              ExpiredTime: signData.credentials.expiredTime,
            });

            cos.putObject(
              {
                Bucket: signData.bucket,
                Region: signData.region,
                Key: signData.objectKey,
                Body: uploadFile,
              },
              (err, data) => {
                if (err) {
                  console.error("[admin-upload] COS putObject error:", err);
                  reject(new Error(`COS 上传失败：${err.message}`));
                } else {
                  console.log("[admin-upload] COS putObject success, statusCode:", data?.statusCode ?? "unknown", "url:", signData.publicUrl);
                  resolve();
                }
              },
            );
          });

          uploadedUrls.push(signData.publicUrl);
          // 上报逐张进度
          onProgress?.(i + 1);
        }

        // 全部成功后再一次性把 URL 追加到章节（串行已避免中间态）
        if (uploadedUrls.length > 0) {
          setChapters((prev) =>
            prev.map((ch) =>
              ch.id === chapterId
                ? {
                    ...ch,
                    images: [...(ch.images ?? []), ...uploadedUrls],
                  }
                : ch,
            ),
          );
          console.log("[admin-upload] chapters state updated, added:", uploadedUrls.length);
          markChanged();
        }
      } catch (err) {
        console.error("[admin] Image upload failed:", err);
        alert(`上传失败：${err instanceof Error ? err.message : "未知错误"}`);
      }
    },
    [markChanged],
  );

  // ── Video upload ──
  const handleUploadVideo = useCallback(
    async (chapterId: string, file: File) => {
      try {
        const modId = crypto.randomUUID();
        const res = await fetch("/api/cos/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prefix: "tutorial",
            chapterKey: chapterId,
            contentType: file.type || "video/mp4",
            fileSize: file.size,
            filename: file.name,
            modId,
          }),
        });

        const signData = await res.json();
        console.log("[admin-video-upload] sign response:", { ok: signData.ok, publicUrl: signData.publicUrl, error: signData.error });
        if (!signData.ok) throw new Error(signData.error ?? "获取上传凭证失败");

        // Upload to COS using the SDK with STS temporary credentials
        await new Promise<void>((resolve, reject) => {
          const cos = new COS({
            SecretId: signData.credentials.tmpSecretId,
            SecretKey: signData.credentials.tmpSecretKey,
            SecurityToken: signData.credentials.sessionToken,
            StartTime: signData.credentials.startTime,
            ExpiredTime: signData.credentials.expiredTime,
          });

          cos.putObject(
            {
              Bucket: signData.bucket,
              Region: signData.region,
              Key: signData.objectKey,
              Body: file,
            },
            (err, data) => {
              if (err) {
                console.error("[admin-video-upload] COS error:", err);
                reject(new Error(`视频上传失败：${err.message}`));
              } else {
                console.log("[admin-video-upload] COS success, statusCode:", data?.statusCode);
                resolve();
              }
            },
          );
        });

        // Set the video URL on the chapter
        console.log("[admin-video-upload] setting video URL:", signData.publicUrl);
        setChapters((prev) =>
          prev.map((ch) =>
            ch.id === chapterId
              ? { ...ch, video: { src: signData.publicUrl } }
              : ch,
          ),
        );
        markChanged();
        alert("视频上传成功！");
      } catch (err) {
        console.error("[admin-video-upload] failed:", err);
        alert(`视频上传失败：${err instanceof Error ? err.message : "未知错误"}`);
      }
    },
    [markChanged],
  );

  // ── Text chapter editor ──
  const handleOpenTextEditor = useCallback(
    (chapterId: string) => {
      const ch = chapters.find((c) => c.id === chapterId);
      if (!ch) return;

      setTextEditorChapterId(chapterId);
      setTextEditorData({
        intro: ch.intro ?? "",
        tools: (ch.tools ?? []).map((t) => ({
          name: t.name,
          url: t.url,
          description: t.description ?? "",
          required: t.required ?? false,
          cloud_baidu: t.cloudUrls?.baidu ?? "",
          cloud_quark: t.cloudUrls?.quark ?? "",
        })),
      });
    },
    [chapters],
  );

  const handleSaveTextEditor = useCallback(
    (data: TextChapterData) => {
      if (!textEditorChapterId) return;
      const newTools: ToolEntry[] = data.tools.map((t) => ({
        name: t.name,
        url: t.url,
        description: t.description || undefined,
        required: t.required,
        cloudUrls: {
          baidu: t.cloud_baidu || undefined,
          quark: t.cloud_quark || undefined,
        },
      }));

      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === textEditorChapterId
            ? { ...ch, intro: data.intro, tools: newTools }
            : ch,
        ),
      );
      setTextEditorChapterId(null);
      setTextEditorData(null);
      markChanged();
    },
    [textEditorChapterId, markChanged],
  );

  // ── Save / Publish / Discard / Migrate ──

  const buildSaveInput = useCallback((): SaveDraftInput => {
    return {
      config: { title, subtitle, image_base_path: imageBasePath },
      chapters: chapters.map((ch, ci) => ({
        sort_order: ci,
        chapter_key: ch.id,
        title: ch.title,
        type: ch.type,
        intro: ch.intro || undefined,
        video_src: ch.video?.src || undefined,
        video_poster: ch.video?.poster || undefined,
        images: (ch.images ?? []).map((img, ii) => ({
          sort_order: ii,
          url: img,
          filename: img.split("/").pop() ?? `step-${ii}`,
        })),
        tools: (ch.tools ?? []).map((t, ti) => ({
          sort_order: ti,
          name: t.name,
          url: t.url,
          description: t.description || undefined,
          required: t.required,
          cloud_baidu: t.cloudUrls?.baidu || undefined,
          cloud_quark: t.cloudUrls?.quark || undefined,
        })),
      })),
    };
  }, [title, subtitle, imageBasePath, chapters]);

  const handleSave = useCallback(async () => {
    if (!activeVersionId) return;
    setSaving(true);
    try {
      await saveDraft(activeVersionId, buildSaveInput());
      setHasChanges(false);
    } catch (err) {
      console.error("[admin] 保存草稿失败:", err);
      alert(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }, [activeVersionId, buildSaveInput]);

  const handlePublish = useCallback(async () => {
    if (!activeVersionId) return;
    // Save first if there are unsaved changes
    if (hasChanges) {
      await saveDraft(activeVersionId, buildSaveInput());
      setHasChanges(false);
    }
    setPublishing(true);
    try {
      await publishTutorial(activeVersionId);
    } catch (err) {
      console.error("[admin] 发布失败:", err);
      alert(`发布失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setPublishing(false);
    }
  }, [activeVersionId, hasChanges, buildSaveInput]);

  const handleDiscard = useCallback(async () => {
    if (!activeVersionId) return;
    await discardDraft(activeVersionId);
    window.location.reload();
  }, [activeVersionId]);

  const handleMigrate = useCallback(async () => {
    setMigrating(true);
    try {
      const result = await migrateFromConfig();
      if (result.migrated) {
        setNeedsMigration(false);
      }
      window.location.reload();
    } finally {
      setMigrating(false);
    }
  }, []);

  // ── Migration prompt ──
  if (needsMigration) {
    return (
      <div
        className="flex items-start gap-4 border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000]"
        style={{ background: "var(--neo-accent)" }}
      >
        <Database className="size-10 shrink-0" />
        <div className="space-y-3">
          <h2 className="text-2xl font-black">教程数据尚未初始化</h2>
          <p className="text-sm font-bold text-black/70">
            点击下方按钮从 config.ts 导入现有的章节数据。
          </p>
          <button
            type="button"
            onClick={handleMigrate}
            disabled={migrating}
            className="inline-flex items-center gap-2 border-[3px] border-black bg-white px-5 py-3 text-sm font-black shadow-[4px_4px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
          >
            <Database className="size-4" />
            {migrating ? "迁移中..." : "从 config.ts 导入数据"}
          </button>
        </div>
      </div>
    );
  }

  // ── Full admin layout: same as /guide + edit controls ──
  return (
    <div className="flex flex-col gap-4">
      {/* Version management */}
      <TutorialAdminVersions
        versions={versions}
        activeVersionId={activeVersionId}
        onCreate={handleCreateVersion}
        onUpdateMeta={handleUpdateVersionMeta}
        onDelete={handleDeleteVersion}
        onSelect={handleSelectVersion}
      />

      {loadingVersion ? (
        <div className="border-4 border-black bg-white p-8 text-center shadow-[6px_6px_0px_0px_#000]">
          <p className="text-sm font-bold text-black/60">加载版本内容...</p>
        </div>
      ) : (
        <>
      {/* Admin toolbar */}
      <AdminToolbar
        hasChanges={hasChanges}
        saving={saving}
        publishing={publishing}
        hasDraft={hasDraft}
        onSave={handleSave}
        onPublish={handlePublish}
        onDiscard={handleDiscard}
      />

      {/* Hero header — same as /guide but with edit buttons */}
      <MotionReveal delay={0.04} rotate={-1}>
        <section
          className="inline-block border-4 border-black px-4 py-2.5 shadow-[6px_6px_0px_0px_#000]"
          style={{ background: "var(--neo-secondary)" }}
        >
          {/* Subtitle */}
          <div className="group relative inline-flex items-center gap-1">
            {editingSubtitle ? (
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                onBlur={(e) => handleSubtitleChange(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubtitleChange(e.currentTarget.value);
                  if (e.key === "Escape") setEditingSubtitle(false);
                }}
                className="w-24 border-[3px] border-black px-2 py-0 text-xs font-black uppercase tracking-[0.2em] outline-none"
                autoFocus
              />
            ) : (
              <>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-black/60">
                  {subtitle}
                </p>
                <button
                  type="button"
                  onClick={() => setEditingSubtitle(true)}
                  className="rounded p-0.5 text-black/30 opacity-0 transition group-hover:opacity-100 hover:text-black"
                  aria-label="编辑副标题"
                >
                  <Pencil className="size-3" />
                </button>
              </>
            )}
          </div>

          {/* Title */}
          <div className="group relative mt-1 inline-flex items-center gap-2">
            {editingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={(e) => handleTitleChange(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleChange(e.currentTarget.value);
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="w-80 border-[3px] border-black px-2 py-0 text-2xl font-black outline-none"
                autoFocus
              />
            ) : (
              <>
                <h1 className="text-2xl font-black text-black">{title}</h1>
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="rounded p-1 text-black/30 opacity-0 transition group-hover:opacity-100 hover:text-black"
                  aria-label="编辑标题"
                >
                  <Pencil className="size-4" />
                </button>
              </>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-2xl font-bold leading-6 text-black/70">
            <span>每节图文教程下方</span>
            <VideoHintBanner />
          </div>
        </section>
      </MotionReveal>

      {/* Tutorial tabs — same as /guide, but chapters are from draft state */}
      <MotionReveal delay={0.08} y={24} className="flex min-h-0 flex-1 flex-col">
        <TutorialTabs
          chapters={chapters}
          imageBasePath={imageBasePath}
          editable
          onReorder={handleReorder}
          onEditChapter={handleEditChapter}
          onDeleteChapter={handleDeleteChapter}
          onAddChapter={handleAddChapter}
          onEditChapterVideo={handleEditChapterVideo}
          onDeleteImage={handleDeleteImage}
          onMoveImage={handleMoveImage}
          onUploadImage={handleUploadImage}
          onUploadVideo={handleUploadVideo}
          onEditTextChapter={handleOpenTextEditor}
        />
      </MotionReveal>

      {/* Text chapter editor modal */}
      {textEditorChapterId && textEditorData && (
        <TextChapterEditorModal
          data={textEditorData}
          onSave={handleSaveTextEditor}
          onClose={() => {
            setTextEditorChapterId(null);
            setTextEditorData(null);
          }}
        />
      )}

      {/* Chapter key + title editor modal */}
      {chapterEditorId &&
        (() => {
          const ch = chapters.find((c) => c.id === chapterEditorId);
          return ch ? (
            <ChapterEditorModal
              chapterKey={ch.id}
              chapterTitle={ch.title}
              onSave={handleSaveChapterEditor}
              onClose={() => setChapterEditorId(null)}
            />
          ) : null;
        })()}

      {/* Chapter video URL editor modal */}
      {editingChapterVideo && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingChapterVideo(null);
          }}
        >
          <div className="w-full max-w-lg border-4 border-black bg-white p-6 shadow-[6px_6px_0px_0px_#000]">
            <h3 className="mb-3 text-sm font-black">
              编辑章节「{chapters.find((c) => c.id === editingChapterVideo)?.title ?? editingChapterVideo}」视频 URL
            </h3>
            <input
              type="text"
              value={editingVideoUrl}
              onChange={(e) => setEditingVideoUrl(e.target.value)}
              className="w-full border-[3px] border-black px-3 py-2 text-sm font-bold outline-none"
              placeholder="https://your-bucket.cos.region.myqcloud.com/tutorial/video.mp4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveChapterVideo();
                if (e.key === "Escape") setEditingChapterVideo(null);
              }}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingChapterVideo(null)}
                className="border-[3px] border-black bg-white px-4 py-1.5 text-xs font-black"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveChapterVideo}
                className="border-[3px] border-black bg-[var(--neo-accent)] px-4 py-1.5 text-xs font-black shadow-[2px_2px_0px_0px_#000]"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
