import { describe, expect, it } from "vitest";

import { splitImageUrls } from "./mod-form";
import {
  joinPreviewImageUrls,
  movePreviewImage,
  removePreviewImageAt,
  toPreviewImages,
} from "./preview-images";

const A = "https://cos.test/a.webp";
const B = "https://cos.test/b.webp";
const C = "https://cos.test/c.webp";

describe("toPreviewImages", () => {
  it("保留输入顺序，并把 URL 作为 id 的一部分", () => {
    const images = toPreviewImages([A, B, C]);

    expect(images.map((image) => image.url)).toEqual([A, B, C]);
    expect(new Set(images.map((image) => image.id)).size).toBe(3);
  });

  it("id 与位置无关：重排后同一张图的 id 不变", () => {
    const before = toPreviewImages([A, B, C]);
    const after = toPreviewImages([C, A, B]);

    // 拖动后数组顺序变了，但每张图的 id 必须还是原来那个，
    // 否则 React 会重挂载节点、拖拽动画闪断
    const idsOf = (images: { id: string; url: string }[], url: string) =>
      images.filter((image) => image.url === url).map((image) => image.id);

    expect(idsOf(after, A)).toEqual(idsOf(before, A));
    expect(idsOf(after, B)).toEqual(idsOf(before, B));
    expect(idsOf(after, C)).toEqual(idsOf(before, C));
  });

  it("重复 URL 也能拿到互不相同的 id", () => {
    const images = toPreviewImages([A, A, B]);

    expect(new Set(images.map((image) => image.id)).size).toBe(3);
  });

  it("空列表返回空数组", () => {
    expect(toPreviewImages([])).toEqual([]);
  });
});

describe("movePreviewImage", () => {
  it("往后拖：把第一张移到第二位", () => {
    const images = toPreviewImages([A, B, C]);
    const moved = movePreviewImage(images, images[0].id, images[1].id);

    expect(moved?.map((image) => image.url)).toEqual([B, A, C]);
  });

  it("往前拖：把最后一张移到最前（即设为封面）", () => {
    const images = toPreviewImages([A, B, C]);
    const moved = movePreviewImage(images, images[2].id, images[0].id);

    expect(moved?.map((image) => image.url)).toEqual([C, A, B]);
  });

  it("拖回原位返回 null，避免误标记表单已修改", () => {
    const images = toPreviewImages([A, B, C]);

    expect(movePreviewImage(images, images[1].id, images[1].id)).toBeNull();
  });

  it("目标 id 不在列表里时返回 null", () => {
    const images = toPreviewImages([A, B]);

    expect(movePreviewImage(images, images[0].id, "not-in-list")).toBeNull();
    expect(movePreviewImage(images, "not-in-list", images[0].id)).toBeNull();
  });

  it("不改动原数组", () => {
    const images = toPreviewImages([A, B, C]);
    movePreviewImage(images, images[0].id, images[2].id);

    expect(images.map((image) => image.url)).toEqual([A, B, C]);
  });

  it("重复 URL 时只移动被拖的那一张", () => {
    const images = toPreviewImages([A, A, B]);
    const moved = movePreviewImage(images, images[1].id, images[2].id);

    expect(moved?.map((image) => image.url)).toEqual([A, B, A]);
  });
});

describe("removePreviewImageAt", () => {
  it("按下标删除", () => {
    const images = toPreviewImages([A, B, C]);

    expect(removePreviewImageAt(images, 1).map((image) => image.url)).toEqual([A, C]);
  });

  it("下标越界时原样返回内容", () => {
    const images = toPreviewImages([A, B]);

    expect(removePreviewImageAt(images, 9).map((image) => image.url)).toEqual([A, B]);
  });

  it("不改动原数组", () => {
    const images = toPreviewImages([A, B]);
    removePreviewImageAt(images, 0);

    expect(images.map((image) => image.url)).toEqual([A, B]);
  });
});

describe("joinPreviewImageUrls", () => {
  it("用换行拼接", () => {
    expect(joinPreviewImageUrls(toPreviewImages([A, B]))).toBe(`${A}\n${B}`);
  });

  it("空列表得到空串", () => {
    expect(joinPreviewImageUrls([])).toBe("");
  });

  it("写回的文本能被 splitImageUrls 原样读回来（顺序一致）", () => {
    const urls = [C, A, B];

    expect(splitImageUrls(joinPreviewImageUrls(toPreviewImages(urls)))).toEqual(urls);
  });
});
