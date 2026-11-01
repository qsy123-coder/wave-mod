"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Sparkles, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { batchUploadModsAction } from "@/actions/admin/batch-upload-actions";
import type {
  BatchDriveLink,
  BatchUploadResult,
} from "@/lib/admin/batch-upload-types";
import { uploadRowImage } from "@/lib/admin/batch-image-upload";

import {
  dedupKey,
  extractVersion,
  resolveCanonicalKey,
  resolveCharacterAndTitle,
  stripRenameSuffix,
} from "../../../../../scripts/daily-classify.mjs";

import { CensorDialog } from "./censor-dialog";
import { CensorImageThumbs } from "./censor-image-thumbs";

const PLACEHOLDER_IMAGE_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/placeholder/mod-placeholder.webp";

type SingleModFormProps = {
  characters: string[];
  existingSet: Set<string>;
  date: string;
  onDateChange: (date: string) => void;
};

function buildDescription(character: string, title: string, quark: string, xunlei: string) {
  const platforms = [quark ? "夸克网盘" : "", xunlei ? "迅雷网盘" : ""].filter(Boolean).join(" / ");
  return `${character} ${title} MOD，${platforms}下载。`;
}

export function SingleModForm({ characters, existingSet, date, onDateChange }: SingleModFormProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [character, setCharacter] = useState("");
  const [version, setVersion] = useState("未标注");
  const [gameVersion, setGameVersion] = useState("未标注");
  const [description, setDescription] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [quarkUrl, setQuarkUrl] = useState("");
  const [xunleiUrl, setXunleiUrl] = useState("");

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [originalFiles, setOriginalFiles] = useState<File[]>([]);
  const [censorIndex, setCensorIndex] = useState<number | null>(null);

  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchUploadResult | null>(null);

  const characterSet = new Set(characters);
  const unknown = Boolean(character) && !characterSet.has(character);
  const existing = Boolean(character && title) && existingSet.has(dedupKey(character, title));
  const canSubmit = Boolean(title.trim() && character.trim() && quarkUrl.trim()) && !unknown;

  const markEdited = (field: string) => {
    setEditedFields((previous) => new Set([...previous, field]));
  };

  const parseTitle = () => {
    if (!title.trim()) {
      toast.error("先粘贴分享文件名或标题。");
      return;
    }

    const resolved = resolveCharacterAndTitle(resolveCanonicalKey(stripRenameSuffix(title)));
    const nextVersion = extractVersion(resolved.title);

    setTitle(resolved.title);
    setCharacter(resolved.character);
    setVersion(nextVersion);

    if (!descriptionTouched) {
      setDescription(buildDescription(resolved.character, resolved.title, quarkUrl, xunleiUrl));
    }

    toast.success(`解析为「${resolved.character}」| ${resolved.title}`);
  };

  const applyCensored = (file: File) => {
    if (censorIndex === null) return;
    setImageFiles((previous) => {
      const next = [...previous];
      next[censorIndex] = file;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("请先填写标题、角色和夸克链接；未知角色不能提交。");
      return;
    }

    setBusy(true);
    setResult(null);

    try {
      const driveLinks: BatchDriveLink[] = [{ platform: "夸克网盘", url: quarkUrl.trim() }];
      if (xunleiUrl.trim()) {
        driveLinks.push({ platform: "迅雷网盘", url: xunleiUrl.trim() });
      }

      const draftId = crypto.randomUUID();
      const images: string[] = [];

      for (const [index, file] of imageFiles.entries()) {
        images.push(
          await uploadRowImage({
            character,
            file,
            index,
            draftId,
          }),
        );
      }

      const response = await batchUploadModsAction({
        date,
        rows: [
          {
            title,
            character,
            version: version || "未标注",
            gameVersion: gameVersion || "未标注",
            description: descriptionTouched
              ? description
              : buildDescription(character, title, quarkUrl, xunleiUrl),
            nsfw,
            driveLinks,
            images: images.length > 0 ? images : [PLACEHOLDER_IMAGE_URL],
            editedFields: [...editedFields],
          },
        ],
      });

      setResult(response);
      if (response.ok) {
        toast.success(
          `入库完成：新增 ${response.inserted}、更新 ${response.updated}、重新上架 ${response.reshelved}`,
        );
      } else {
        toast.error(response.error ?? "入库失败");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交失败";
      setResult({
        ok: false,
        error: message,
        inserted: 0,
        updated: 0,
        reshelved: 0,
        duplicates: 0,
        failed: [],
      });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="border-4 border-black bg-white p-5 text-black shadow-[8px_8px_0px_0px_#000]">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-black uppercase tracking-[0.14em]">单条上传</p>
          <span
            className={`border-4 border-black px-3 py-1 text-xs font-black ${
              unknown ? "bg-[#ffb5c3] text-[#c1121f]" : existing ? "bg-[#c9e4ff]" : "bg-[#d8f5c8]"
            }`}
          >
            {unknown ? "角色未知" : existing ? "已存在（将更新）" : "新增"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.14em]">分享文件名 / 标题</span>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  markEdited("title");
                }}
                placeholder="例如：弗洛洛-新皮肤v1.0"
                className="min-w-0 flex-1 border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
              />
              <button
                type="button"
                onClick={parseTitle}
                className="neo-button-outline shrink-0 px-3 py-2 text-xs font-black"
              >
                解析
              </button>
            </div>
            <p className="text-[10px] font-bold text-black/60">
              粘贴每日更新文件夹里的文件名，解析角色和版本；也可以在解析后手动改。
            </p>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.14em]">角色</span>
            <input
              list="single-mod-characters"
              value={character}
              onChange={(event) => {
                setCharacter(event.target.value);
                markEdited("character");
              }}
              className={`w-full border-4 px-3 py-2 text-sm font-black ${
                unknown ? "border-[#c1121f] bg-[#ffe3e3] text-[#c1121f]" : "border-black bg-white text-black"
              }`}
            />
            {unknown ? <p className="text-[10px] font-black text-[#c1121f]">库内无此角色，不能提交</p> : null}
            <datalist id="single-mod-characters">
              {characters.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.14em]">版本</span>
            <input
              value={version}
              onChange={(event) => {
                setVersion(event.target.value);
                markEdited("version");
              }}
              className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.14em]">适配游戏版本</span>
            <input
              value={gameVersion}
              onChange={(event) => {
                setGameVersion(event.target.value);
                markEdited("gameVersion");
              }}
              className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.14em]">夸克链接（必填）</span>
            <input
              value={quarkUrl}
              onChange={(event) => setQuarkUrl(event.target.value)}
              placeholder="https://pan.quark.cn/s/..."
              className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.14em]">迅雷链接（可选）</span>
            <input
              value={xunleiUrl}
              onChange={(event) => setXunleiUrl(event.target.value)}
              placeholder="https://pan.xunlei.com/s/..."
              className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-black uppercase tracking-[0.14em]">简介</span>
            <textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setDescriptionTouched(true);
                markEdited("description");
              }}
              rows={3}
              className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-bold text-black"
            />
          </label>

          <div className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.14em]">归属日期</span>
            <input
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
            />
          </div>

          <label className="inline-flex items-center gap-2 self-end border-4 border-black bg-white px-3 py-2 text-xs font-black">
            <input
              type="checkbox"
              checked={nsfw}
              onChange={(event) => {
                setNsfw(event.target.checked);
                markEdited("nsfw");
              }}
              className="size-4 accent-black"
            />
            NSFW / 18+
          </label>
        </div>

        <div className="mt-4 space-y-2 border-4 border-black bg-[#fffdf5] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
              <Sparkles className="size-4" /> 预览图（可在上传前打码）
            </p>
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setImageFiles(files);
                setOriginalFiles(files);
                setCensorIndex(null);
              }}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="neo-button-outline px-3 py-2 text-xs font-black"
            >
              选择图片
            </button>
          </div>

          <CensorImageThumbs
            files={imageFiles}
            originals={originalFiles}
            onCensor={(index) => setCensorIndex(index)}
            onReset={() => setImageFiles([...originalFiles])}
            emptyLabel="未选图片（会用占位图）"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => void handleSubmit()}
            className="neo-button-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {busy ? "上传中…" : "上传并入库"}
          </button>

          {result ? (
            <span
              className={`border-4 border-black px-3 py-1.5 text-xs font-black ${
                result.ok ? "bg-[#d8f5c8]" : "bg-[#ffb5c3]"
              }`}
            >
              {result.ok
                ? `新增 ${result.inserted} / 更新 ${result.updated} / 重新上架 ${result.reshelved}`
                : result.error}
            </span>
          ) : null}
        </div>
      </section>

      <CensorDialog
        open={censorIndex !== null}
        file={censorIndex !== null ? originalFiles[censorIndex] ?? null : null}
        onOpenChange={(open) => {
          if (!open) setCensorIndex(null);
        }}
        onApply={applyCensored}
      />
    </div>
  );
}
