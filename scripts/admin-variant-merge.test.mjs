/**
 * 后台批量上传「同帖多版本合并」单测。
 *
 * 用例取自 2026-11-12 的 W-2026.11.12：女漂-星界调制器 1..6 by Alunoop 被后台页
 * 逐条插成 6 张卡，用户反馈「没合并到一个 mod 里」。
 */
import { describe, expect, it } from "vitest";

import { mergeVariantRows } from "./admin-variant-merge.mjs";

const img = (name) => ({ id: `img:${name}`, file: { name }, original: { name }, censored: false });

function row(key, images = []) {
  const [character] = key.split("-");
  return {
    id: `csv:${key}`,
    sourceKey: key,
    title: key,
    character,
    version: "未标注",
    gameVersion: "未标注",
    description: `${key} MOD`,
    nsfw: false,
    driveLinks: [{ platform: "夸克网盘", url: `https://pan.quark.cn/s/${encodeURIComponent(key)}` }],
    images: [],
    previewImages: images,
    include: true,
    status: "new",
    editedFields: [],
    txtOnly: false,
  };
}

const NVPIAO = [1, 2, 3, 4, 5, 6].map((n) => `女漂-星界调制器 ${n} by Alunoop`);

describe("mergeVariantRows（无清单，按名字推断）", () => {
  it("女漂 6 个变体合成 1 行，链接都带版本标签", () => {
    const rows = NVPIAO.map((key, index) => row(key, [img(`${key}.jpg`)]));
    const merged = mergeVariantRows(rows, null);

    expect(merged).toHaveLength(1);
    const [card] = merged;
    // 基变体是编号最小的 1，标题沿用基行
    expect(card.title).toBe("女漂-星界调制器 1 by Alunoop");
    expect(card.driveLinks).toHaveLength(6);
    expect(card.driveLinks.map((link) => link.variant)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(card.driveLinks.every((link) => link.platform === "夸克网盘")).toBe(true);
    // 每个版本各自一张图，基变体排第一
    expect(Object.keys(card.variantImages)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(card.variantImages["1"]).toHaveLength(1);
    expect(card.previewImages).toEqual(card.variantImages["1"]);
  });

  it("不同作者的编号 mod 不会被并到一起", () => {
    const rows = [
      row("女漂-星界调制器 1 by Alunoop", [img("a.jpg")]),
      row("女漂-星界调制器 2 by Alunoop", [img("b.jpg")]),
      row("女漂-星界调制器 1 by SomeoneElse", [img("c.jpg")]),
    ];
    const merged = mergeVariantRows(rows, null);

    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.driveLinks[0].url.includes("SomeoneElse"))).toBeTruthy();
  });

  it("没有作者的名字不合并（`夏空-校服-粉` 这类可能是不同 mod）", () => {
    const rows = [row("夏空-校服-粉", [img("1.png")]), row("夏空-校服-蓝", [img("2.png")])];
    expect(mergeVariantRows(rows, null)).toHaveLength(2);
  });

  it("单行不合并", () => {
    const rows = [row("女漂-星界调制器 1 by Alunoop", [img("a.jpg")])];
    expect(mergeVariantRows(rows, null)).toHaveLength(1);
  });

  it("无变体编号的单图帖子保持原样", () => {
    const rows = [
      row("心月狐-狐之月 by Ceeji", [img("a.jpg")]),
      row("洛瑟菈-酒与花 by PebbleRox", [img("b.jpg")]),
    ];
    expect(mergeVariantRows(rows, null)).toHaveLength(2);
  });
});

describe("mergeVariantRows（带 .mod-groups.json）", () => {
  const manifest = {
    version: 1,
    groups: {
      "https://gamebanana.com/mods/636546": {
        postUrl: "https://gamebanana.com/mods/636546",
        character: "女漂",
        title: "女漂-星界调制器 1 by Alunoop",
        baseName: "女漂-星界调制器 1 by Alunoop",
        variants: [
          { label: "Base SFW", name: "女漂-星界调制器 1 by Alunoop", localName: "Astral Modulator Rover_1.zip", sourceName: "astral_modulator_rover_base_sfw.zip" },
          { label: "Base NSFW", name: "女漂-星界调制器 2 by Alunoop", localName: "Astral Modulator Rover_2.zip", sourceName: "astral_modulator_rover_base_nsfw.zip" },
          { label: "Thicc NSFW", name: "女漂-星界调制器 4 by Alunoop", localName: "Astral Modulator Rover_4.zip", sourceName: "astral_modulator_rover_thicc_nsfw.zip" },
        ],
      },
    },
  };

  it("用清单里的正式版本名，基变体按清单顺序", () => {
    const rows = [
      row("女漂-星界调制器 4 by Alunoop", [img("4.jpg")]),
      row("女漂-星界调制器 1 by Alunoop", [img("1.jpg")]),
      row("女漂-星界调制器 2 by Alunoop", [img("2.jpg")]),
    ];
    const merged = mergeVariantRows(rows, manifest);

    expect(merged).toHaveLength(1);
    const [card] = merged;
    expect(Object.keys(card.variantImages)).toEqual(["Base SFW", "Base NSFW", "Thicc NSFW"]);
    expect(card.driveLinks.map((link) => link.variant)).toEqual([
      "Base SFW",
      "Base NSFW",
      "Thicc NSFW",
    ]);
    expect(card.title).toBe("女漂-星界调制器 1 by Alunoop");
    expect(card.character).toBe("女漂");
  });

  it("清单里只匹配到 1 个变体时不合并（避免缺版本的卡）", () => {
    const rows = [row("女漂-星界调制器 1 by Alunoop", [img("1.jpg")])];
    expect(mergeVariantRows(rows, manifest)).toHaveLength(1);
  });

  it("清单外的行保持独立", () => {
    const rows = [
      row("女漂-星界调制器 1 by Alunoop", [img("1.jpg")]),
      row("女漂-星界调制器 2 by Alunoop", [img("2.jpg")]),
      row("某角色-无关 mod by 某人", [img("x.jpg")]),
    ];
    const merged = mergeVariantRows(rows, manifest);
    expect(merged).toHaveLength(2);
    expect(merged[1].title).toBe("某角色-无关 mod by 某人");
  });

  it("合并行的简介带版本列表", () => {
    const rows = [
      row("女漂-星界调制器 1 by Alunoop"),
      row("女漂-星界调制器 2 by Alunoop"),
    ];
    const [card] = mergeVariantRows(rows, manifest);
    expect(card.description).toContain("2 个版本");
    expect(card.description).toContain("Base SFW");
  });
});
