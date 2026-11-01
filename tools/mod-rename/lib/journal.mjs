/**
 * 落盘与撤销。
 *
 * 设计原则：
 *   1. 只会 rename，不删不改内容 —— 撤销就是把 from/to 反过来再 rename 一次；
 *   2. 先写 journal 再动手不行（失败会留下假记录），所以先执行、成功后再落 journal，
 *      中途失败则当场逆序回滚已做的那几条；
 *   3. 目标已存在一律拒绝，绝不覆盖。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ILLEGAL = /[\\/:*?"<>|]/;
const KEEP_JOURNALS = 30;

export function assertSafeName(name) {
  if (!name || typeof name !== "string") throw new Error("空名字");
  if (ILLEGAL.test(name)) throw new Error(`名字含 Windows 非法字符：${name}`);
  if (name === "." || name === ".." || name.includes("..")) throw new Error(`名字里不能有 ..：${name}`);
}

/**
 * 执行一批改名。
 *
 * @param {{dir:string, entries:{from:string,to:string}[], journalDir:string, label?:string}} args
 * @returns {{id:string, ops:object[], skipped:object[]}}
 */
export function applyPlan({ dir, entries, journalDir, label = "" }) {
  const ops = [];
  const skipped = [];

  // 先整体校验，任何一条不合法就一条都不动 —— 半套改动最难收拾。
  // 一条 entry 可以带自己的 `dir`（一次改名跨 arca.live / GameBanana 两个来源）。
  for (const e of entries) {
    try {
      assertSafeName(e.from);
      assertSafeName(e.to);
    } catch (err) {
      throw new Error(`「${e.from}」：${err.message}`);
    }
    const baseDir = e.dir ?? dir;
    const src = join(baseDir, e.from);
    const dst = join(baseDir, e.to);
    if (e.from === e.to) {
      skipped.push({ ...e, reason: "名字没变" });
      continue;
    }
    if (!existsSync(src)) throw new Error(`源条目不存在：${e.from}`);
    if (existsSync(dst)) throw new Error(`目标已存在，拒绝覆盖：${e.to}`);
    ops.push({ type: "rename", dir: baseDir, from: e.from, to: e.to });
  }

  if (!ops.length) return { id: "", ops: [], skipped };

  const done = [];
  try {
    for (const op of ops) {
      renameSync(join(op.dir, op.from), join(op.dir, op.to));
      done.push(op);
    }
  } catch (err) {
    for (const op of done.reverse()) {
      try {
        renameSync(join(op.dir, op.to), join(op.dir, op.from));
      } catch {
        // 回滚再失败就只能靠 journal 里没有这条记录、由人工处理，这里不掩盖原始错误
      }
    }
    throw err;
  }

  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(journalDir, { recursive: true });
  writeFileSync(
    join(journalDir, `${id}.json`),
    JSON.stringify({ id, dir, createdAt: new Date().toISOString(), label, status: "applied", ops }, null, 2),
    "utf8"
  );
  pruneJournals(journalDir);
  return { id, ops, skipped };
}

export function readJournal(journalDir, id) {
  const p = join(journalDir, `${id}.json`);
  if (!existsSync(p)) throw new Error(`找不到改名记录：${id}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * 撤销：逆序把 to 改回 from。
 * 只要有一条回不去就立刻停下并报告 —— 继续改剩下的只会让目录更乱。
 */
export function undoJournal({ journalDir, id }) {
  const journal = readJournal(journalDir, id);
  if (journal.status !== "applied") throw new Error(`这条记录状态是 ${journal.status}，不能撤销`);

  const failures = [];
  for (const op of [...journal.ops].reverse()) {
    const opDir = op.dir ?? journal.dir;
    const src = join(opDir, op.to);
    const dst = join(opDir, op.from);
    if (!existsSync(src)) {
      failures.push(`${op.to} 已不在（可能被手动改过）`);
      continue;
    }
    if (existsSync(dst)) {
      failures.push(`${op.from} 已存在，拒绝覆盖`);
      continue;
    }
    renameSync(src, dst);
  }

  journal.status = failures.length ? "partially-undone" : "undone";
  journal.undoneAt = new Date().toISOString();
  journal.failures = failures;
  writeFileSync(join(journalDir, `${id}.json`), JSON.stringify(journal, null, 2), "utf8");
  return { id, restored: journal.ops.length - failures.length, failures };
}

/** 最近的记录（新的在前），给页面显示「撤销上一批」 */
export function listJournals(journalDir, limit = 10) {
  if (!existsSync(journalDir)) return [];
  return readdirSync(journalDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const j = JSON.parse(readFileSync(join(journalDir, f), "utf8"));
        return { id: j.id, createdAt: j.createdAt, label: j.label, status: j.status, count: j.ops?.length ?? 0, dir: j.dir };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

function pruneJournals(journalDir) {
  const files = readdirSync(journalDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: statSync(join(journalDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(KEEP_JOURNALS)) {
    try {
      unlinkSync(join(journalDir, f));
    } catch {
      // 清理失败不影响主流程
    }
  }
}
