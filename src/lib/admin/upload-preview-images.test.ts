import { describe, expect, it } from "vitest";

import type { BatchPreviewImage } from "./batch-upload-types";
import {
  createUploadPreviewImages,
  hasCensoredPreview,
  moveUploadPreviewImage,
  removeUploadPreviewImage,
  replaceUploadPreviewImage,
  restoreUploadPreviewImages,
} from "./upload-preview-images";

/** 这些操作只关心 File 的引用身份，不需要真实的 File */
function file(name: string): File {
  return { name } as unknown as File;
}

function names(images: BatchPreviewImage[]): string[] {
  return images.map((item) => item.file.name);
}

describe("createUploadPreviewImages", () => {
  it("按给定顺序生成，每项有唯一 id，初始未打码", () => {
    const images = createUploadPreviewImages([file("a.png"), file("b.png"), file("c.png")]);

    expect(names(images)).toEqual(["a.png", "b.png", "c.png"]);
    expect(new Set(images.map((item) => item.id)).size).toBe(3);
    expect(images.every((item) => item.censored === false)).toBe(true);
    expect(images.every((item) => item.original === item.file)).toBe(true);
  });

  it("空数组原样返回", () => {
    expect(createUploadPreviewImages([])).toEqual([]);
  });
});

describe("removeUploadPreviewImage", () => {
  const images = createUploadPreviewImages([file("a.png"), file("b.png"), file("c.png")]);

  it("删除中间一张后顺序保持", () => {
    expect(names(removeUploadPreviewImage(images, 1))).toEqual(["a.png", "c.png"]);
  });

  it("删除主图后第二张顶上", () => {
    expect(names(removeUploadPreviewImage(images, 0))).toEqual(["b.png", "c.png"]);
  });

  it("删除不存在的下标不改变数组", () => {
    expect(removeUploadPreviewImage(images, -1)).toBe(images);
    expect(removeUploadPreviewImage(images, 99)).toBe(images);
  });
});

describe("moveUploadPreviewImage", () => {
  const images = createUploadPreviewImages([
    file("a.png"),
    file("b.png"),
    file("c.png"),
    file("d.png"),
  ]);

  it("往后拖", () => {
    expect(names(moveUploadPreviewImage(images, 0, 2))).toEqual([
      "b.png",
      "c.png",
      "a.png",
      "d.png",
    ]);
  });

  it("往前拖（换主图）", () => {
    expect(names(moveUploadPreviewImage(images, 3, 0))).toEqual([
      "d.png",
      "a.png",
      "b.png",
      "c.png",
    ]);
  });

  it("原地或越界不改变数组", () => {
    expect(moveUploadPreviewImage(images, 1, 1)).toBe(images);
    expect(moveUploadPreviewImage(images, -1, 0)).toBe(images);
    expect(moveUploadPreviewImage(images, 0, 4)).toBe(images);
  });
});

describe("replaceUploadPreviewImage / restoreUploadPreviewImages", () => {
  it("打码替换当前文件但保留原图", () => {
    const images = createUploadPreviewImages([file("a.png"), file("b.png")]);
    const censored = replaceUploadPreviewImage(images, 1, file("b-censored.png"));

    expect(names(censored)).toEqual(["a.png", "b-censored.png"]);
    expect(censored[1].original.name).toBe("b.png");
    expect(censored[1].censored).toBe(true);
    expect(hasCensoredPreview(censored)).toBe(true);
  });

  it("还原后回到原图，顺序不变", () => {
    const images = createUploadPreviewImages([file("a.png"), file("b.png"), file("c.png")]);
    const censored = replaceUploadPreviewImage(
      replaceUploadPreviewImage(images, 0, file("a-x.png")),
      2,
      file("c-x.png"),
    );
    const restored = restoreUploadPreviewImages(censored);

    expect(names(restored)).toEqual(["a.png", "b.png", "c.png"]);
    expect(hasCensoredPreview(restored)).toBe(false);
  });

  it("已删除的图不会因为还原而回来", () => {
    const images = replaceUploadPreviewImage(
      createUploadPreviewImages([file("a.png"), file("b.png")]),
      0,
      file("a-x.png"),
    );
    const afterDelete = removeUploadPreviewImage(images, 1);

    expect(names(restoreUploadPreviewImages(afterDelete))).toEqual(["a.png"]);
  });

  it("越界替换不改变数组", () => {
    const images = createUploadPreviewImages([file("a.png")]);
    expect(replaceUploadPreviewImage(images, 3, file("x.png"))).toBe(images);
  });
});
