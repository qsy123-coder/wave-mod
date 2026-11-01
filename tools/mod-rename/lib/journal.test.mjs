import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyPlan, listJournals, undoJournal } from "./journal.mjs";

let root;
let dir;
let journalDir;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rename-test-"));
  dir = join(root, "W-2026.11.01");
  journalDir = join(root, ".journal");
  mkdirSync(dir);
  writeFileSync(join(dir, "금희.zip"), "a");
  writeFileSync(join(dir, "어흐.png"), "b");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const snapshot = () =>
  readdirSync(dir)
    .sort()
    .map((f) => `${f}:${readFileSync(join(dir, f), "utf8")}`);

describe("applyPlan / undoJournal", () => {
  it("改名后内容不变，撤销后完全恢复", () => {
    const before = snapshot();
    const { id, ops } = applyPlan({
      dir,
      journalDir,
      entries: [
        { from: "금희.zip", to: "今汐-粉丝福利UHD.zip" },
        { from: "어흐.png", to: "心月狐-狐之星座.png" },
      ],
    });
    expect(ops).toHaveLength(2);
    expect(readdirSync(dir).sort()).toEqual(["今汐-粉丝福利UHD.zip", "心月狐-狐之星座.png"].sort());
    expect(readFileSync(join(dir, "今汐-粉丝福利UHD.zip"), "utf8")).toBe("a");

    undoJournal({ journalDir, id });
    expect(snapshot()).toEqual(before);
  });

  it("目标已存在时一条都不动", () => {
    writeFileSync(join(dir, "今汐.zip"), "x");
    expect(() =>
      applyPlan({ dir, journalDir, entries: [{ from: "금희.zip", to: "今汐.zip" }] })
    ).toThrow(/拒绝覆盖/);
    expect(readdirSync(dir).sort()).toEqual(["今汐.zip", "어흐.png", "금희.zip"].sort());
  });

  it("名字含非法字符时整批拒绝", () => {
    expect(() =>
      applyPlan({ dir, journalDir, entries: [{ from: "금희.zip", to: "a/b.zip" }] })
    ).toThrow(/非法字符/);
    expect(readdirSync(dir)).toContain("금희.zip");
  });

  it("源不存在时整批拒绝", () => {
    expect(() =>
      applyPlan({ dir, journalDir, entries: [{ from: "没有这个.zip", to: "x.zip" }] })
    ).toThrow(/源条目不存在/);
  });

  it("撤销过的记录不能再次撤销", () => {
    const { id } = applyPlan({ dir, journalDir, entries: [{ from: "금희.zip", to: "今汐.zip" }] });
    undoJournal({ journalDir, id });
    expect(() => undoJournal({ journalDir, id })).toThrow(/不能撤销/);
  });

  it("listJournals 只列出最近记录，带状态与条数", () => {
    applyPlan({ dir, journalDir, entries: [{ from: "금희.zip", to: "今汐.zip" }] });
    const list = listJournals(journalDir);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: "applied", count: 1 });
  });
});
