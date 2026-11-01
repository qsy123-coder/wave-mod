import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inspectZip, planSplit, splitZip } from "./split.mjs";
import { listZipEntries } from "./zip.mjs";
import { makeZip } from "./zip.test.mjs";

let root;
let zipPath;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "split-test-"));
  zipPath = join(root, "合集.zip");
  makeZip(zipPath, [
    { name: "今汐 白/Meshes/a.buf", data: "1111" },
    { name: "今汐 白/Textures/a.dds", data: "22222" },
    { name: "吟霖 办公室/b.buf", data: "333" },
    { name: "吟霖 办公室/preview.jpeg", data: "p" },
    { name: "椿 定制/c.dds", data: "444444" },
  ]);
  writeFileSync(join(root, "合集.png"), "fake-image");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("inspectZip", () => {
  it("按顶层目录统计文件数与字节", () => {
    const info = inspectZip(zipPath);
    expect(info.topLevel.map((t) => `${t.name}|${t.files}|${t.bytes}`).sort()).toEqual(
      ["今汐 白|2|9", "吟霖 办公室|2|4", "椿 定制|1|6"].sort()
    );
    expect(info.totals).toEqual({ files: 5, bytes: 19 });
  });
});

describe("planSplit", () => {
  it("分配齐全就没有错误，也没剩料", () => {
    const plan = planSplit(zipPath, [
      { packName: "今汐-粉丝福利", tops: ["今汐 白"] },
      { packName: "吟霖-办公室", tops: ["吟霖 办公室"] },
      { packName: "椿-定制", tops: ["椿 定制"] },
    ]);
    expect(plan.errors).toEqual([]);
    expect(plan.leftovers).toEqual([]);
    expect(plan.assignedBytes).toBe(plan.sourceBytes);
  });

  it("漏分配 / 重复分配 / 非法包名都会报错", () => {
    const plan = planSplit(zipPath, [
      { packName: "今汐-粉丝福利", tops: ["今汐 白"] },
      { packName: "今汐-粉丝福利", tops: ["吟霖 办公室", "今汐 白"] },
      { packName: "a/b", tops: ["椿 定制"] },
    ]);
    expect(plan.errors.join("\n")).toMatch(/包名重复/);
    expect(plan.errors.join("\n")).toMatch(/分到了两个包/);
    expect(plan.errors.join("\n")).toMatch(/包名不合法/);
  });
});

describe("splitZip", () => {
  it("拆成多个包、对账通过、源包与长图归档", () => {
    const res = splitZip({
      zipPath,
      sourceDir: root,
      groups: [
        { packName: "今汐-粉丝福利", tops: ["今汐 白"] },
        { packName: "吟霖-办公室", tops: ["吟霖 办公室"] },
        { packName: "椿-定制", tops: ["椿 定制"] },
      ],
      covers: { "今汐-粉丝福利": Buffer.from("png-bytes") },
    });

    expect(res.packs.map((p) => [p.packName, p.files, p.bytes])).toEqual([
      ["今汐-粉丝福利", 2, 9],
      ["吟霖-办公室", 2, 4],
      ["椿-定制", 1, 6],
    ]);
    expect(readdirSync(root).sort()).toEqual([
      "今汐-粉丝福利.zip",
      "今汐-粉丝福利.png",
      "吟霖-办公室.zip",
      "椿-定制.zip",
      "_合集原包",
    ].sort());

    // 包内顶层目录 = 包名；包内自带的 preview 改名成 screenshot
    const names = listZipEntries(join(root, "吟霖-办公室.zip")).entries.map((e) => e.name);
    expect(names).toEqual(["吟霖-办公室/b.buf", "吟霖-办公室/screenshot.jpeg"]);

    // 源包不删，只是归档
    expect(existsSync(join(root, "_合集原包", "合集.zip"))).toBe(true);
    expect(existsSync(join(root, "_合集原包", "合集.png"))).toBe(true);
    expect(res.archived.sort()).toEqual(["合集.zip", "合集.png"].sort());
  });

  it("目标已存在时整批回滚，不留下半成品", () => {
    writeFileSync(join(root, "吟霖-办公室.zip"), "occupied");
    expect(() =>
      splitZip({
        zipPath,
        sourceDir: root,
        groups: [
          { packName: "今汐-粉丝福利", tops: ["今汐 白"] },
          { packName: "吟霖-办公室", tops: ["吟霖 办公室"] },
          { packName: "椿-定制", tops: ["椿 定制"] },
        ],
      })
    ).toThrow(/拒绝覆盖/);

    // 先写出来的那个包被回滚掉，只剩占位的同名文件
    expect(existsSync(join(root, "今汐-粉丝福利.zip"))).toBe(false);
    expect(existsSync(join(root, "合集.zip"))).toBe(true); // 源包没动
  });

  it("显式 ignore 的顶层目录算交代过了（并回报丢弃量）", () => {
    const res = splitZip({
      zipPath,
      sourceDir: root,
      groups: [
        { packName: "今汐-粉丝福利", tops: ["今汐 白"] },
        { packName: "吟霖-办公室", tops: ["吟霖 办公室"] },
      ],
      ignore: ["椿 定制"],
      archive: false,
    });
    expect(res.ignored).toEqual([{ name: "椿 定制", files: 1, bytes: 6 }]);
    expect(existsSync(join(root, "椿-定制.zip"))).toBe(false);
  });

  it("有没分配的顶层目录时拒绝执行", () => {
    expect(() =>
      splitZip({
        zipPath,
        sourceDir: root,
        groups: [{ packName: "今汐-粉丝福利", tops: ["今汐 白"] }],
      })
    ).toThrow(/没分配的顶层目录/);
  });
});
