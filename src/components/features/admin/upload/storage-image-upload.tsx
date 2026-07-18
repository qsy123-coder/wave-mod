"use client";

import { useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  STORAGE_BUCKET,
  STORAGE_IMAGE_CONTENT_TYPES,
  STORAGE_MAX_IMAGE_BYTES,
  buildStoragePath,
  formatStorageFileSize,
} from "@/lib/storage/shared";

type StorageImageUploadProps = {
  defaultCharacter: string;
  onUploaded: (urls: string[]) => void;
};

export function StorageImageUpload({ defaultCharacter, onUploaded }: StorageImageUploadProps) {
  const [uploadSeed, setUploadSeed] = useState(() => crypto.randomUUID());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");

  const uploadSingleImage = async (file: File, character: string, index: number, total: number) => {
    const contentType = file.type || "image/webp";
    const supabase = createClient();
    const path = buildStoragePath(character, `${uploadSeed}-${index + 1}`, file.name);

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: "31536000",
      contentType,
      upsert: true,
    });

    if (error) {
      throw new Error(`Supabase Storage 上传失败：${error.message}`);
    }

    // 获取公网 URL
    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

    return publicUrlData.publicUrl;
  };

  const uploadImagesToStorage = async (files: FileList) => {
    if (uploadStatus === "uploading") {
      return;
    }

    setUploadStatus("uploading");
    setUploadProgress(0);
    setUploadError("");

    try {
      const selectedCharacter = (document.querySelector('select[name="character"]') as HTMLSelectElement | null)?.value;
      const character = selectedCharacter || defaultCharacter || "unknown";
      const fileList = Array.from(files);
      const uploadedUrls: string[] = [];

      for (const [index, file] of fileList.entries()) {
        const uploadedUrl = await uploadSingleImage(file, character, index, fileList.length);
        uploadedUrls.push(uploadedUrl);
        // 每上传完一张图更新进度
        setUploadProgress(Math.round(((index + 1) / fileList.length) * 100));
      }

      onUploaded(uploadedUrls);
      setUploadProgress(100);
      setUploadStatus("success");
      setUploadSeed(crypto.randomUUID());
      toast.success("预览图已上传到 Supabase Storage，图片地址已自动追加到文本框。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片上传失败，请稍后再试。";
      setUploadStatus("error");
      setUploadError(message);
      toast.error("预览图上传失败", {
        description: message,
      });
    }
  };

  return (
    <div className="border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-black">预览图上传到 Supabase Storage</p>
          <p className="mt-1 text-xs font-bold leading-6 text-black/70">
            支持多图上传，单张最大 {formatStorageFileSize(STORAGE_MAX_IMAGE_BYTES)}，成功后会自动追加到预览图地址输入框。
          </p>
        </div>
        <div className="relative inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]">
          {uploadStatus === "uploading" ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          <span>{uploadStatus === "uploading" ? "上传中" : "选择图片"}</span>
          <input
            type="file"
            accept={STORAGE_IMAGE_CONTENT_TYPES.join(",")}
            multiple
            disabled={uploadStatus === "uploading"}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(event) => {
              const fileList = event.target.files ? Array.from(event.target.files) : [];
              event.currentTarget.value = "";

              if (fileList.length === 0 || uploadStatus === "uploading") {
                return;
              }

              const oversizeFile = fileList.find((file) => file.size > STORAGE_MAX_IMAGE_BYTES);
              if (oversizeFile) {
                const message = `图片 ${oversizeFile.name} 超过 ${formatStorageFileSize(STORAGE_MAX_IMAGE_BYTES)} 限制。`;
                setUploadStatus("error");
                setUploadError(message);
                toast.error("预览图上传失败", { description: message });
                return;
              }

              const invalidFile = fileList.find(
                (file) => file.type && !(STORAGE_IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type),
              );
              if (invalidFile) {
                const message = `图片 ${invalidFile.name} 类型不受支持，请上传 PNG/JPEG/WebP/GIF。`;
                setUploadStatus("error");
                setUploadError(message);
                toast.error("预览图上传失败", { description: message });
                return;
              }

              const dataTransfer = new DataTransfer();
              fileList.forEach((file) => dataTransfer.items.add(file));
              uploadImagesToStorage(dataTransfer.files);
            }}
          />
        </div>
      </div>
      <div className="mt-4 h-4 overflow-hidden border-4 border-black bg-[#fff8ef]">
        <div
          className="h-full bg-[#7de2d1] transition-[width] duration-200"
          style={{ width: `${uploadProgress}%` }}
        />
      </div>
      <div className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-black/75">
        {uploadStatus === "idle"
          ? "等待上传"
          : uploadStatus === "uploading"
            ? `上传进度 ${uploadProgress}%`
            : uploadStatus === "success"
              ? "上传完成，已追加图片地址"
              : "上传失败"}
      </div>
      {uploadError ? <p className="mt-3 text-sm font-black text-[#c1121f]">{uploadError}</p> : null}
    </div>
  );
}
