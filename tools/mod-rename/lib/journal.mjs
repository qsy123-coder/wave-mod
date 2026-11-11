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

import { restoreModGroupsFile, writeModGroupsFileAtomic } from "../../../scripts/mod-groups.mjs";

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
 * `manifest` 可选：`{ path, content }` 指向日期目录的 `.mod-groups.json`。
 * 改名成功后原子写清单；清单写失败会连同已改的文件一起回滚 —— 否则会出现
 * 「文件名已经变了、清单却没有」，上传脚本按旧名匹配不到，整批静默多卡。
 *
 * @param {{dir:string, entries:{from:string,to:string}[], journalDir:string, label?:string,
 *          manifest?:{path:string, content:string|null}|null}} args
 * @returns {{id:string, ops:object[], skipped:object[]}}
 */
export function applyPlan({ dir, entries, journalDir, label = "", manifest = null }) {
  const ops = [];
  const skipped = [];
  // 同批内校验：磁盘上的 `existsSync` 看不见「后面那条也要改成同一个名字」，
  // 两条撞名会一路走到 rename 才报错（Windows 报 EEXIST），整批回滚。
  const targetOwner = new Map(); // 目标名 → 抢先改到它的来源名
  const sourceSeen = new Set();

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
    if (sourceSeen.has(e.from)) throw new Error(`同一批里「${e.from}」出现了两次`);
    const claimed = targetOwner.get(e.to);
    if (claimed) {
      throw new Error(`「${claimed}」和「${e.from}」要改成同一个名字，拒绝覆盖：${e.to}`);
    }
    sourceSeen.add(e.from);
    targetOwner.set(e.to, e.from);
    ops.push({ type: "rename", dir: baseDir, from: e.from, to: e.to });
  }

  if (!ops.length) return { id: "", ops: [], skipped };

  // 清单的「改前」内容要在任何落盘动作之前读，撤销时才能精确还原
  const manifestBefore =
    manifest?.path && existsSync(manifest.path) ? readFileSync(manifest.path, "utf8") : null;

  const done = [];
  try {
    for (const op of ops) {
      renameSync(join(op.dir, op.from), join(op.dir, op.to));
      done.push(op);
    }
    if (manifest?.path && manifest.content != null) {
      writeModGroupsFileAtomic(manifest.path, manifest.content);
    }
  } catch (err) {
    for (const op of done.reverse()) {
      try {
        renameSync(join(op.dir, op.to), join(op.dir, op.from));
      } catch {
        // 回滚再失败就只能靠 journal 里没有这条记录、由人工处理，这里不掩盖原始错误
      }
    }
    // 改名回滚了，清单也要回到改前状态，否则会留下指向不存在文件的分组
    if (manifest?.path && manifest.content != null) {
      try {
        restoreModGroupsFile(manifest.path, manifestBefore);
      } catch {
        // 清单恢复失败不能盖住原始错误，交给调用方看上面的 throw
      }
    }
    throw err;
  }

  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(journalDir, { recursive: true });
  writeFileSync(
    join(journalDir, `${id}.json`),
    JSON.stringify(
      {
        id,
        dir,
        createdAt: new Date().toISOString(),
        label,
        status: "applied",
        ops,
        manifest: manifest?.path
          ? { path: manifest.path, before: manifestBefore, after: manifest.content ?? null }
          : null,
      },
      null,
      2),
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

  journal.undoneAt = new Date().toISOString();

  // 清单只在「还是本批写进去的那份」时恢复；用户后来手工改过/别批写过就不动它，
  // 否则撤销一个旧批次会把新批次的分组抹掉。
  if (journal.manifest?.path) {
    try {
      const current = existsSync(journal.manifest.path) ? readFileSync(journal.manifest.path, "utf8") : null;
      if (current === (journal.manifest.after ?? null)) {
        restoreModGroupsFile(journal.manifest.path, journal.manifest.before ?? null);
      } else {
        failures.push("清单已被后续操作修改，未恢复");
      }
    } catch (err) {
      failures.push(`清单恢复失败：${err.message}`);
    }
  }

  journal.status = failures.length ? "partially-undone" : "undone";
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
