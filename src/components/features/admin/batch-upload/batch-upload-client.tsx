"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { batchUploadModsAction } from "@/actions/admin/batch-upload-actions";
import { uploadRowImage, withConcurrency } from "@/lib/admin/batch-image-upload";
import type {
  BatchDriveLink,
  BatchUploadResult,
  BatchUploadRow,
} from "@/lib/admin/batch-upload-types";
import {
  createUploadPreviewImages,
  moveUploadPreviewImage,
  removeUploadPreviewImage,
  replaceUploadPreviewImage,
  restoreUploadPreviewImages,
} from "@/lib/admin/upload-preview-images";

import {
  MAX_IMAGES_PER_MOD,
  buildImageIndex,
  lookupImages,
  lookupSharedImages,
} from "../../../../../scripts/admin-image-match.mjs";
import { mergeVariantRows } from "../../../../../scripts/admin-variant-merge.mjs";
import {
  dedupKey,
  extractVersion,
  resolveCanonicalKey,
  resolveCharacterAndTitle,
  stripRenameSuffix,
} from "../../../../../scripts/daily-classify.mjs";
import { looseImageKey } from "../../../../../scripts/image-name-match.mjs";
import { normalizeManifest } from "../../../../../scripts/mod-groups-pure.mjs";
import { parseQuarkCsvText } from "../../../../../scripts/quark-csv-parse.mjs";
import { parseXunleiTxt, withXunleiPwd } from "../../../../../scripts/xunlei-txt-parse.mjs";

import { CensorDialog } from "./censor-dialog";
import { CensorImageThumbs } from "./censor-image-thumbs";
import { SingleModForm } from "./single-mod-form";

const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

const DEFAULT_GAME_VERSION = "未标注";
const UPLOAD_CONCURRENCY = 3;

type QuarkRecord = {
  key: string;
  filename: string;
  url: string;
  code: string;
};

type TxtRecord = {
  name: string;
  link: string;
  pwd: string;
};

type ImageEntry = {
  file: File;
  order: number;
};

/**
 * `exact` 按「图名 → 该 mod 自己的图」查；
 * `gallery` 按「帖子级键 → 同帖全部图」查，用来补帖子级预览图（见 `postGalleryKey`）。
 */
type ImageIndex = {
  exact: Map<string, ImageEntry[]>;
  gallery: Map<string, ImageEntry[]>;
};

type Props = {
  characters: string[];
  existingKeys: string[];
};

function todayShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeName(value: string): string {
  return stripRenameSuffix(String(value).replace(/\.exe$/i, "")).trim().toLowerCase();
}

function defaultDescription(character: string, title: string, driveLinks: BatchDriveLink[]): string {
  const platforms = driveLinks.map((link) => link.platform).join(" / ");
  return `${character} ${title} MOD，${platforms}下载。`;
}

function rowStatus(
  character: string,
  title: string,
  driveLinks: BatchDriveLink[],
  characterSet: Set<string>,
  existingSet: Set<string>,
): BatchUploadRow["status"] {
  if (!characterSet.has(character)) return "unknown-character";
  if (driveLinks.length === 0) return "missing-link";
  return existingSet.has(dedupKey(character, title)) ? "existing" : "new";
}

function readFileText(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    // 夸克导出偶尔是 GBK；出现替换字符时用 GBK 再解一次
    if (utf8.includes("�")) {
      try {
        return new TextDecoder("gbk").decode(buffer);
      } catch {
        return utf8;
      }
    }
    return utf8;
  });
}

function parseLooseXunleiTxt(text: string): TxtRecord[] {
  const records: TxtRecord[] = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(.*?)\s+(https?:\/\/pan\.xunlei\.com\/s\/\S+)(?:\s+(\S+))?/i);
    if (!match) continue;
    const name = match[1].replace(/\.exe$/i, "").trim();
    if (!name) continue;
    records.push({ name, link: match[2], pwd: match[3]?.trim() ?? "" });
  }

  return records;
}

