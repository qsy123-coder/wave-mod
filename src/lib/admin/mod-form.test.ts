import { describe, expect, it } from "vitest";

import {
  adminModFormSchema,
  adminModUpdateFormSchema,
  buildAdminModFieldErrors,
  parseAdminModFormData,
  parseAdminModUpdateFormData,
  splitDriveLinks,
  splitImageUrls,
} from "./mod-form";

const validValues = {
  title: "今汐高清 MOD",
  character: "今汐",
  description: "这是一段足够长的 MOD 描述内容。",
  downloadUrl: "",
  videoUrl: "",
  authorUrl: "",
  imageUrls: "https://example.oss-cn-shanghai.aliyuncs.com/cover.jpg",
  driveLinksText: "",
  nsfw: false,
  xxmiGuide: "使用 XXMI 导入并启用。",
};

describe("admin mod form helpers", () => {
  it("validates create and update payloads", () => {
    expect(adminModFormSchema.safeParse(validValues).success).toBe(true);
    expect(adminModUpdateFormSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", ...validValues }).success).toBe(true);
  });

  it("returns field errors from invalid schema payload", () => {
    const result = adminModFormSchema.safeParse({ ...validValues, title: "a", downloadUrl: "not-url", imageUrls: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(buildAdminModFieldErrors(result.error)).toMatchObject({
        title: "标题至少 2 个字",
        downloadUrl: "请输入有效的直链下载地址",
        imageUrls: "请至少填写一张预览图链接",
      });
    }
  });

  it("parses FormData and checkbox state", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(validValues)) {
      if (key !== "nsfw") {
        formData.set(key, String(value));
      }
    }
    formData.set("nsfw", "on");

    expect(parseAdminModFormData(formData)).toMatchObject({
      title: validValues.title,
      character: validValues.character,
      nsfw: true,
      videoUrl: "",
      authorUrl: "",
    });
  });

  it("parses update FormData id with shared fields", () => {
    const formData = new FormData();
    formData.set("id", "11111111-1111-4111-8111-111111111111");
    for (const [key, value] of Object.entries(validValues)) {
      formData.set(key, String(value));
    }

    expect(parseAdminModUpdateFormData(formData).id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("splits image URLs by new lines and commas", () => {
    expect(splitImageUrls(" https://a.test/1.jpg\nhttps://a.test/2.jpg, https://a.test/3.jpg ")).toEqual([
      "https://a.test/1.jpg",
      "https://a.test/2.jpg",
      "https://a.test/3.jpg",
    ]);
  });

  it("splits drive links by lines with platform and URL", () => {
    expect(splitDriveLinks("百度网盘 https://pan.baidu.com/s/1\n阿里云盘 https://www.alipan.com/abc")).toEqual([
      { platform: "百度网盘", url: "https://pan.baidu.com/s/1" },
      { platform: "阿里云盘", url: "https://www.alipan.com/abc" },
    ]);
    expect(splitDriveLinks("")).toEqual([]);
  });

});
