/**
 * 每日上传的**纯分类逻辑**：分享名 → character / title / version。
 *
 * 为什么单独抽出来：后台「批量上传」（CSV + txt + 预览图）也要用同一套规则。
 * 如果页面里另写一份，两边的角色前缀表早晚会漂移，同一标题会被分到不同分类，
 * 直接破坏去重键 `character|title`。这里只放纯函数，无 IO、无第三方依赖，
 * 每日脚本与 Next 客户端都可以 import。
 *
 * ⚠️ 改这里的任何前缀/别名，都会改变去重键。改之前先看
 *    `scripts/upload-daily-by-date.mjs` 顶部与 CLAUDE.md 的「事后改 character」说明。
 */

import { resolveReshareAlias } from "./reshare-title-aliases.mjs";
import { resolveDakaIfApplicable } from "./daka-classify-pure.mjs";

/** 角色前缀 → 标准角色名，title 去前缀 */
export const CHARACTER_PREFIX_MAP = [
  { prefix: "清宵", character: "清宵" },
  { prefix: "清霄", character: "清宵" },
  { prefix: "玄翎", character: "玄翎" },
  { prefix: "洛瑟菈", character: "洛瑟菈" },
  { prefix: "穗穗", character: "穗穗" },
  { prefix: "相里要", character: "相里要" },
  { prefix: "达妮娅", character: "达妮娅" },
  { prefix: "女漂皮肤", character: "女漂" },
  { prefix: "琳奈皮肤", character: "琳奈" },
  { prefix: "千咲皮肤", character: "千咲" },
  { prefix: "千咲", character: "千咲" },
  { prefix: "卡提希娅", character: "卡提希娅" },
  { prefix: "琳奈", character: "琳奈" },
  { prefix: "莫宁", character: "莫宁" },
  { prefix: "卜灵", character: "卜灵" },
  { prefix: "景燃", character: "景燃" },
  { prefix: "绯雪", character: "绯雪" },
  { prefix: "丽贝卡", character: "丽贝卡" },
  { prefix: "奥古斯塔", character: "奥古斯塔" },
  { prefix: "爱弥斯", character: "爱弥斯" },
  { prefix: "露帕", character: "露帕" },
  { prefix: "心月狐", character: "心月狐" },
];

/**
 * UI 类：整包 UI，title 保留完整 key。
 * 不写死角色清单，否则清单外角色（如「椿全ui」）会切出站内不存在的假分类。
 */
const UI_FULL_KEY_RE = /^(?:.*?全ui|编队界面|编队图片|加载界面|隐藏UID|.*?抽卡界面)/;

/** 武器皮：`<武器名>-<皮肤名>`，整包归 `武器`，title 保留完整 key */
const WEAPON_PREFIXES = ["浩境粼光"];

/** 与 src/lib/mods-domain/sorting.ts 的 CHARACTER_ALIASES 保持一致 */
export const CHARACTER_ALIASES = {
  "陆赫斯": "路赫斯",
  "反虚化，ui界面，场景，葫芦，特效等": "UI",
  "千咲皮肤[蜜桃冰]": "千咲",
  "科考摩托": "滑翔翼,翱翔翼,科考摩托",
  "心": "心月狐",
  "背包 编队 商城 用户界面": "UI",
  "心(含大招)": "心月狐",
  "爱弥斯饰品[雪绒豹豹]": "爱弥斯",
};

/** 前缀 → UI 分类（如「索拉指南-长离动态nsfw」整包皮肤归 UI，title 去前缀） */
const UI_PREFIXES = ["索拉指南"];

/**
 * 特效类：整包归库内历史 bucket「反虚化，ui界面，场景，葫芦，特效等」，
 * title 保留完整 key。写原文而不是 UI，是为了让去重键与库内既有记录一致。
 */
export const EFFECT_BUCKET = "反虚化，ui界面，场景，葫芦，特效等";
const EFFECT_BUCKET_PREFIXES = [
  "去角色轮廓",
  "去葫芦和葫芦光",
  "RabbitFX反虚化",
  "鼠标指针",
  "隐藏心的红方块",
  "隐藏云景座椅",
  "隐藏座椅虚化",
  "油腻高光特效",
];

