import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildRows, scanDateDir, stripNumberSuffix } from "./scan.mjs";

const entry = (name, kind, extra = {}) => {
  const isDir = kind === "dir";
  const ext = isDir ? "" : (name.match(/\.[^.]+$/) ?? [""])[0].toLowerCase();
  return {
    name,
    base: isDir ? name : name.slice(0, name.length - ext.length),
    kind,
    ext,
    isDir,
    size: 0,
    path: name,
    ...extra,
  };
};

describe("buildRows", () => {
  it("目录和同名 exe 同时存在时，预览图只挂给可发布的那份", () => {
    const rows = buildRows([
      entry("套装", "dir"),
      entry("套装.exe", "mod"),
      entry("套装_1.jpg", "image"),
      entry("套装_2.jpg", "image"),
    ]);
    const dir = rows.find((r) => r.isDir);
    const exe = rows.find((r) => r.kind === "mod");
    // 两份都改同一张图会让第二条改名找不到源文件（命名工坊“命名失败”的另一种来源）
    expect(exe.images).toEqual(["套装_1.jpg", "套装_2.jpg"]);
    expect(dir.images).toEqual([]);
  });

  it("只有目录时预览图仍挂在目录上", () => {
    const rows = buildRows([entry("套装", "dir"), entry("套装_1.jpg", "image")]);
    expect(rows[0].images).toEqual(["套装_1.jpg"]);
  });

  it("封面（无编号）排在 -1 前面，重新应用不会把编号整体错位", () => {
    const rows = buildRows([
      entry("X.exe", "mod"),
      entry("X-1.jpg", "image"),
      entry("X.jpg", "image"),
    ]);
    expect(rows[0].images).toEqual(["X.jpg", "X-1.jpg"]);
  });

  it("只有图、没有主条目时，封面当主条目而不是 -1", () => {
    const rows = buildRows([entry("X-1.jpg", "image"), entry("X.jpg", "image")]);
    expect(rows[0].name).toBe("X.jpg");
    expect(rows[0].images).toEqual(["X-1.jpg"]);
  });
});

describe("stripNumberSuffix", () => {
  it("剥掉爬虫的 _1 / -2 编号", () => {
    expect(stripNumberSuffix("套装_1")).toBe("套装");
    expect(stripNumberSuffix("套装-12")).toBe("套装");
  });
});

describe("scanDateDir", () => {
  it("来源目录下的「更新」子目录不算待命名的 Mod", () => {
    const root = mkdtempSync(join(tmpdir(), "scan-"));
    try {
      const gb = join(root, "GameBanana");
      mkdirSync(gb, { recursive: true });
      writeFileSync(join(gb, "NewMod.zip"), "x");
      const upd = join(gb, "更新", "OldMod");
      mkdirSync(upd, { recursive: true });
      writeFileSync(join(upd, "OldMod.zip"), "x");

      const { sources } = scanDateDir(root);
      const gbSource = sources.find((s) => s.name === "GameBanana");
      expect(gbSource.items.map((r) => r.name)).toEqual(["NewMod.zip"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