function buildRows(
  quarkRecords: QuarkRecord[],
  txtRecords: TxtRecord[],
  imageIndex: ImageIndex,
  characterSet: Set<string>,
  existingSet: Set<string>,
  manifest: unknown,
): BatchUploadRow[] {
  const txtByName = new Map<string, TxtRecord>();
  for (const record of txtRecords) txtByName.set(normalizeName(record.name), record);

  const usedTxtNames = new Set<string>();
  const rows: BatchUploadRow[] = [];

  for (const record of quarkRecords) {
    const canonicalKey = resolveCanonicalKey(record.key);
    const { character, title } = resolveCharacterAndTitle(canonicalKey);
    const txt =
      txtByName.get(normalizeName(record.key)) ?? txtByName.get(normalizeName(canonicalKey));

    if (txt) usedTxtNames.add(normalizeName(txt.name));

    const driveLinks: BatchDriveLink[] = [{ platform: "夸克网盘", url: record.url }];
    if (txt) {
      driveLinks.push({ platform: "迅雷网盘", url: withXunleiPwd(txt.link, txt.pwd) });
    }

    const imageFiles = lookupImages(imageIndex, record.key, canonicalKey, title);
    const status = rowStatus(character, title, driveLinks, characterSet, existingSet);

    rows.push({
      id: `csv:${record.key}`,
      sourceKey: record.key,
      title,
      character,
      version: extractVersion(title),
      gameVersion: DEFAULT_GAME_VERSION,
      description: defaultDescription(character, title, driveLinks),
      nsfw: false,
      driveLinks,
      images: [],
      previewImages: createUploadPreviewImages(imageFiles),
      include: status !== "unknown-character" && status !== "missing-link",
      status,
      editedFields: [],
      txtOnly: false,
    });
  }

  // 只有迅雷、CSV 里没有的行：列出来但默认不勾选
  for (const record of txtRecords) {
    if (usedTxtNames.has(normalizeName(record.name))) continue;

    const canonicalKey = resolveCanonicalKey(stripRenameSuffix(record.name));
    const { character, title } = resolveCharacterAndTitle(canonicalKey);
    const driveLinks: BatchDriveLink[] = [
      { platform: "迅雷网盘", url: withXunleiPwd(record.link, record.pwd) },
    ];
    const imageFiles = lookupImages(imageIndex, record.name, canonicalKey, title);
    const status = rowStatus(character, title, driveLinks, characterSet, existingSet);

    rows.push({
      id: `txt:${record.name}`,
      sourceKey: record.name,
      title,
      character,
      version: extractVersion(title),
      gameVersion: DEFAULT_GAME_VERSION,
      description: defaultDescription(character, title, driveLinks),
      nsfw: false,
      driveLinks,
      images: [],
      previewImages: createUploadPreviewImages(imageFiles),
      include: false,
      status,
      editedFields: [],
      txtOnly: true,
    });
  }

  return mergeVariantRows(attachSharedImages(rows, imageIndex), manifest);
}

/**
 * 重建行时把用户改过的字段按 id 带回来。
 *
 * 合并行的 id 是 `group:<基行 id>`，基行 id 稳定（`csv:<sourceKey>`），
 * 所以重选图片/重载清单不会把整卡改回默认值。
 */
function carryRowEdits(next: BatchUploadRow[], previous: BatchUploadRow[]): BatchUploadRow[] {
  const byId = new Map(previous.map((row) => [row.id, row]));
  return next.map((row) => {
    const old = byId.get(row.id);
    if (!old || old.editedFields.length === 0) return row;

    const merged = { ...row, editedFields: [...old.editedFields] };
    for (const field of old.editedFields) {
      if (field === "character") merged.character = old.character;
      else if (field === "title") merged.title = old.title;
      else if (field === "version") merged.version = old.version;
      else if (field === "gameVersion") merged.gameVersion = old.gameVersion;
      else if (field === "description") merged.description = old.description;
      else if (field === "nsfw") merged.nsfw = old.nsfw;
    }
    return merged;
  });
}

/**
 * 给每行补同帖的「帖子级预览图」，并裁到上限。
 *
 * 后台只有 CSV + 图片，没有 `.mod-groups.json`，所以靠 `postGalleryKey` 从名字推断
 * 帖子边界；`variantKeys` 用所有行自己的宽松键，避免把别的变体主图并进来。
 */
function attachSharedImages(rows: BatchUploadRow[], index: ImageIndex): BatchUploadRow[] {
  const variantKeys = new Set<string>();
  for (const row of rows) {
    for (const key of [row.sourceKey, row.title]) {
      const loose = looseImageKey(key);
      if (loose) variantKeys.add(loose);
    }
  }

  return rows.map((row) => {
    const ownFiles = row.previewImages.map((image) => image.file);
    const shared = lookupSharedImages(index, row.sourceKey, row.title, ownFiles, variantKeys);
    if (shared.length === 0) return row;

    const merged = [...ownFiles, ...shared].slice(0, MAX_IMAGES_PER_MOD);
    return { ...row, previewImages: createUploadPreviewImages(merged) };
  });
}

