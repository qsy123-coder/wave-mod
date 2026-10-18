import { z } from "zod";
import { buildCosPublicUrl, withCosImageTransform } from "@/lib/cos/shared";
import type { GalleryImage, GalleryImageResolved } from "./types";

const COS_BUCKET = process.env.COS_BUCKET?.trim();
const COS_REGION = process.env.COS_REGION?.trim();

/**
 * 网格缩略图宽度。
 *
 * 图库网格在桌面是 7 列，单格约 200 CSS px，2x 屏需要 400 —— 与列表卡片同口径。
 * 原来的做法是每格直接用原图（单张 2–5MB），一次访问要把 192 张全下完（77MB），
 * 这是 2026-10-18 实测里图库占 75% 出向带宽的直接原因。
 */
const GALLERY_THUMB_WIDTH = 400;

/** 图库对象键：`gallery/<原文件名>`（保留中文/空格，只做 URL 编码） */
function galleryObjectKey(filename: string) {
  return `gallery/${encodeURIComponent(filename)}`;
}

/**
 * 图库图片的公开地址。
 *
 * 配了 COS 就直连 COS（Vercel/自托管都不再经过应用服务器发图）；
 * 没配（纯本地开发）回落到 public/gallery 的静态路径。
 */
function buildGallerySrc(filename: string) {
  if (!COS_BUCKET || !COS_REGION) {
    return `/gallery/${encodeURIComponent(filename)}`;
  }

  return buildCosPublicUrl({
    bucket: COS_BUCKET,
    region: COS_REGION,
    objectKey: galleryObjectKey(filename),
  });
}

/** 单张图片配置的 Zod schema */
const galleryImageSchema = z.object({
  id: z.number().int().positive(),
  filename: z.string().min(1),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/** 图库 JSON 配置的 Zod schema — 图片条目数组 */
const galleryConfigSchema = z.array(galleryImageSchema);

/** JSON 解析错误类型 */
export class GalleryConfigError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GalleryConfigError";
  }
}

/**
 * 服务端加载并校验图库配置。
 * 仅在 Server Component 中调用 — 使用 Node.js fs 读取文件。
 */
export async function loadGalleryImages(): Promise<GalleryImageResolved[]> {
  try {
    // 动态 import fs 避免客户端打包
    const fs = await import("fs/promises");
    const path = await import("path");

    const filePath = path.join(process.cwd(), "data", "gallery-images.json");
    const raw = await fs.readFile(filePath, "utf-8");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new GalleryConfigError(
        "data/gallery-images.json 不是合法的 JSON 文件",
        cause,
      );
    }

    const validated: GalleryImage[] = galleryConfigSchema.parse(parsed);

    return validated.map((img) => {
      const src = buildGallerySrc(img.filename);

      return {
        ...img,
        src,
        thumbSrc: withCosImageTransform(src, GALLERY_THUMB_WIDTH),
        aspectRatio: img.width / img.height,
      };
    });
  } catch (error) {
    if (error instanceof GalleryConfigError) throw error;
    if (error instanceof z.ZodError) {
      throw new GalleryConfigError(
        `data/gallery-images.json 数据格式校验失败:\n${error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n")}`,
        error,
      );
    }
    throw new GalleryConfigError("加载图库配置失败", error);
  }
}
