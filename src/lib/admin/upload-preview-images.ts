import type { BatchPreviewImage } from "./batch-upload-types";

/**
 * 上传前的本地预览图操作（删除 / 换序 / 打码 / 还原）。
 *
 * 与 `preview-images.ts` 的区别：那个管的是**已入库**的图片 URL（批量编辑弹窗），
 * 这里管的是浏览器里还没上传的 `File`。顺序同样有意义 —— 第 0 张就是封面。
 *
 * 单独抽出来是为了能单测：这些操作直接决定最终上传顺序，
 * 散在组件里写很容易出现「拖完之后主图没变」这类静默 bug。
 */

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // 极老浏览器兜底；只要求页内唯一，不要求密码学强度
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createUploadPreviewImages(files: File[]): BatchPreviewImage[] {
  return files.map((file) => ({
    id: createId(),
    file,
    original: file,
    censored: false,
  }));
}

export function removeUploadPreviewImage(
  images: BatchPreviewImage[],
  index: number,
): BatchPreviewImage[] {
  if (index < 0 || index >= images.length) return images;

  return images.filter((_, current) => current !== index);
}

/** 把第 from 张移动到第 to 张的位置（后续项顺延，不丢图） */
export function moveUploadPreviewImage(
  images: BatchPreviewImage[],
  from: number,
  to: number,
): BatchPreviewImage[] {
  if (from === to) return images;
  if (from < 0 || to < 0 || from >= images.length || to >= images.length) return images;

  const next = [...images];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);

  return next;
}

/** 用打码后的文件替换第 index 张；原图仍留在 original 里，方便再次重打或还原 */
export function replaceUploadPreviewImage(
  images: BatchPreviewImage[],
  index: number,
  file: File,
): BatchPreviewImage[] {
  if (index < 0 || index >= images.length) return images;

  return images.map((item, current) =>
    current === index ? { ...item, file, censored: true } : item,
  );
}

/** 还原所有打过码的图（已删除的图不会回来） */
export function restoreUploadPreviewImages(images: BatchPreviewImage[]): BatchPreviewImage[] {
  return images.map((item) =>
    item.censored ? { ...item, file: item.original, censored: false } : item,
  );
}

export function hasCensoredPreview(images: BatchPreviewImage[]): boolean {
  return images.some((item) => item.censored);
}
