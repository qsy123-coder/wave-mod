import { describe, expect, it } from "vitest";

import glossary from "../data/glossary.json";
import { markBatchConflicts, planAll, planItem } from "./plan.mjs";

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

  it("同一批两行改成同一个目标名：后一条 block，不会拖到 apply 才撞车", () => {
    const res = planAll({
      items: [item("原帖_副本一", { isDir: true }), item("原帖_副本二", { isDir: true })],
      suggestions: {
        原帖_副本一: sug(["锁暝"], "同一套"),
        原帖_副本二: sug(["锁暝"], "同一套"),
      },
      knownCharacters: known,
      existingDedup: new Set(),
      glossary,
    });
    expect(res.rows[0].applicable).toBe(true);
    expect(res.rows[1].applicable).toBe(false);
    expect(res.rows[1].issues.find((i) => i.code === "duplicate-target")?.conflictWith).toBe("原帖_副本一");
    expect(res.stats).toEqual({ total: 2, applicable: 1, blocked: 1, already: 0, duplicates: 0 });
  });
});

describe("同一帖子的分组元数据", () => {
  const postItem = (name, src) =>
    item(name, {
      meta: {
        url: "https://gamebanana.com/mods/626205",
        title: "Augusta Champion of Sunlight",
        author: "Alunoop3D",
        src,
      },
    });

  it("给同帖的每个附件写 postUrl / variantLabel / isBaseVariant", () => {
    const res = planAll({
      items: [
        postItem("Augusta_1.zip", "Augusta Champion of Sunlight Slim SFW.zip"),
        postItem("Augusta_2.zip", "Augusta Champion of Sunlight Thicc NSFW.zip"),
      ],
      suggestions: {
        "Augusta_1.zip": sug(["奥古斯塔"], "Champion of Sunlight", { author: "Alunoop3D" }),
        "Augusta_2.zip": sug(["奥古斯塔"], "Champion of Sunlight", { author: "Alunoop3D" }),
      },
      knownCharacters: new Set(["奥古斯塔"]),
      existingDedup: new Set(),
      glossary,
    });

    expect(res.rows.map((row) => row.postUrl)).toEqual([
      "https://gamebanana.com/mods/626205",
      "https://gamebanana.com/mods/626205",
    ]);
    expect(res.rows.map((row) => row.variantLabel)).toEqual(["Slim SFW", "Thicc NSFW"]);
    expect(res.rows.map((row) => row.isBaseVariant)).toEqual([true, false]);
    // 基行保持无后缀，第二行由 applySamePostSuffixes 加后缀
    expect(res.rows[0].title).toBe("Champion of Sunlight by Alunoop3D");
    expect(res.rows[1].title).toBe("Champion of Sunlight（Thicc NSFW） by Alunoop3D");
  });

  it("解压目录和它的压缩包是同一个附件，不加版本后缀", () => {
    const url = "https://gamebanana.com/mods/736909";
    const meta = { url, title: "Hsin: Kitsune no Tsuki", author: "Ceeji" };
    const res = planAll({
      items: [
        item("Hsin_ Kitsune no Tsuki", { isDir: true, meta }),
        item("Hsin_ Kitsune no Tsuki.zip", { meta: { ...meta, src: "hsin_kitsune_no_tsuki_freemium_20.zip" } }),
      ],
      suggestions: {
        "Hsin_ Kitsune no Tsuki": sug(["心月狐"], "狐之月", { author: "Ceeji" }),
        "Hsin_ Kitsune no Tsuki.zip": sug(["心月狐"], "狐之月", { author: "Ceeji" }),
      },
      knownCharacters: new Set(["心月狐"]),
      existingDedup: new Set(),
      glossary,
    });

    // 两个条目的名字都必须是基础名（不能有 `（Free）` / `-2`），
    // 否则挂在压缩包上的预览图和分享导出名对不上。
    expect(res.rows.map((row) => row.to)).toEqual([
      "心月狐-狐之月 by Ceeji",
      "心月狐-狐之月 by Ceeji",
    ]);
    expect(res.rows.map((row) => row.title)).toEqual(["狐之月 by Ceeji", "狐之月 by Ceeji"]);
    expect(res.rows.every((row) => row.applicable)).toBe(true);
    // 只有一个附件 → 不写 .mod-groups.json 变体
    expect(res.rows.filter((row) => row.variantLabel)).toHaveLength(0);
  });
});

describe("markBatchConflicts", () => {
  const row = (from, source, to) => ({
    from,
    source,
    to,
    targets: [{ from, to }],
    changed: 1,
    applicable: true,
    issues: [],
  });

  it("跨来源同名：提示补作者/改名称，而不是让用户删文件", () => {
    const rows = [row("청순한 여우", "arca.live", "心月狐-狐狸座"), row("청순한 여우", "GameBanana", "心月狐-狐狸座")];
    markBatchConflicts(rows);
    expect(rows[0].applicable).toBe(true);
    expect(rows[1].applicable).toBe(false);
    const issue = rows[1].issues.find((i) => i.code === "duplicate-target");
    expect(issue.conflictWith).toBe("arca.live / 청순한 여우");
    expect(issue.message).toContain("不同来源");
  });
});