export function BatchUploadClient({ characters, existingKeys }: Props) {
  const characterSet = useMemo(() => new Set(characters), [characters]);
  const existingSet = useMemo(() => new Set(existingKeys), [existingKeys]);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);

  const [quarkRecords, setQuarkRecords] = useState<QuarkRecord[]>([]);
  const [txtRecords, setTxtRecords] = useState<TxtRecord[]>([]);
  const [imageIndex, setImageIndex] = useState<ImageIndex>(() => ({
    exact: new Map(),
    gallery: new Map(),
  }));
  const [imageFileCount, setImageFileCount] = useState(0);
  const [manifest, setManifest] = useState<unknown>(null);
  const [manifestName, setManifestName] = useState("");

  const [rows, setRows] = useState<BatchUploadRow[]>([]);
  const [date, setDate] = useState(todayShanghai);
  const [mode, setMode] = useState<"batch" | "single">("batch");
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [result, setResult] = useState<BatchUploadResult | null>(null);
  const [censorTarget, setCensorTarget] = useState<{ rowId: string; index: number } | null>(null);

  const includedRows = rows.filter(
    (row) => row.include && row.status !== "unknown-character" && row.driveLinks.length > 0,
  );
  const unknownCount = rows.filter((row) => row.status === "unknown-character").length;
  const missingImageCount = rows.filter((row) => row.previewImages.length === 0).length;

  const rebuild = (
    nextQuark: QuarkRecord[],
    nextTxt: TxtRecord[],
    nextImages: ImageIndex,
    nextManifest: unknown = manifest,
  ) => {
    setRows(buildRows(nextQuark, nextTxt, nextImages, characterSet, existingSet, nextManifest));
  };

  const handleCsv = async (file: File) => {
    setParseError("");
    setResult(null);

    try {
      const text = await readFileText(file);
      const parsed = parseQuarkCsvText(text) as QuarkRecord[];

      if (parsed.length === 0) {
        setParseError("CSV 没有解析出任何带夸克链接的记录，请检查导出文件。");
        return;
      }

      // 同一个分享名只保留第一条，避免同批重复
      const unique = new Map<string, QuarkRecord>();
      for (const record of parsed) unique.set(record.key, unique.get(record.key) ?? record);

      const next = [...unique.values()];
      setQuarkRecords(next);
      rebuild(next, txtRecords, imageIndex);
      toast.success(`CSV 解析出 ${next.length} 条`);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "CSV 解析失败");
    }
  };

  const handleTxt = async (file: File) => {
    setParseError("");
    setResult(null);

    try {
      const text = await file.text();
      let parsed = parseXunleiTxt(text) as TxtRecord[];
      if (parsed.length === 0) parsed = parseLooseXunleiTxt(text);

      if (parsed.length === 0) {
        setParseError("txt 没有识别出迅雷记录；如果格式是「分享文件/链接/提取码」三行，请检查内容。");
        return;
      }

      setTxtRecords(parsed);
      rebuild(quarkRecords, parsed, imageIndex);
      toast.success(`txt 解析出 ${parsed.length} 条迅雷链接`);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "txt 解析失败");
    }
  };

  const handleImages = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    const index = buildImageIndex(list);
    setImageIndex(index);
    setImageFileCount(list.length);
    // 行可能是已合并的「同帖多版本」卡片，按源记录重新构建整批，合并才不会被拆散；
    // 用户在表里改过的字段要按行 id 带回来，否则重选图片会把改动抹掉。
    setRows((previous) =>
      carryRowEdits(buildRows(quarkRecords, txtRecords, index, characterSet, existingSet, manifest), previous),
    );
  };

  const handleManifest = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const normalized = normalizeManifest(parsed);
      if (!normalized) {
        setParseError("分组清单格式不对：需要 version=1 且至少含 2 个变体的 group。");
        return;
      }
      setParseError("");
      setManifest(normalized);
      setManifestName(file.name);
      rebuild(quarkRecords, txtRecords, imageIndex, normalized);
      const groupCount = Object.keys(normalized.groups ?? {}).length;
      toast.success(`分组清单已载入：${groupCount} 个帖子`);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "分组清单解析失败");
    }
  };

  const applyCensoredImage = (rowId: string, index: number, file: File) => {
    setRows((previous) =>
      previous.map((row) =>
        row.id === rowId
          ? { ...row, previewImages: replaceUploadPreviewImage(row.previewImages, index, file) }
          : row,
      ),
    );
  };

  const resetCensoredImages = (rowId: string) => {
    setRows((previous) =>
      previous.map((row) =>
        row.id === rowId ? { ...row, previewImages: restoreUploadPreviewImages(row.previewImages) } : row,
      ),
    );
  };

  const removeRowImage = (rowId: string, index: number) => {
    setRows((previous) =>
      previous.map((row) =>
        row.id === rowId
          ? { ...row, previewImages: removeUploadPreviewImage(row.previewImages, index) }
          : row,
      ),
    );
  };

  const moveRowImage = (rowId: string, from: number, to: number) => {
    setRows((previous) =>
      previous.map((row) =>
        row.id === rowId
          ? { ...row, previewImages: moveUploadPreviewImage(row.previewImages, from, to) }
          : row,
      ),
    );
  };

  const updateRow = (id: string, patch: Partial<BatchUploadRow>, editedField?: string) => {
    setRows((previous) =>
      previous.map((row) => {
        if (row.id !== id) return row;

        const next = { ...row, ...patch };
        if (editedField) {
          next.editedFields = [...new Set([...row.editedFields, editedField])];
        }
        if (patch.character !== undefined || patch.title !== undefined) {
          next.status = rowStatus(
            next.character,
            next.title,
            next.driveLinks,
            characterSet,
            existingSet,
          );
          if (next.status === "unknown-character" || next.status === "missing-link") {
            next.include = false;
          } else if (row.status === "unknown-character" || row.status === "missing-link") {
            // 修正了角色/链接：自动重新勾选，省得用户还要手动点一下
            next.include = true;
          }
        }
        return next;
      }),
    );
  };

  const applyBulkCharacter = (character: string) => {
    if (!character) return;

    setRows((previous) =>
      previous.map((row) => {
        if (!includedRows.some((included) => included.id === row.id)) return row;
        const next = {
          ...row,
          character,
          editedFields: [...new Set([...row.editedFields, "character"])],
        };
        next.status = rowStatus(character, next.title, next.driveLinks, characterSet, existingSet);
        next.include = next.status !== "unknown-character" && next.driveLinks.length > 0;
        return next;
      }),
    );
  };

  const toggleInclude = (id: string, value: boolean) => {
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, include: value } : row)),
    );
  };

  const handleSubmit = async () => {
    if (includedRows.length === 0) {
      toast.error("没有可提交的行：请先选择 CSV，并修正未知角色/缺失链接。");
      return;
    }

    setBusy(true);
    setResult(null);

    type Gallery = {
      row: BatchUploadRow;
      /** null = 普通行（没有变体概念）；否则是该变体标签 */
      label: string | null;
      images: { file: File }[];
    };
    const galleries: Gallery[] = [];
    const draftIdByGallery = new Map<string, string>();
    const imageSlotsByGallery = new Map<string, (string | null)[]>();
    const imageTasks: { gallery: Gallery; file: File; index: number }[] = [];

    const galleryKeyOf = (row: BatchUploadRow, label: string | null) =>
      `${row.id}::${label ?? ""}`;

    for (const row of includedRows) {
      // 合并行：每个变体单独一套 COS 前缀，避免不同版本的 preview.webp 互相覆盖。
      // 基变体（variantImages 的第一个键）用表格里那一套图 —— 用户可能在表里删/打码过。
      const labels = row.variantImages ? Object.keys(row.variantImages) : [];
      const entries: Gallery[] = [];

      if (labels.length === 0) {
        entries.push({ row, label: null, images: row.previewImages });
      } else {
        const baseLabel = row.baseVariantLabel ?? labels[0];
        for (const label of labels) {
          // 基变体复用表格里那套可编辑的图（用户可能删过/打过码），其余用各自画廊
          const images = label === baseLabel ? row.previewImages : row.variantImages?.[label] ?? [];
          if (images.length > 0) entries.push({ row, label, images });
        }
      }

      for (const gallery of entries) {
        const gkey = galleryKeyOf(row, gallery.label);
        draftIdByGallery.set(gkey, crypto.randomUUID());
        const files = gallery.images.slice(0, MAX_IMAGES_PER_MOD);
        imageSlotsByGallery.set(gkey, Array.from({ length: files.length }, () => null));
        files.forEach((image, index) => imageTasks.push({ gallery, file: image.file, index }));
        galleries.push(gallery);
      }
    }

    setProgress({ done: 0, total: imageTasks.length, label: "上传预览图" });

    const failedRows = new Map<string, string>();
    // 合并行的「帖子级附加图」在每个变体画廊里是同一个 File 引用：
    // 同一张图只传一次，其余画廊复用 URL（否则 6 个版本会把同样 11 张图传 6 遍）。
    const uploadedByFile = new Map<File, Promise<string>>();

    try {
      let done = 0;

      await withConcurrency(imageTasks, UPLOAD_CONCURRENCY, async (task) => {
        try {
          const gkey = galleryKeyOf(task.gallery.row, task.gallery.label);
          const draftId = draftIdByGallery.get(gkey);
          if (!draftId) throw new Error("缺少上传标识");

          let pending = uploadedByFile.get(task.file);
          if (!pending) {
            pending = uploadRowImage({
              character: task.gallery.row.character,
              file: task.file,
              index: task.index,
              draftId,
            });
            uploadedByFile.set(task.file, pending);
            // 失败不要缓存，后面的画廊还能重试
            pending.catch(() => uploadedByFile.delete(task.file));
          }
          const url = await pending;
          // 写下标而不是 push：并发完成后 images[0] 仍然必须是主图
          const slots = imageSlotsByGallery.get(gkey);
          if (slots) slots[task.index] = url;
        } catch (error) {
          failedRows.set(
            task.gallery.row.id,
            error instanceof Error ? error.message : "预览图上传失败",
          );
        } finally {
          done++;
          setProgress({ done, total: imageTasks.length, label: "上传预览图" });
        }
      });

      const uploadedGallery = (row: BatchUploadRow, label: string | null) =>
        (imageSlotsByGallery.get(galleryKeyOf(row, label)) ?? []).filter(
          (url): url is string => Boolean(url),
        );

      const payloadRows = includedRows
        .filter((row) => !failedRows.has(row.id))
        .map((row) => {
          const labels = row.variantImages ? Object.keys(row.variantImages) : [];

          if (labels.length === 0) {
            const images = uploadedGallery(row, null);
            return {
              title: row.title,
              character: row.character,
              version: row.version || "未标注",
              gameVersion: row.gameVersion || DEFAULT_GAME_VERSION,
              description: row.description,
              nsfw: row.nsfw,
              driveLinks: row.driveLinks,
              images: images.length > 0 ? images : [PLACEHOLDER_IMAGE_URL],
              editedFields: row.editedFields,
            };
          }

          const variantImages: Record<string, string[]> = {};
          for (const label of labels) {
            const urls = uploadedGallery(row, label);
            if (urls.length > 0) variantImages[label] = urls;
          }
          const cover = uploadedGallery(row, row.baseVariantLabel ?? labels[0]);

          return {
            title: row.title,
            character: row.character,
            version: row.version || "未标注",
            gameVersion: row.gameVersion || DEFAULT_GAME_VERSION,
            description: row.description,
            nsfw: row.nsfw,
            driveLinks: row.driveLinks,
            images: cover.length > 0 ? cover : [PLACEHOLDER_IMAGE_URL],
            variantImages,
            editedFields: row.editedFields,
          };
        });

      if (payloadRows.length === 0) {
        setResult({
          ok: false,
          error: "所有行的预览图都上传失败，未写库。",
          inserted: 0,
          updated: 0,
          reshelved: 0,
          duplicates: 0,
          failed: [...failedRows.entries()].map(([id, error]) => ({
            title: rows.find((row) => row.id === id)?.title ?? id,
            error,
          })),
        });
        return;
      }

      setProgress({
        done: imageTasks.length,
        total: imageTasks.length,
        label: "写入数据库",
      });

      const response = await batchUploadModsAction({ date, rows: payloadRows });

      if (failedRows.size > 0) {
        response.failed = [
          ...response.failed,
          ...[...failedRows.entries()].map(([id, error]) => ({
            title: rows.find((row) => row.id === id)?.title ?? id,
            error,
          })),
        ];
      }

      setResult(response);
      if (response.ok) {
        toast.success(
          `入库完成：新增 ${response.inserted}、更新 ${response.updated}、重新上架 ${response.reshelved}`,
        );
      } else {
        toast.error(response.error ?? "入库失败");
      }
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "提交失败",
        inserted: 0,
        updated: 0,
        reshelved: 0,
        duplicates: 0,
        failed: [],
      });
      toast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setBusy(false);
      setProgress({ done: 0, total: 0, label: "" });
    }
  };

  const censorRow = censorTarget ? rows.find((row) => row.id === censorTarget.rowId) ?? null : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("batch")}
          className={`border-4 border-black px-5 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] ${
            mode === "batch" ? "bg-[#ffd84f] text-black" : "bg-white text-black"
          }`}
        >
          批量模式（CSV + txt）
        </button>
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`border-4 border-black px-5 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-[4px_4px_0px_0px_#000] ${
            mode === "single" ? "bg-[#ffd84f] text-black" : "bg-white text-black"
          }`}
        >
          单条模式
        </button>
      </div>

      {mode === "batch" ? (
        <>
      <section className="neo-card-lg bg-[var(--neo-panel)] p-5 text-black">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="border-4 border-black bg-white p-4 shadow-[5px_5px_0px_0px_#000]">
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
              <FileSpreadsheet className="size-4" /> 夸克 CSV（必填）
            </p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleCsv(file);
              }}
            />
            <button
              type="button"
              className="neo-button-outline w-full px-3 py-2 text-xs font-black"
              onClick={() => csvInputRef.current?.click()}
            >
              {quarkRecords.length > 0 ? `已解析 ${quarkRecords.length} 条，重新选择` : "选择 CSV"}
            </button>
          </div>

          <div className="border-4 border-black bg-white p-4 shadow-[5px_5px_0px_0px_#000]">
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
              <FileText className="size-4" /> 迅雷 txt（可选）
            </p>
            <input
              ref={txtInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleTxt(file);
              }}
            />
            <button
              type="button"
              className="neo-button-outline w-full px-3 py-2 text-xs font-black"
              onClick={() => txtInputRef.current?.click()}
            >
              {txtRecords.length > 0 ? `已解析 ${txtRecords.length} 条，重新选择` : "选择 txt"}
            </button>
          </div>

          <div className="border-4 border-black bg-white p-4 shadow-[5px_5px_0px_0px_#000]">
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
              <FolderOpen className="size-4" /> 预览图文件夹
            </p>
            <input
              ref={imagesInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(event) => handleImages(event.target.files)}
            />
            <button
              type="button"
              className="neo-button-outline w-full px-3 py-2 text-xs font-black"
              onClick={() => imagesInputRef.current?.click()}
            >
              {imageFileCount > 0 ? `已选 ${imageFileCount} 张，重新选择` : "选择图片文件夹"}
            </button>
          </div>

          <div className="border-4 border-black bg-white p-4 shadow-[5px_5px_0px_0px_#000]">
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
              <FileSpreadsheet className="size-4" /> 分组清单（可选）
            </p>
            <input
              ref={manifestInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleManifest(file);
              }}
            />
            <button
              type="button"
              className="neo-button-outline w-full px-3 py-2 text-xs font-black"
              onClick={() => manifestInputRef.current?.click()}
            >
              {manifestName ? `已载入 ${manifestName}，重新选择` : "选择 .mod-groups.json"}
            </button>
            <p className="mt-1 text-[10px] font-bold text-black/55">
              传了清单才能拿到 `Base SFW` 这类准确版本名；不传则按名字推断
            </p>
          </div>

          <div className="border-4 border-black bg-white p-4 shadow-[5px_5px_0px_0px_#000]">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em]">归属日期</p>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
            />
            <p className="mt-1 text-[10px] font-bold text-black/55">created_at 写当天中午（上海）</p>
          </div>
        </div>

        {parseError ? (
          <p className="mt-4 border-4 border-black bg-[#ffb5c3] px-4 py-3 text-sm font-black">
            {parseError}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-black text-black">
            <span className="border-4 border-black bg-white px-3 py-1.5">共 {rows.length} 条</span>
            <span className="border-4 border-black bg-[#d8f5c8] px-3 py-1.5">
              可提交 {includedRows.length}
            </span>
            <span className="border-4 border-black bg-[#ffd84f] px-3 py-1.5">
              未知角色 {unknownCount}
            </span>
            <span className="border-4 border-black bg-[#ffb5c3] px-3 py-1.5">
              缺预览图 {missingImageCount}
            </span>
            <button
              type="button"
              className="neo-button-outline px-3 py-1.5"
              onClick={() =>
                setRows((previous) =>
                  previous.map((row) => ({
                    ...row,
                    include:
                      row.status !== "unknown-character" && row.driveLinks.length > 0,
                  })),
                )
              }
            >
              全选可提交
            </button>
            <button
              type="button"
              className="neo-button-outline px-3 py-1.5"
              onClick={() => setRows((previous) => previous.map((row) => ({ ...row, include: false })))}
            >
              全不选
            </button>
            <select
              defaultValue=""
              className="border-4 border-black bg-white px-3 py-1.5 text-xs font-black text-black"
              onChange={(event) => {
                applyBulkCharacter(event.target.value);
                event.currentTarget.value = "";
              }}
            >
              <option value="">批量设置角色…</option>
              {characters.map((character) => (
                <option key={character} value={character}>
                  {character}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section className="overflow-x-auto border-4 border-black bg-white text-black shadow-[8px_8px_0px_0px_#000]">
          <table className="w-full min-w-[1400px] border-collapse text-left text-xs text-black">
            <thead className="bg-black text-white">
              <tr>
                <th className="px-2 py-2">提交</th>
                <th className="px-2 py-2">状态</th>
                <th className="px-2 py-2">标题</th>
                <th className="px-2 py-2">角色</th>
                <th className="px-2 py-2">版本</th>
                <th className="px-2 py-2">适配版本</th>
                <th className="px-2 py-2">网盘链接</th>
                <th className="px-2 py-2">预览图</th>
                <th className="px-2 py-2">简介</th>
                <th className="px-2 py-2">NSFW</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const unknown = !characterSet.has(row.character);
                return (
                  <tr key={row.id} className="border-b-2 border-black/15 align-top">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        disabled={row.status === "unknown-character" || row.driveLinks.length === 0}
                        onChange={(event) => toggleInclude(row.id, event.target.checked)}
                        className="size-4 accent-black"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge row={row} />
                    </td>
                    <td className="max-w-[260px] px-2 py-2 font-black">
                      {row.title}
                      {row.txtOnly ? (
                        <span className="ml-1 border-2 border-black bg-[#ffd84f] px-1 py-0.5 text-[9px]">
                          仅迅雷
                        </span>
                      ) : null}
                      {row.variantImages ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="border-2 border-black bg-black px-1 py-0.5 text-[9px] text-white">
                            合并 {Object.keys(row.variantImages).length} 个版本
                          </span>
                          {Object.keys(row.variantImages).map((label) => (
                            <span
                              key={label}
                              className="border-2 border-black bg-[#d8f5c8] px-1 py-0.5 text-[9px]"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        list="batch-upload-characters"
                        value={row.character}
                        onChange={(event) =>
                          updateRow(row.id, { character: event.target.value }, "character")
                        }
                        className={`w-28 border-4 px-2 py-1 font-black ${
                          unknown ? "border-[#c1121f] bg-[#ffe3e3] text-[#c1121f]" : "border-black bg-white text-black"
                        }`}
                      />
                      {unknown ? (
                        <p className="mt-1 text-[10px] font-black text-[#c1121f]">库内无此角色</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.version}
                        onChange={(event) => updateRow(row.id, { version: event.target.value }, "version")}
                        className="w-20 border-4 border-black bg-white px-2 py-1 font-black text-black"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.gameVersion}
                        onChange={(event) =>
                          updateRow(row.id, { gameVersion: event.target.value }, "gameVersion")
                        }
                        className="w-20 border-4 border-black bg-white px-2 py-1 font-black text-black"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        {row.driveLinks.map((link) => (
                          <span key={link.platform} className="truncate">
                            <b>{link.platform}</b>：{link.url}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <CensorImageThumbs
                        images={row.previewImages}
                        onCensor={(index) => setCensorTarget({ rowId: row.id, index })}
                        onRemove={(index) => removeRowImage(row.id, index)}
                        onReorder={(from, to) => moveRowImage(row.id, from, to)}
                        onReset={() => resetCensoredImages(row.id)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <textarea
                        value={row.description}
                        onChange={(event) =>
                          updateRow(row.id, { description: event.target.value }, "description")
                        }
                        rows={3}
                        className="w-64 border-4 border-black bg-white px-2 py-1 font-bold text-black"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.nsfw}
                        onChange={(event) => updateRow(row.id, { nsfw: event.target.checked }, "nsfw")}
                        className="size-4 accent-black"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="batch-upload-characters">
            {characters.map((character) => (
              <option key={character} value={character} />
            ))}
          </datalist>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-4 border-4 border-black bg-[var(--neo-secondary)] p-5 text-black shadow-[8px_8px_0px_0px_#000]">
        <button
          type="button"
          disabled={busy || includedRows.length === 0}
          onClick={() => void handleSubmit()}
          className="neo-button-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          {busy ? "处理中…" : `上传并入库（${includedRows.length} 条）`}
        </button>

        {busy && progress.total > 0 ? (
          <div className="min-w-[240px] flex-1">
            <p className="mb-1 text-xs font-black">
              {progress.label}：{progress.done}/{progress.total}
            </p>
            <div className="h-4 border-4 border-black bg-white">
              <div
                className="h-full bg-[var(--neo-accent)] transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-black">
            {result.ok ? (
              <span className="inline-flex items-center gap-1 border-4 border-black bg-[#d8f5c8] px-3 py-1.5">
                <CheckCircle2 className="size-4" /> 新增 {result.inserted} / 更新 {result.updated} /
                重新上架 {result.reshelved}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 border-4 border-black bg-[#ffb5c3] px-3 py-1.5">
                <AlertTriangle className="size-4" /> {result.error}
              </span>
            )}
            {result.duplicates > 0 ? (
              <span className="border-4 border-black bg-[#ffd84f] px-3 py-1.5">
                批内合并重复 {result.duplicates} 条
              </span>
            ) : null}
            {result.failed.length > 0 ? (
              <span className="inline-flex items-center gap-1 border-4 border-black bg-[#ffb5c3] px-3 py-1.5">
                <RefreshCw className="size-4" /> 失败 {result.failed.length} 条
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {result?.failed.length ? (
        <section className="border-4 border-black bg-white p-4 text-black shadow-[6px_6px_0px_0px_#000]">
          <p className="mb-2 text-sm font-black text-[#c1121f]">失败明细</p>
          <ul className="space-y-1 text-xs font-bold">
            {result.failed.map((item) => (
              <li key={`${item.title}-${item.error}`}>
                {item.title}：{item.error}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 border-4 border-black bg-white p-4 text-xs font-bold leading-6 text-black/75 shadow-[6px_6px_0px_0px_#000] md:grid-cols-2">
        <p>· CSV：夸克「分享结果导出」原文件，第 2 列是分享名，分享内容里带 pan.quark.cn 链接。</p>
        <p>· txt：迅雷「分享文件 / 链接 / 提取码」三行格式，或「标题 + 链接」一行格式。</p>
        <p>· 预览图：文件名 = 标题；`标题-1.png`、`标题-2.png` 是副图，主图无编号。</p>
        <p>· 已存在的 mod 会更新网盘/图片并重新上架；简介/版本只在您改过时覆盖。</p>
      </section>
        </>
      ) : (
        <SingleModForm
          characters={characters}
          existingSet={existingSet}
          date={date}
          onDateChange={setDate}
        />
      )}

      <CensorDialog
        open={Boolean(censorTarget)}
        file={censorRow && censorTarget ? censorRow.previewImages[censorTarget.index]?.original ?? null : null}
        onOpenChange={(open) => {
          if (!open) setCensorTarget(null);
        }}
        onApply={(file) => {
          if (censorTarget) {
            applyCensoredImage(censorTarget.rowId, censorTarget.index, file);
            setCensorTarget(null);
          }
        }}
      />
    </div>
  );
}

function StatusBadge({ row }: { row: BatchUploadRow }) {
  if (row.status === "unknown-character") {
    return <span className="border-4 border-black bg-[#ffb5c3] px-2 py-1 font-black">角色未知</span>;
  }
  if (row.status === "missing-link") {
    return <span className="border-4 border-black bg-[#ffb5c3] px-2 py-1 font-black">缺链接</span>;
  }
  if (row.status === "existing") {
    return <span className="border-4 border-black bg-[#c9e4ff] px-2 py-1 font-black">已存在</span>;
  }
  return <span className="border-4 border-black bg-[#d8f5c8] px-2 py-1 font-black">新增</span>;
}
