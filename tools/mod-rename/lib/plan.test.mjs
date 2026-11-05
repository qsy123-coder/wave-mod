import { describe, expect, it } from "vitest";

import glossary from "../data/glossary.json";
import { planAll, planItem } from "./plan.mjs";

const known = new Set(["今汐", "吟霖", "椿", "珂莱塔", "散华", "折枝", "锁暝", "心月狐"]);
const item = (name, extra = {}) => ({
  name,
  base: name.replace(/\.[^.]+$/, ""),
  ext: (name.match(/\.[^.]+$/) ?? [""])[0],
  kind: "mod",
  isDir: false,
  images: [],
  source: "arca.live",
  meta: null,
  ...extra,
});
const sug = (characters, name, extra = {}) => ({
  characters,
  name,
  hotkeys: "",
  author: "",
  confidence: "high",
  ...extra,
});

describe("planItem", () => {
  it("单角色、库内有、无冲突 → 可应用，去重键把角色前缀剥掉", () => {
    const row = planItem({
      item: item("아무거나.zip"),
      suggestion: sug(["今汐"], "粉丝福利UHD（丝袜黑）", { author: "문지기" }),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.to).toBe("今汐-粉丝福利UHD（丝袜黑） by 문지기");
    expect(row.character).toBe("今汐");
    expect(row.dedup).toBe("今汐|粉丝福利UHD（丝袜黑） by 문지기");
  });

  it("别名角色「心（含大招）」→ 归一成 心月狐，不再拦成未知角色", () => {
    const row = planItem({
      item: item("x.exe"),
      suggestion: sug(["心（含大招）"], "含大招-夜月守望者（9）", { author: "辉映星辰允如光" }),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.characters).toEqual(["心月狐"]);
    expect(row.to).toBe("心月狐-含大招-夜月守望者（9） by 辉映星辰允如光");
    expect(row.character).toBe("心月狐");
    // 归一不静默：要让用户看见「心（含大招）」被归到了哪一类
    expect(row.issues.map((i) => i.code)).toContain("character-alias");
    expect(row.issues.some((i) => i.level === "block")).toBe(false);
  });

  it("半角/全角括号的别名都认（心(含大招) → 心月狐）", () => {
    const row = planItem({
      item: item("x"),
      suggestion: sug(["心(含大招)"], "深海魔女v1.0"),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.to).toBe("心月狐-深海魔女v1.0");
  });

  it("库里存的是历史别名（陆赫斯）时也能匹配（比较前双向归一）", () => {
    const row = planItem({
      item: item("x"),
      suggestion: sug(["陆赫斯"], "西装"),
      knownCharacters: new Set(["陆赫斯"]),
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.characters).toEqual(["路赫斯"]);
  });

  it("角色不在库内 → 禁止应用（防止凭空多一个分类）", () => {
    const row = planItem({
      item: item("x"),
      suggestion: sug(["卡梅莉亚"], "粉丝福利UHD"),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(false);
    expect(row.issues.map((i) => i.code)).toContain("unknown-character");
  });

  it("多角色合集（P0 未实现拆分）→ 禁止应用", () => {
    const row = planItem({
      item: item("x.zip"),
      suggestion: sug(["今汐", "吟霖", "椿"], "粉丝福利UHD"),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(false);
    expect(row.issues.map((i) => i.code)).toContain("multi-character");
  });

  it("认不出角色 / 名称为空 → 禁止应用", () => {
    const row = planItem({
      item: item("x"),
      suggestion: sug([], ""),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(false);
    expect(row.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["no-character", "empty-name"]));
  });

  it("图片组认不出单一角色（多角色帖子截图）→ 不拦，按纯名称改名", () => {
    const row = planItem({
      item: item("合集_1.png", { kind: "image", images: ["合集_2.png", "合集_3.png"] }),
      suggestion: sug([], "合集预览"),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.issues.map((i) => i.code)).not.toContain("no-character");
    expect(row.targets).toEqual([
      { from: "合集_1.png", to: "合集预览.png" },
      { from: "合集_2.png", to: "合集预览-1.png" },
      { from: "合集_3.png", to: "合集预览-2.png" },
    ]);
  });

  it("目标目录已有同名 → 冲突，不覆盖", () => {
    const row = planItem({
      item: item("x"),
      suggestion: sug(["锁暝"], "特效更改"),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(["锁暝-特效更改"]),
      glossary,
    });
    expect(row.applicable).toBe(false);
    expect(row.issues.map((i) => i.code)).toContain("conflict");
  });

  it("库内已有去重键 → 只警告，不阻止", () => {
    const row = planItem({
      item: item("x"),
      suggestion: sug(["锁暝"], "特效更改"),
      knownCharacters: known,
      existingDedup: new Set(["锁暝|特效更改"]),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.issues.map((i) => i.code)).toContain("duplicate");
    expect(row.issues.find((i) => i.code === "duplicate").level).toBe("warn");
  });

  it("终末地条目 → 阻止，提示挪去 _Endfield", () => {
    const row = planItem({
      item: item("사밍순_1.jpg"),
      suggestion: sug(["管理员"], "校服"),
      knownCharacters: new Set(["管理员"]),
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(false);
    expect(row.issues.map((i) => i.code)).toContain("endfield");
  });

  it("拿不到库时降级：不因为连不上库就卡死改名", () => {
    const row = planItem({
      item: item("x"),
      suggestion: sug(["今汐"], "粉丝福利UHD"),
      knownCharacters: null,
      existingDedup: null,
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.issues.map((i) => i.code)).toContain("no-db");
  });
});

describe("targets（主条目 + 预览图一起改）", () => {
  it("exe 与它的 3 张图一起改名，图片按 -1/-2 编号", () => {
    const row = planItem({
      item: item("금희 오피스.exe", { images: ["금희 오피스_1.jpg", "금희 오피스_2.jpg", "금희 오피스_3.jpg"] }),
      suggestion: sug(["吟霖"], "办公室V2", { author: "문지기" }),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(),
      glossary,
    });
    expect(row.applicable).toBe(true);
    expect(row.targets).toEqual([
      { from: "금희 오피스.exe", to: "吟霖-办公室V2 by 문지기.exe" },
      { from: "금희 오피스_1.jpg", to: "吟霖-办公室V2 by 문지기.jpg" },
      { from: "금희 오피스_2.jpg", to: "吟霖-办公室V2 by 문지기-1.jpg" },
      { from: "금희 오피스_3.jpg", to: "吟霖-办公室V2 by 문지기-2.jpg" },
    ]);
  });

  it("已经是规范名 → 无需改名，也不算错误", () => {
    const row = planItem({
      item: item("今汐-粉丝福利UHD.jpg"),
      suggestion: sug(["今汐"], "粉丝福利UHD"),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(["今汐-粉丝福利UHD.jpg"]),
      glossary,
    });
    expect(row.alreadyNamed).toBe(true);
    expect(row.applicable).toBe(false);
    expect(row.issues.map((i) => i.code)).toContain("already-named");
    expect(row.issues.some((i) => i.level === "block")).toBe(false);
  });

  it("预览图的目标名被占用 → 冲突", () => {
    const row = planItem({
      item: item("x.exe", { images: ["x_1.png"] }),
      suggestion: sug(["今汐"], "甲"),
      knownCharacters: known,
      existingDedup: new Set(),
      existingNames: new Set(["x.exe", "x_1.png", "今汐-甲.png"]),
      glossary,
    });
    expect(row.applicable).toBe(false);
    expect(row.issues.map((i) => i.code)).toContain("conflict");
  });
});

describe("planAll", () => {
  it("统计可应用/不可应用与重复数", () => {
    const res = planAll({
      items: [item("a"), item("b"), item("c")],
      suggestions: {
        a: sug(["今汐"], "甲"),
        b: sug(["吟霖", "椿"], "乙"),
        c: sug(["锁暝"], "丙"),
      },
      knownCharacters: known,
      existingDedup: new Set(["锁暝|丙"]),
      glossary,
    });
    expect(res.stats).toEqual({ total: 3, applicable: 2, blocked: 1, already: 0, duplicates: 1 });
  });
});
