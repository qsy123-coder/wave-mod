import { describe, expect, it } from "vitest";

import { groupDriveLinksByVariant, normalizeVariantLabel, variantCountLabel } from "./variants";
import type { DriveLink } from "./types";

const links: DriveLink[] = [
  { platform: "夸克网盘", url: "https://pan.quark.cn/s/sfw", variant: "Slim SFW" },
  { platform: "迅雷网盘", url: "https://pan.xunlei.com/s/sfw", variant: "Slim SFW" },
  { platform: "夸克网盘", url: "https://pan.quark.cn/s/nsfw", variant: "Thicc NSFW" },
  { platform: "迅雷网盘", url: "https://pan.xunlei.com/s/nsfw", variant: "Thicc NSFW" },
];

describe("groupDriveLinksByVariant", () => {
  it("keeps one group per variant and does not merge the same platform across variants", () => {
    const summary = groupDriveLinksByVariant(links);

    expect(summary.hasVariants).toBe(true);
    expect(summary.variantCount).toBe(2);
    expect(summary.labels).toEqual(["Slim SFW", "Thicc NSFW"]);
    expect(summary.linkCount).toBe(4);
    expect(summary.groups.map((group) => [group.label, group.links.map((link) => link.platform)])).toEqual([
      ["Slim SFW", ["夸克网盘", "迅雷网盘"]],
      ["Thicc NSFW", ["夸克网盘", "迅雷网盘"]],
    ]);
  });

  it("treats legacy links without variant as one untagged group", () => {
    const summary = groupDriveLinksByVariant([
      { platform: "百度网盘", url: "https://pan.baidu.com/s/1" },
      { platform: "夸克网盘", url: "https://pan.quark.cn/s/1" },
    ]);

    expect(summary.hasVariants).toBe(false);
    expect(summary.variantCount).toBe(0);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].label).toBeNull();
  });

  it("requires at least two labels before showing variant UI", () => {
    const summary = groupDriveLinksByVariant([
      { platform: "夸克网盘", url: "https://pan.quark.cn/s/1", variant: "SFW" },
      { platform: "百度网盘", url: "https://pan.baidu.com/s/1" },
    ]);

    expect(summary.hasVariants).toBe(false);
    // 标签仍然保留，搜索/后台编辑还能看到
    expect(summary.labels).toEqual(["SFW"]);
  });

  it("de-duplicates identical links and ignores empty urls", () => {
    const summary = groupDriveLinksByVariant([
      { platform: "夸克网盘", url: "https://pan.quark.cn/s/1", variant: "SFW" },
      { platform: "夸克网盘", url: "https://pan.quark.cn/s/1", variant: "SFW" },
      { platform: "夸克网盘", url: "  ", variant: "SFW" },
    ]);

    expect(summary.linkCount).toBe(1);
    expect(summary.variantCount).toBe(1);
  });

  it("handles null/undefined drive links", () => {
    expect(groupDriveLinksByVariant(null).groups).toEqual([]);
    expect(groupDriveLinksByVariant(undefined).hasVariants).toBe(false);
  });
});

describe("variant helpers", () => {
  it("normalizes empty labels to null", () => {
    expect(normalizeVariantLabel("  ")).toBeNull();
    expect(normalizeVariantLabel("  SFW ")).toBe("SFW");
  });

  it("formats the card badge label", () => {
    expect(variantCountLabel(4)).toBe("4 个版本");
    expect(variantCountLabel(0)).toBe("0 个版本");
  });
});
