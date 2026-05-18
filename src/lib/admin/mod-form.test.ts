import { describe, expect, it } from "vitest";

import {
  adminModFormSchema,
  adminModUpdateFormSchema,
  buildAdminModFieldErrors,
  parseAdminModFormData,
  parseAdminModUpdateFormData,
  splitImageUrls,
  splitTags,
} from "./mod-form";

const validValues = {
  title: "今汐高清 MOD",
  character: "今汐",
  description: "这是一段足够长的 MOD 描述内容。",
  downloadUrl: "https://example.oss-cn-shanghai.aliyuncs.com/mod.zip",
  videoUrl: "",
  authorUrl: "",
  imageUrls: "https://example.oss-cn-shanghai.aliyuncs.com/cover.jpg",
  tags: "高清 白色",
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
        downloadUrl: "请输入有效的阿里云 OSS 直链",
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

  it("splits tags by Chinese comma, English comma, and whitespace", () => {
    expect(splitTags("高清，白色, 角色  长发")).toEqual(["高清", "白色", "角色", "长发"]);
    expect(splitTags("")).toEqual([]);
  });
});
