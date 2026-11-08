import { describe, expect, it } from "vitest";

import { buildGachaAssetUrl } from "./asset-urls";

describe("buildGachaAssetUrl", () => {
  it("按 resourceId 拼图标地址", () => {
    expect(buildGachaAssetUrl("https://cdn.example.com", "icons", 1104)).toBe(
      "https://cdn.example.com/gacha-res/icons/1104.webp",
    );
  });

  it("裁掉 base 末尾的斜杠", () => {
    expect(buildGachaAssetUrl("https://cdn.example.com///", "portraits", 1501)).toBe(
      "https://cdn.example.com/gacha-res/portraits/1501.webp",
    );
  });

  it("非法 resourceId 返回 null，让调用方走兜底", () => {
    expect(buildGachaAssetUrl("https://cdn.example.com", "icons", 0)).toBeNull();
    expect(buildGachaAssetUrl("https://cdn.example.com", "icons", -1)).toBeNull();
    expect(buildGachaAssetUrl("https://cdn.example.com", "icons", 1.5)).toBeNull();
  });
});
