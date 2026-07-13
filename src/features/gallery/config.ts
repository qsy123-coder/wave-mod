import { z } from "zod";
import type { GalleryImage, GalleryImageResolved } from "./types";

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

    return validated.map((img) => ({
      ...img,
      src: `/gallery/${img.filename}`,
      aspectRatio: img.width / img.height,
    }));
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
