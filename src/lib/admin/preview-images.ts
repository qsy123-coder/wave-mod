/**
 * 批量编辑「预览图」网格的纯逻辑。
 *
 * 顺序就是入库顺序：后端把 images[0] 当作封面（见 lib/mods-domain/mappers.ts 的 mapper），
 * 所以拖动排序会直接改变列表页与详情页的封面图。
 */

export type PreviewImage = {
  /** 拖拽用的稳定 key，与当前位置无关 */
  id: string;
  url: string;
};

/**
 * URL 列表 → 可拖拽项。
 *
 * id 刻意不掺入下标：拖动后下标会变，若 id 跟着变，React 会把同一张图当成新节点重挂载，
 * 拖拽动画会闪断。`#n` 只用来区分「同一个 URL 在列表里出现多次」的情况。
 */
export function toPreviewImages(urls: string[]): PreviewImage[] {
  const seen = new Map<string, number>();

  return urls.map((url) => {
    const occurrence = seen.get(url) ?? 0;
    seen.set(url, occurrence + 1);
    return { id: `${url}#${occurrence}`, url };
  });
}

/**
 * 按拖拽结果把 activeId 对应的项移到 overId 的位置。
 *
 * 返回 null 表示没有实际变化（拖回原位、或 id 已不在列表里），
 * 调用方据此跳过写回，避免把表单误标记成「已修改」。
 */
export function movePreviewImage(
  images: PreviewImage[],
  activeId: string,
  overId: string,
): PreviewImage[] | null {
  const from = images.findIndex((image) => image.id === activeId);
  const to = images.findIndex((image) => image.id === overId);
  if (from === -1 || to === -1 || from === to) return null;

  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 删除第 index 张；下标越界时原样返回（新数组，不共享引用） */
export function removePreviewImageAt(images: PreviewImage[], index: number): PreviewImage[] {
  return images.filter((_, i) => i !== index);
}

/**
 * 写回 textarea 的文本，每行一个 URL。
 *
 * 用换行而不是逗号：splitImageUrls 两种都认，但换行不会和 URL 里可能出现的其他分隔符打架。
 * （注意 splitImageUrls 本身也按逗号切分，所以含逗号的 URL 在录入侧本来就存不下来。）
 */
export function joinPreviewImageUrls(images: PreviewImage[]): string {
  return images.map((image) => image.url).join("\n");
}
