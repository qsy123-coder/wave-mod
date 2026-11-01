/**
 * 计划层：把「建议名」变成「能不能落地的计划」。
 *
 * 关键点：角色合不合法**不自己判断**，一律调 `scripts/daily-classify.mjs` ——
 * 那是前台分类、上传脚本、自检脚本共用的同一份规则，抄一份就等着两边漂移。
 */
import { extname } from "node:path";

import { dedupKey, resolveCharacterAndTitle } from "../../../scripts/daily-classify.mjs";

import { composeKey, looksLikeEndfield } from "./naming.mjs";

/** issue：block = 禁止勾选；warn = 能改但要知道；info = 只是提示 */
const block = (code, message, extra = {}) => ({ code, level: "block", message, ...extra });
const warn = (code, message, extra = {}) => ({ code, level: "warn", message, ...extra });
const info = (code, message, extra = {}) => ({ code, level: "info", message, ...extra });

/**
 * 一个条目要改哪些名字：主条目（exe/目录/首图）+ 跟着它走的预览图。
 * 预览图按站内约定编号：第一张 `<新名>.<ext>`，往后 `<新名>-1.<ext>`、`<新名>-2.<ext>`。
 */
function buildTargets(item, newBase) {
  const images = item.images ?? [];
  const targets = [];
  if (item.kind === "image") {
    const all = [item.name, ...images];
    all.forEach((name, i) => {
      targets.push({ from: name, to: `${newBase}${i === 0 ? "" : `-${i}`}${extname(name)}` });
    });
    return targets;
  }
  targets.push({ from: item.name, to: item.isDir ? newBase : `${newBase}${item.ext ?? ""}` });
  images.forEach((name, i) => {
    targets.push({ from: name, to: `${newBase}${i === 0 ? "" : `-${i}`}${extname(name)}` });
  });
  return targets;
}

/**
 * @param {object} args
 * @param {{name:string, base:string, kind:string, ext?:string, isDir?:boolean,
 *          images?:string[], source:string, meta?:object}} args.item
 * @param {object} args.suggestion translate()/splitExistingName() 的结果（页面上可被用户改过）
 * @param {Set<string>|null} args.knownCharacters 库内 distinct character；null = 拿不到库
 * @param {Set<string>|null} args.existingDedup 库内 `character|title`；null = 拿不到库
 * @param {Set<string>} args.existingNames 目标目录里已有的条目名
 * @param {object} args.glossary
 */
export function planItem({ item, suggestion, knownCharacters, existingDedup, existingNames, glossary }) {
  const issues = [];
  const characters = (suggestion.characters ?? []).map((c) => String(c).trim()).filter(Boolean);

  if (looksLikeEndfield(item.name, glossary)) {
    issues.push(block("endfield", "非鸣潮（终末地）条目，应挪到 _Endfield/，不参与命名"));
  }
  if (!characters.length) {
    issues.push(block("no-character", "认不出角色，请手动选一个站内已有角色"));
  }
  if (characters.length > 1) {
    issues.push(
      block("multi-character", `包含 ${characters.length} 个角色（${characters.join("、")}），需先拆成单角色包`)
    );
  }
  if (knownCharacters) {
    for (const c of characters) {
      if (!knownCharacters.has(c)) {
        issues.push(block("unknown-character", `库里没有「${c}」这个角色，落地会凭空多一个分类`, { character: c }));
      }
    }
  } else {
    issues.push(warn("no-db", "连不上数据库，角色未校验"));
  }
  if (!String(suggestion.name ?? "").trim()) {
    issues.push(block("empty-name", "名称为空"));
  }

  const newBase = composeKey({
    characters,
    name: suggestion.name,
    hotkeys: suggestion.hotkeys,
    author: suggestion.author,
  });

  let parsed = { character: "", title: "" };
  if (newBase) {
    parsed = resolveCharacterAndTitle(newBase);
    if (characters.length === 1 && parsed.character !== characters[0]) {
      issues.push(
        block(
          "parse-mismatch",
          `拼出来的名字会被解析成「${parsed.character}」，与预期角色「${characters[0]}」不一致`,
          { parsed: parsed.character }
        )
      );
    }
  }

  const targets = newBase ? buildTargets(item, newBase) : [];
  const changed = targets.filter((t) => t.from !== t.to);
  // 冲突：目标名已经被目录里别的条目占着（自己那条不算）
  const conflicts = [];
  for (const t of changed) {
    if (existingNames.has(t.to) && t.to !== t.from) conflicts.push(t.to);
  }
  if (conflicts.length) {
    issues.push(block("conflict", `目标名已存在，拒绝覆盖：${[...new Set(conflicts)].join("、")}`));
  }

  const dedup = parsed.character ? dedupKey(parsed.character, parsed.title) : "";
  if (dedup && existingDedup?.has(dedup)) {
    issues.push(warn("duplicate", "库里已有这个去重键，上传时会被当成重复跳过（重新上架才会用到）"));
  }
  if (suggestion.confidence === "low" && characters.length) {
    issues.push(info("low-confidence", `有没翻译干净的词：${(suggestion.leftover ?? []).join(" ") || "—"}`));
  }
  if (newBase && newBase.length > 120) {
    issues.push(warn("too-long", `名字 ${newBase.length} 字，个别网盘/系统对超长名不友好`));
  }

  const alreadyNamed = changed.length === 0 && targets.length > 0;
  if (alreadyNamed) issues.push(info("already-named", "已经是这个名字，无需改名"));

  return {
    from: item.name,
    source: item.source,
    to: newBase,
    display: targets[0]?.to ?? newBase,
    targets,
    changed: changed.length,
    characters,
    character: parsed.character,
    title: parsed.title,
    dedup,
    issues,
    alreadyNamed,
    applicable: changed.length > 0 && issues.every((i) => i.level !== "block"),
  };
}

/** 一次算完一批；顺便统计好页面顶部要显示的数字 */
export function planAll({ items, suggestions, knownCharacters, existingDedup, glossary }) {
  const existingNames = new Set(items.map((i) => i.name));
  const rows = items.map((item) =>
    planItem({
      item,
      suggestion: suggestions[item.name] ?? { characters: [], name: "", author: "", hotkeys: "" },
      knownCharacters,
      existingDedup,
      existingNames,
      glossary,
    })
  );
  return {
    rows,
    stats: {
      total: rows.length,
      applicable: rows.filter((r) => r.applicable).length,
      blocked: rows.filter((r) => !r.applicable && !r.alreadyNamed).length,
      already: rows.filter((r) => r.alreadyNamed).length,
      duplicates: rows.filter((r) => r.issues.some((i) => i.code === "duplicate")).length,
    },
  };
}
