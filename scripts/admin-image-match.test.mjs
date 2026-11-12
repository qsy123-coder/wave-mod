/**
 * 后台批量上传页的预览图匹配单测。
 *
 * 用例取自 2026-11-12 的 W-2026.11.12（女漂-星界调制器）：
 * 17 张图 = 6 张变体主图 + 11 张帖子级附加图（`… by Alunoop-N`），
 * 当时后台页把后 11 张全丢了，只匹配到 6 张。
 */
import { describe, expect, it } from "vitest";

import { buildImageIndex, lookupImages, lookupSharedImages } from "./admin-image-match.mjs";
import { looseImageKey } from "./image-name-match.mjs";

const file = (name) => ({ name, type: "image/jpeg" });

const NVPIAO_VARIANTS = [1, 2, 3, 4, 5, 6].map((n) => `女漂-星界调制器 ${n} by Alunoop`);
const NVPIAO_SHARED = [
  "女漂-星界调制器 by Alunoop.jpg",
  ...Array.from({ length: 10 }, (_, i) => `女漂-星界调制器 by Alunoop-${i + 1}.jpg`),
];

function variantKeysOf(keys) {
  return new Set(keys.map((key) => looseImageKey(key)).filter(Boolean));
}

function makeIndex() {
  return buildImageIndex([
    ...NVPIAO_VARIANTS.map((name) => file(`${name}.jpg`)),
    ...NVPIAO_SHARED.map((name) => file(name)),
  ]);
}

describe("buildImageIndex + lookupImages", () => {
  it("变体主图精确命中自己那一张", () => {
    const index = makeIndex();
    for (const name of NVPIAO_VARIANTS) {
      expect(lookupImages(index, name, name, name).map((f) => f.name)).toEqual([`${name}.jpg`]);
    }
  });

  it("分享名带 .exe、图片没有时也能命中", () => {
    const index = makeIndex();
    const hit = lookupImages(index, "女漂-星界调制器 2 by Alunoop.exe", "女漂-星界调制器 2", "星界调制器 2 by Alunoop");
    expect(hit.map((f) => f.name)).toEqual(["女漂-星界调制器 2 by Alunoop.jpg"]);
  });

  it("忽略非图片文件", () => {
    const index = buildImageIndex([
      { name: "女漂-星界调制器 1 by Alunoop.exe", type: "application/octet-stream" },
      { name: "readme.txt", type: "text/plain" },
    ]);
    expect(lookupImages(index, "女漂-星界调制器 1 by Alunoop", "女漂-星界调制器 1", "星界调制器 1")).toEqual([]);
  });
});

describe("lookupSharedImages", () => {
  const variantKeys = variantKeysOf(NVPIAO_VARIANTS);

  it("补上 11 张帖子级附加图，且不混进别的变体主图", () => {
    const index = makeIndex();
    const row = NVPIAO_VARIANTS[0];
    const own = lookupImages(index, row, row, row);
    const shared = lookupSharedImages(index, row, row, own, variantKeys);

    expect(shared.map((f) => f.name).sort()).toEqual([...NVPIAO_SHARED].sort());
    // 不含任何变体主图
    for (const name of NVPIAO_VARIANTS) {
      expect(shared.map((f) => f.name)).not.toContain(`${name}.jpg`);
    }
  });

  it("自己的图不会重复出现在 shared 里", () => {
    const index = makeIndex();
    const row = NVPIAO_VARIANTS[2];
    const own = lookupImages(index, row, row, row);
    const shared = lookupSharedImages(index, row, row, own, variantKeys);
    expect(shared.map((f) => f.name)).not.toContain(`${row}.jpg`);
  });

  it("没有作者的名字不做帖子级合并", () => {
    const index = buildImageIndex([file("夏空-校服-粉/preview.png")]);
    expect(lookupSharedImages(index, "夏空-校服-粉", "校服-粉", [], new Set())).toEqual([]);
  });

  it("别的作者的图不会被并进来", () => {
    const index = buildImageIndex([
      file("男漂-星界调制器 by Alunoop.jpg"),
      file("男漂-星界调制器 by SomeoneElse.jpg"),
      file("男漂-星界调制器 by SomeoneElse-1.jpg"),
    ]);
    const shared = lookupSharedImages(
      index,
      "男漂-星界调制器 by Alunoop",
      "男漂-星界调制器 by Alunoop",
      [],
      new Set(),
    );
    expect(shared.map((f) => f.name)).toEqual(["男漂-星界调制器 by Alunoop.jpg"]);
  });
});