/** 「爱弥斯的机甲」「爱弥斯大招」整包 → 独立分类「爱弥斯的机甲」，title 保留完整 key */
const AEMEATH_MECH_PREFIXES = ["爱弥斯的机甲", "爱弥斯大招"];

/** 「周本*」→ 独立分类「怪物」，title 保留完整 key */
const MONSTER_PREFIXES = ["周本"];

/**
 * 网盘导出名 → 本地规范名的桥接表（键 = CSV/xlsx 导出名，值 = 本地 exe / 预览图名）。
 * 分类与预览图走规范名；迅雷链接查找仍用原始 key。
 */
export const KEY_ALIASES = new Map([
  ["心月狐-切换版by weiwuxc888", "心月狐-大招体型切换版by weiwuxc888"],
  ["锁暝特效更改-深黑", "锁暝-特效更改-深黑"],
]);

export function resolveCanonicalKey(key) {
  return KEY_ALIASES.get(key) ?? key;
}

/** 去掉分享名末尾的「重名后缀」`(1)` / `（2）` */
export function stripRenameSuffix(key) {
  return String(key).replace(/[(（]\d+[)）]$/, "").trim();
}

function canonicalizeParens(value) {
  return value.replace(/（/g, "(").replace(/）/g, ")");
}

export function normalizeCharacter(character) {
  return CHARACTER_ALIASES[character] ?? CHARACTER_ALIASES[canonicalizeParens(character)] ?? character;
}

/**
 * 去重键：`character|title`，但把 title 开头重复的「角色-」前缀归一化掉。
 * 两侧都过一遍，新旧写法才能互相匹配。
 */
export function dedupKey(character, title) {
  const c = String(character ?? "").trim();
  let t = String(title ?? "").trim();
  if (c && t.startsWith(c)) t = t.slice(c.length).replace(/^[-－\s]+/, "").trim();
  return `${c}|${t}`;
}

/**
 * 分享名（已去 .exe）→ `{ character, title }`。
 * 规则顺序不能随意调整，详见原 `upload-daily-by-date.mjs` 的逐条注释。
 */
export function resolveCharacterAndTitle(key) {
  if (key.startsWith("尤诺的月环")) {
    return { character: "尤诺", title: key.slice("尤诺".length) };
  }

  const reshare = resolveReshareAlias(key);
  if (reshare) return reshare;

  for (const p of AEMEATH_MECH_PREFIXES) {
    if (key.startsWith(p)) return { character: "爱弥斯的机甲", title: key };
  }

  for (const p of MONSTER_PREFIXES) {
    if (key.startsWith(p)) return { character: "怪物", title: key };
  }

  const daka = resolveDakaIfApplicable(key);
  if (daka) return daka;

  if (UI_FULL_KEY_RE.test(key)) {
    return { character: "UI", title: key };
  }

  for (const p of UI_PREFIXES) {
    if (key.startsWith(p)) {
      const title = key.slice(p.length).replace(/^[-－\s]+/, "").trim() || key;
      return { character: "UI", title };
    }
  }

  for (const p of WEAPON_PREFIXES) {
    if (key.startsWith(p)) return { character: "武器", title: key };
  }

  for (const p of EFFECT_BUCKET_PREFIXES) {
    if (key.startsWith(p)) return { character: EFFECT_BUCKET, title: key };
  }

  if (key.startsWith("爱弥斯饰品")) {
    return { character: "爱弥斯", title: key };
  }

  // 用户 2026-10-30：严格用每日更新文件夹里的文件名称，莫宁的 title 原样保留前缀。
  if (key.startsWith("莫宁-")) {
    return { character: "莫宁", title: key };
  }

  for (const { prefix, character } of CHARACTER_PREFIX_MAP) {
    if (key.startsWith(prefix)) {
      let title = key.slice(prefix.length).replace(/^[-－\s]+/, "").trim();
      if (prefix.includes("皮肤")) title = key;
      if (!title) title = key;
      return { character: normalizeCharacter(character), title };
    }
  }

  return { character: normalizeCharacter(key.split(/[-－]/)[0] || key), title: key };
}

/** 从标题提取版本：`v1.2` / `1.2` → `v1.2`，否则「未标注」 */
export function extractVersion(title) {
  const match = String(title ?? "").match(/v(\d+[\d.]*)/i);
  return match ? `v${match[1]}` : "未标注";
}
