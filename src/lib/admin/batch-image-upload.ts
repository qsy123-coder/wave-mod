"use client";

import { convertToWebP, getCosSign, uploadToCos } from "@/lib/cos/client-upload";

/**
 * 批量/单条上传共用的图片处理：
 * - 转 WebP（最长边 1000px）
 * - 向 /api/cos/sign 取 STS
 * - 浏览器直传 COS
 * - GIF 不转码，保留 .gif
 */
export async function uploadRowImage({
  character,
  file,
  index,
  draftId,
}: {
  character: string;
  file: File;
  index: number;
  draftId: string;
}): Promise<string> {
  const converted = await convertToWebP(file, 0.85, 1000);
  const ext = converted.type === "image/gif" ? "gif" : "webp";
  const contentType = ext === "gif" ? "image/gif" : "image/webp";
  const filename = index === 0 ? `preview.${ext}` : `preview-${index + 1}.${ext}`;
  const namedFile = new File([converted], filename, { type: contentType });

  const sign = await getCosSign({
    character,
    contentType,
    fileSize: namedFile.size,
    filename,
    modId: draftId,
  });

  return uploadToCos(namedFile, sign);
}

export async function withConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });

  await Promise.all(runners);
}
