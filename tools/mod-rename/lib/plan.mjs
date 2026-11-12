/**
 * 计划层：把「建议名」变成「能不能落地的计划」。
 *
 * 关键点：角色合不合法**不自己判断**，一律调 `scripts/daily-classify.mjs` ——
 * 那是前台分类、上传脚本、自检脚本共用的同一份规则，抄一份就等着两边漂移。
 */
import { extname } from "node:path";

import {
  dedupKey,
  normalizeCharacter,
  resolveCharacterAndTitle,
} from "../../../scripts/daily-classify.mjs";
import { applyPostVariantLabels } from "../../../scripts/mod-groups-pure.mjs";

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
  // 角色名先过站内别名表：`心（含大招）`→`心月狐`、`陆赫斯`→`路赫斯`…
  // 不归一的话这里会比网站本身更严格 —— 前台分类、列表筛选、每日上传脚本
  // 全都是「先归一化再比较」（见 scripts/daily-classify.mjs 的 CHARACTER_ALIASES），
  // 只有这个工具拿原始输入做全等比对，于是别名一律被当成「库里没有这个角色」。
  const rawCharacters = (suggestion.characters ?? []).map((c) => String(c).trim()).filter(Boolean);
  const characters = [...new Set(rawCharacters.map((c) => normalizeCharacter(c)))];
  // 归一过程不静默：改写了用户填的名字就明说一句，方便确认归到哪一类
  const folded = rawCharacters
    .map((from) => ({ from, to: normalizeCharacter(from) }))
    .filter(({ from, to }) => from !== to);
  if (folded.length) {
    issues.push(
      info(
        "character-alias",
        `按站内别名归一：${folded.map(({ from, to }) => `「${from}」→「${to}」`).join("、")}`
      )
    );
  }
  // 图片组（一篇帖子的多张预览图）可能是多角色合集的截图，本来就没有单一角色，
  // 不能按 Mod 包的标准拦成「认不出角色」——否则这种行永远无法改名。
  const isImageGroup = item.kind === "image";

  if (looksLikeEndfield(item.name, glossary)) {
    issues.push(block("endfield", "非鸣潮（终末地）条目，应挪到 _Endfield/，不参与命名"));
  }
  if (!characters.length && !isImageGroup) {
    issues.push(block("no-character", "认不出角色，请手动选一个站内已有角色"));
  }
  if (characters.length > 1) {
    issues.push(
      block("multi-character", `包含 ${characters.length} 个角色（${characters.join("、")}），需先拆成单角色包`)
    );
  }
  if (knownCharacters) {
    // 库里的历史值也可能是别名（`陆赫斯` 与 `路赫斯` 并存），比较前同样归一，
    // 否则「输入归一后变成 路赫斯，但集合里只有 陆赫斯」仍会误判成未知角色。
    const known = new Set([...knownCharacters].map((c) => normalizeCharacter(String(c).trim())));
    for (const c of characters) {
      if (!known.has(c)) {
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
    // 去掉扩展名的本地名：目录和它的压缩包/打包 exe 共用同一个 base，
    // 同一帖子分组时靠它认出「这是同一个附件」而不是两个版本。
    base: item.base,
    source: item.source,
    // 多附件分组时用来排除「没有主文件的孤儿预览图」，它们不是帖子附件
    kind: item.kind,
    url: item.meta?.url ?? "",
    src: item.meta?.src ?? "",
    author: item.meta?.author ?? "",
    postTitle: item.meta?.title ?? "",
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

/** 页面顶部要显示的数字；跨来源合并冲突后要重算，所以单独抽出来 */
export function summarize(rows) {
  return {
    total: rows.length,
    applicable: rows.filter((r) => r.applicable).length,
    blocked: rows.filter((r) => !r.applicable && !r.alreadyNamed).length,
    already: rows.filter((r) => r.alreadyNamed).length,
    duplicates: rows.filter((r) => r.issues.some((i) => i.code === "duplicate")).length,
  };
}

/**
 * 一批里两行拼出同一个目标名 —— `planItem` 只能看见目录里**已经存在**的名字，
 * 看不见同一批里别的行，所以要等全部行算完再补这一刀。
 *
 * 最常见的来源是爬虫把同一条帖子的分享链接下了两遍（帖子正文里同一链接出现两次，
 * 或第二次后面粘了韩文），于是目录里躺着两个字节相同的副本，两行自然同名。
 * 不提前拦住的话，页面会把两条都勾上，提交时第二条撞名，整批回滚 —— 就是「命名失败」。
 *
 * 处理：保留第一条可应用的行，后面的行判 block 并写明撞了谁，让用户自己删副本
 * （工具按设计不删文件）。跨来源也要一起查，因为一次应用可以横跨两个来源目录。
 */
/** 原始文件名里的变体词 → 名字后缀（`（SFW）` / `（Thicc NSFW）`） */
function variantSuffix(src) {
  const s = String(src || "").toLowerCase();
  if (!s) return "";
  const parts = [];
  if (/thicc|thick/.test(s)) parts.push("Thicc");
  if (/nsfw/.test(s)) parts.push("NSFW");
  else if (/(^|[^a-z])sfw($|[^a-z])/.test(s)) parts.push("SFW");
  if (/free/.test(s)) parts.push("Free");
  if (/alt(ernative)?($|[^a-z])/.test(s)) parts.push("Alt");
  return parts.length ? `（${parts.join(" ")}）` : "";
}

/** 把后缀插在 ` by 作者` 之前，保持 `角色-名称（SFW）by 作者` 的顺序 */
function withSuffix(base, suffix) {
  if (!suffix) return base;
  const m = /^(.*?)(\s+by\s+.*)$/i.exec(String(base));
  return m ? `${m[1]}${suffix}${m[2]}` : `${base}${suffix}`;
}

function suffixRow(row, suffix) {
  if (!suffix) return;
  const targets = (row.targets ?? []).map((t) => {
    const ext = extname(t.to);
    const stem = ext ? t.to.slice(0, t.to.length - ext.length) : t.to;
    return { ...t, to: `${withSuffix(stem, suffix)}${ext}` };
  });
  const title = row.title ? withSuffix(row.title, suffix) : row.title;
  Object.assign(row, {
    to: row.to ? withSuffix(row.to, suffix) : row.to,
    display: targets[0]?.to ?? row.display,
    targets,
    title,
    dedup: title && row.character ? dedupKey(row.character, title) : row.dedup,
    issues: [
      ...(row.issues ?? []),
      {
        code: "auto-suffixed",
        level: "warn",
        message: `同一帖子的多个附件，已自动加后缀「${suffix}」区分`,
      },
    ],
  });
}

/**
 * 同一个帖子（`meta.url` 相同）挂了多个附件时，给第 2 个以后的条目自动加后缀。
 *
 * 下载器把 6 个附件存成 `X_1.zip`…`X_6.zip`，扫描后每个都是独立条目、建议名
 * 却都是 `角色-名称`，于是全部互相撞名、整批不可应用。优先用原始文件名里的
 * SFW/NSFW/Thicc 当后缀；没有就退回 `-2`、`-3`。
 */
export function applySamePostSuffixes(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.applicable || !(row.changed > 0)) continue;
    // 只有拿得到帖子 URL 才敢认定「同一个帖子的多个附件」；
    // 没有 URL 的两行同名（例如旧爬虫下了两遍）仍然按重复副本 block。
    const key = row.url;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const used = new Set();
    const srcOwner = new Map();   // 原始文件名 → 第一次出现的行
    const baseOwner = new Map();  // 本地 base → 第一次出现的行
    const claimedTargets = new Set(); // 组内已占用的目标名
    let variantIndex = 0;         // 实际版本序号（跳过目录/压缩包这类重复项）
    group.forEach((row) => {
      // 同一个原始文件出现两次 = 爬虫把同一条链接下了两遍，留给 markBatchConflicts 拦重复
      if (row.src && srcOwner.has(row.src)) return;
      if (row.src) srcOwner.set(row.src, row);

      // 目录 + 同名压缩包/打包 exe 是**同一个附件**（解压/打包出来的），不是两个版本。
      // 以前这里会把它当第二版本加 `-2`/`（Free）` 后缀，挂在压缩包上的预览图
      // 也跟着改名，于是和分享名对不上。base 相同的行直接算同一个版本。
      const baseKey = String(row.base ?? "").toLowerCase();
      if (baseKey && baseOwner.has(baseKey)) {
        // 虽然它和上一个附件是同一份，目标名（`X.zip`）仍要占住，后面的行才不会再撞
        for (const t of row.targets ?? []) claimedTargets.add(t.to);
        return;
      }
      if (baseKey) baseOwner.set(baseKey, row);

      const currentIndex = variantIndex++;
      const targets = (row.targets ?? []).map((t) => t.to);
      const collides = targets.some((to) => claimedTargets.has(to));
      if (!collides) {
        for (const to of targets) claimedTargets.add(to);
        return;
      }

      // 只有目标名真的撞了（同帖多附件但建议名一样）才加后缀区分。
      let suffix = variantSuffix(row.src) || `-${currentIndex + 1}`;
      if (used.has(suffix)) suffix = `${suffix}-${currentIndex + 1}`;
      used.add(suffix);
      suffixRow(row, suffix);
      for (const t of row.targets ?? []) claimedTargets.add(t.to);
    });
  }
  return rows;
}

export function markBatchConflicts(rows) {
  const owner = new Map(); // 目标名 → 第一条占住它的行
  for (const row of rows) {
    if (!row.applicable || !(row.changed > 0)) continue;
    const taken = (row.targets ?? []).filter((t) => owner.has(t.to));
    if (taken.length) {
      const claimants = [...new Map(taken.map((t) => [owner.get(t.to).from, owner.get(t.to)])).values()];
      const first = claimants
        .map((r) => (r.source && r.source !== row.source ? `${r.source} / ${r.from}` : r.from))
        .join("、");
      // 同名不等于重复：arca 和 GameBanana 各有一篇标题相同的帖子时，两个包内容
      // 可能完全不同，提醒用户补作者/改名称区分，而不是叫他去删文件。
      const crossSource = claimants.some((r) => r.source && r.source !== row.source);
      row.issues.push(
        block(
          "duplicate-target",
          crossSource
            ? `与「${first}」改名后的目标重名（不同来源的同名包）；补作者或改名称区分后再应用`
            : `与本批「${first}」改名后的目标重名（疑似同一文件被下载了两份）；` +
                `先删掉多余副本，或手动改一个名字再应用`,
          { conflictWith: first }
        )
      );
      row.applicable = false;
      continue;
    }
    for (const t of row.targets ?? []) owner.set(t.to, row);
  }
  return rows;
}

/** 一次算完一批；顺便统计好页面顶部要显示的数字 */
export function planAll({ items, suggestions, knownCharacters, existingDedup, glossary }) {
  // 预览图也算「目录里已存在的名字」：否则对已命名条目再应用时，编号错位产生的
  // 目标名（`X.jpg` 被改成 `X-1.jpg`）不会被冲突检查拦住，落盘才报「目标已存在」。
  const existingNames = new Set(items.flatMap((i) => [i.name, ...(i.images ?? [])]));
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
  // 先处理「同一帖子多个附件」的同名问题，再给整批补分组元数据（写 .mod-groups.json 用），
  // 最后检查跨帖/跨来源真冲突
  applySamePostSuffixes(rows);
  applyPostVariantLabels(rows);
  markBatchConflicts(rows);
  return { rows, stats: summarize(rows) };
}
