import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("同批两条改成同一个名字：整批拒绝，一条都不动", () => {
    expect(() =>
      applyPlan({
        dir,
        journalDir,
        entries: [
          { from: "금희.zip", to: "同名.zip" },
          { from: "어흐.png", to: "同名.zip" },
        ],
      })
    ).toThrow(/同一个名字/);
    expect(readdirSync(dir).sort()).toEqual(["금희.zip", "어흐.png"].sort());
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

describe("分组清单随改名一起落盘", () => {
  const manifestPath = () => join(dir, ".mod-groups.json");

  it("写入清单，撤销时恢复改前内容", () => {
    const before = '{"version":1,"groups":{}}\n';
    writeFileSync(manifestPath(), before);

    const { id } = applyPlan({
      dir,
      journalDir,
      entries: [{ from: "금희.zip", to: "今汐.zip" }],
      manifest: { path: manifestPath(), content: '{"version":1,"groups":{"a":{}}}\n' },
    });
    expect(readFileSync(manifestPath(), "utf8")).toBe('{"version":1,"groups":{"a":{}}}\n');

    undoJournal({ journalDir, id });
    expect(readFileSync(manifestPath(), "utf8")).toBe(before);
  });

  it("本批之前没有清单时，撤销会把它删掉", () => {
    const { id } = applyPlan({
      dir,
      journalDir,
      entries: [{ from: "금희.zip", to: "今汐.zip" }],
      manifest: { path: manifestPath(), content: '{"version":1,"groups":{"a":{}}}\n' },
    });
    expect(existsSync(manifestPath())).toBe(true);

    undoJournal({ journalDir, id });
    expect(existsSync(manifestPath())).toBe(false);
  });

  it("清单后来被改过时，撤销不覆盖它", () => {
    writeFileSync(manifestPath(), '{"version":1,"groups":{}}\n');
    const { id } = applyPlan({
      dir,
      journalDir,
      entries: [{ from: "금희.zip", to: "今汐.zip" }],
      manifest: { path: manifestPath(), content: '{"version":1,"groups":{"a":{}}}\n' },
    });
    writeFileSync(manifestPath(), '{"version":1,"groups":{"newer":{}}}\n');

    undoJournal({ journalDir, id });
    expect(readFileSync(manifestPath(), "utf8")).toBe('{"version":1,"groups":{"newer":{}}}\n');
  });

  it("清单写失败时连同改名一起回滚", () => {
    expect(() =>
      applyPlan({
        dir,
        journalDir,
        entries: [{ from: "금희.zip", to: "今汐.zip" }],
        // 目录不存在 → 写清单必然失败
        manifest: { path: join(root, "missing", ".mod-groups.json"), content: '{"version":1}\n' },
      })
    ).toThrow();
    expect(readdirSync(dir).sort()).toEqual(["금희.zip", "어흐.png"].sort());
  });
});
