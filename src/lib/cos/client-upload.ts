"use client";

import COS from "cos-js-sdk-v5";

import { COS_IMAGE_CACHE_CONTROL } from "@/lib/cos/shared";

export type CosSignResult = {
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

export type CosSignInput = {
  character: string;
  contentType: string;
  fileSize: number;
  filename: string;
  modId: string;
};

/** 浏览器 → 服务端换取 COS STS 临时密钥（/api/cos/sign 受 Basic Auth 保护） */
export async function getCosSign(body: CosSignInput): Promise<CosSignResult> {
  const response = await fetch("/api/cos/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `COS 签名请求失败（${response.status}）`);
  }

  return response.json();
}

/**
 * 将图片转为 WebP。`maxWidth` 给了就等比缩小到该宽度（不放大）。
 * GIF / 已是 WebP 的动图跳过，保持原样。
 */
export async function convertToWebP(
  file: File,
  quality = 0.85,
  maxWidth?: number,
): Promise<File> {
  if (file.type === "image/webp" || file.type === "image/gif") {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const scale = maxWidth && img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const originalName = file.name.replace(/\.[^.]+$/, "");
          resolve(
            new File([blob], `${originalName}.webp`, {
              type: "image/webp",
            }),
          );
        },
        "image/webp",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

/** 浏览器直传 COS；返回公开访问 URL */
export function uploadToCos(
  file: File,
  sign: CosSignResult,
  onProgress?: (pct: number) => void,
): Promise<string> {
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
        CacheControl: COS_IMAGE_CACHE_CONTROL,
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
