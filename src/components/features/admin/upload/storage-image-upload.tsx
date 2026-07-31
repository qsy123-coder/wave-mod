"use client";

import { useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import COS from "cos-js-sdk-v5";

import { createClient } from "@/lib/supabase/client";
import {
  STORAGE_BUCKET,
  STORAGE_IMAGE_CONTENT_TYPES,
  STORAGE_MAX_IMAGE_BYTES,
  buildStoragePath,
  formatStorageFileSize,
} from "@/lib/storage/shared";
import {
  COS_IMAGE_CONTENT_TYPES,
  COS_MAX_IMAGE_BYTES,
  formatCosFileSize,
} from "@/lib/cos/shared";

type StorageImageUploadProps = {
  defaultCharacter: string;
  onUploaded: (urls: string[]) => void;
};

type CosSignResult = {
  ok: boolean;
  objectKey: string;
  publicUrl: string;
  bucket: string;
  region: string;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
    startTime: number;
    expiredTime: number;
  };
  error?: string;
};

/**
 * 从服务端获取 COS 临时密钥
 */
async function getCosSign(body: {
  character: string;
  contentType: string;
  fileSize: number;
  filename: string;
  modId: string;
}): Promise<CosSignResult> {
  const res = await fetch("/api/cos/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `COS 签名请求失败（${res.status}）`);
  }

  return res.json();
}

/**
 * 将图片转为 WebP（Canvas API，客户端转换）。
 * 已是 WebP 或 GIF（动图）则跳过，保持原样。
 *
 * @param file 原始图片文件
 * @param quality WebP 质量 0-1，默认 0.85
 * @returns 转换后的 File（扩展名改为 .webp）
 */
async function convertToWebP(file: File, quality = 0.85): Promise<File> {
  // 已是 WebP/GIF，不转换
  if (file.type === "image/webp" || file.type === "image/gif") {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file); // 降级：原样上传
        return;
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // 降级
            return;
          }

          const originalName = file.name.replace(/\.[^.]+$/, "");
          const webpFile = new File([blob], `${originalName}.webp`, {
            type: "image/webp",
          });
          resolve(webpFile);
        },
        "image/webp",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // 转换失败，原样上传
    };

    img.src = url;
  });
}

/**
 * 上传单张图片到 COS
 */
function uploadToCos(file: File, sign: CosSignResult, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const cos = new COS({
      SecretId: sign.credentials.tmpSecretId,
      SecretKey: sign.credentials.tmpSecretKey,
      SecurityToken: sign.credentials.sessionToken,
      StartTime: sign.credentials.startTime,
      ExpiredTime: sign.credentials.expiredTime,
    });

    cos.putObject(
      {
        Bucket: sign.bucket,
        Region: sign.region,
        Key: sign.objectKey,
        Body: file,
        onProgress: (info) => {
          if (onProgress && info.total > 0) {
            onProgress(Math.round((info.loaded / info.total) * 100));
          }
        },
      },
      (err) => {
        if (err) {
          reject(new Error(`COS 上传失败：${err.message}`));
          return;
        }
        resolve(sign.publicUrl);
      },
    );
  });
}

/**
 * 上传单张图片到 Supabase Storage（备份）
 */
async function uploadToSupabase(file: File, character: string, uploadSeed: string, index: number) {
  const contentType = file.type || "image/webp";
  const supabase = createClient();
  const path = buildStoragePath(character, `${uploadSeed}-${index + 1}`, file.name);

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType,
    upsert: true,
  });

  if (error) {
    // 备份上传失败仅警告，不阻断主流程
    console.warn("[storage-image-upload] Supabase 备份上传失败：", error.message);
    return null;
  }

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

export function StorageImageUpload({ defaultCharacter, onUploaded }: StorageImageUploadProps) {
  const [uploadSeed, setUploadSeed] = useState(() => crypto.randomUUID());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");

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
        // 0. 转为 WebP（PNG/JPEG → WebP，GIF/已有 WebP 跳过）
        const converted = await convertToWebP(file, 0.85);
        let url: string | null = null;

        // 1. 尝试上传到 COS（主存储）
        try {
          const sign = await getCosSign({
            character,
            contentType: converted.type || "image/webp",
            fileSize: converted.size,
            filename: converted.name,
            modId: uploadSeed,
          });
          url = await uploadToCos(converted, sign, (pct) => {
            // COS 上传进度（约占每张图进度的 90%，留 10% 给 Supabase 备份）
            const perFileWeight = 100 / fileList.length;
            const base = index * perFileWeight;
            const cosWeight = perFileWeight * 0.9;
            setUploadProgress(Math.round(base + (pct / 100) * cosWeight));
          });
        } catch (cosError) {
          const message = cosError instanceof Error ? cosError.message : "COS 上传失败";
          console.warn("[storage-image-upload] COS 上传失败，降级到 Supabase：", message);
        }

        // 2. 上传到 Supabase Storage（备份，也用转换后的文件）
        const supabaseUrl = await uploadToSupabase(converted, character, uploadSeed, index);

        // 3. 确定最终使用的 URL（COS 优先，降级到 Supabase）
        if (url) {
          uploadedUrls.push(url);
        } else if (supabaseUrl) {
          // COS 失败时降级到 Supabase
          uploadedUrls.push(supabaseUrl);
          toast.warning("部分图片未能上传到 COS，已使用 Supabase 存储。");
        } else {
          throw new Error(`图片 ${converted.name} 上传失败：COS 和 Supabase 均不可用。`);
        }

        // 更新总体进度
        const perFileWeight = 100 / fileList.length;
        setUploadProgress(Math.round((index + 1) * perFileWeight));
      }

      onUploaded(uploadedUrls);
      setUploadProgress(100);
      setUploadStatus("success");
      setUploadSeed(crypto.randomUUID());
      toast.success("预览图已上传到腾讯云 COS，图片地址已自动追加到文本框。");
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
          <p className="text-sm font-black uppercase tracking-[0.14em] text-black">预览图上传到 腾讯云 COS</p>
          <p className="mt-1 text-xs font-bold leading-6 text-black/70">
            支持多图上传，单张最大 {formatCosFileSize(COS_MAX_IMAGE_BYTES)}，自动同步到腾讯云 COS + Supabase 备份。
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

              const oversizeFile = fileList.find((file) => file.size > COS_MAX_IMAGE_BYTES);
              if (oversizeFile) {
                const message = `图片 ${oversizeFile.name} 超过 ${formatCosFileSize(COS_MAX_IMAGE_BYTES)} 限制。`;
                setUploadStatus("error");
                setUploadError(message);
                toast.error("预览图上传失败", { description: message });
                return;
              }

              const invalidFile = fileList.find(
                (file) => file.type && !(COS_IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type),
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
