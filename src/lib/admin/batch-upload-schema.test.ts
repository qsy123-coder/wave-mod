import { describe, expect, it } from "vitest";

import { MAX_VARIANT_LABEL_LENGTH, batchUploadSchema } from "./batch-upload-schema";

const baseRow = {
  title: "女漂-星界调制器 1 by Alunoop",
  character: "女漂",
  version: "未标注",
  gameVersion: "未标注",
  description: "女漂 星界调制器 MOD",
  nsfw: false,
  driveLinks: [
    { platform: "夸克网盘", url: "https://pan.quark.cn/s/abc", variant: "Base SFW" },
  ],
  images: ["https://wave-mod-preview.example.com/mods/x/1/preview.webp"],
  editedFields: [],
};

describe("batchUploadSchema", () => {
  it("普通行不带 variantImages 时默认空对象", () => {
    const parsed = batchUploadSchema.parse({ date: "2026-11-12", rows: [baseRow] });
    expect(parsed.rows[0].variantImages).toEqual({});
  });

  it("合并行保留变体画廊", () => {
    const parsed = batchUploadSchema.parse({
      date: "2026-11-12",
      rows: [
        {
          ...baseRow,
          variantImages: {
            "Base SFW": ["https://wave-mod-preview.example.com/mods/x/1/preview.webp"],
            "Thicc NSFW": ["https://wave-mod-preview.example.com/mods/x/2/preview.webp"],
          },
        },
      ],
    });
    expect(Object.keys(parsed.rows[0].variantImages)).toEqual(["Base SFW", "Thicc NSFW"]);
  });

  it("variantImages 里的非 URL 会被拒绝", () => {
    const result = batchUploadSchema.safeParse({
      date: "2026-11-12",
      rows: [{ ...baseRow, variantImages: { "Base SFW": ["not-a-url"] } }],
    });
    expect(result.success).toBe(false);
  });

  // 回归：2026-11-26 线上整批提交失败，报 "too big <=40 characters"。
  // 文件名剥不掉帖子标题时，标签就是整段文件名，42 字符很正常。
  it("长变体标签（42 字符）能通过", () => {
    const label = "Hsin - Swan Glimpse - Num066-ultimate-v111";
    expect(label.length).toBe(42);

    const parsed = batchUploadSchema.parse({
      date: "2026-11-26",
      rows: [
        {
          ...baseRow,
          driveLinks: [
            { platform: "夸克网盘", url: "https://pan.quark.cn/s/abc", variant: label },
          ],
          variantImages: {
            [label]: ["https://wave-mod-preview.example.com/mods/x/1/preview.webp"],
          },
        },
      ],
    });

    expect(parsed.rows[0].driveLinks[0].variant).toBe(label);
    expect(Object.keys(parsed.rows[0].variantImages)).toEqual([label]);
  });

  it("超过上限的变体标签仍然被拒绝", () => {
    const tooLong = "x".repeat(MAX_VARIANT_LABEL_LENGTH + 1);
    const result = batchUploadSchema.safeParse({
      date: "2026-11-26",
      rows: [
        {
          ...baseRow,
          driveLinks: [
            { platform: "夸克网盘", url: "https://pan.quark.cn/s/abc", variant: tooLong },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
