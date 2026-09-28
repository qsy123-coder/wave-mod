/**
 * GameBanana 鸣潮 MOD → 站内角色 的分类模块。
 *
 * 为什么单独一个文件：这条链的失败模式**全是静默的**。
 * 把 mod 归到站内不存在的分类，前台只会凭空多出一个空分类页；特例顺序写反，
 * `Skins >> Cartethyia` 89 条整批糊成一个值；英文名边界正则写错，连写标题整批判不出
 * —— 三种情况都不报错，也不影响入库。所以抽成纯模块，由
 * `scripts/gamebanana-classify.test.mjs` 逐条锁住（同 `scripts/daka-classify.mjs` 的形状：
 * 不读 argv、不读 env、import 时无副作用，可被 vitest 直接 import）。
 *
 * 判定链的顺序（**顺序即语义**，改之前先看 test）：
 *   特例(大卡小卡 / 爱弥斯机甲) → 英文子分类查表 → 标题中文名 → 标题英文名
 *   → 非角色关键词 → `NPCs & Entities` 兜底 → 根分类兜底 → `Other/Misc`
 *
 * 数据来源：2026-09-28 的全量普查（405 页 / 3057 条可入库 Mod），
 * 推导与逐条证据见 `docs/gamebanana-character-map.md` 与
 * `scripts/logs/gamebanana/analyze-boundary.mjs`。全库实测真角色归类率 89.4%。
 *
 * 站内角色清单以 `src/lib/constants/character-images.ts` 的 `characterImageMap` 为**唯一**值域
 * —— CLAUDE.md 硬规则：不得新建 character 值，否则前台角色分类页会自动长出计划外的分类。
 */

import { readFileSync } from "node:fs";

// ── 值域 ────────────────────────────────────────────────────────────────────

/** 三个「不是角色」的兜底分类，站内已有；归类率统计要把它们排除 */
export const FALLBACK_MISC = "Other/Misc";
export const FALLBACK_UI = "UI";
export const FALLBACK_SKINS = "Skins";
const FALLBACKS = new Set([FALLBACK_MISC, FALLBACK_UI, FALLBACK_SKINS]);

/** 载具类走站内现成的功能分类（主理人 2026-09-28 决定），不新建角色 */
export const VEHICLE_CATEGORY = "滑翔翼,翱翔翼,科考摩托";

/** 两个站内已有的独立分类，GameBanana 却把它们混在别的子分类里（见下方特例） */
export const FLEURDELYS = "芙露德莉斯";
export const CARTETHYIA = "卡提希娅";
export const AEMEATH = "爱弥斯";
export const AEMEATH_MECH = "爱弥斯的机甲";

/** `classify()` 判定链跑完仍无归属时的 via 标记 —— 报告靠它把残差摘出来人工看 */
export const VIA_UNRESOLVED = "判不出";

/** 值域外的落点会让前台长出计划外分类，宁可报错停 */
export const CHARACTER_IMAGE_SOURCE = "../src/lib/constants/character-images.ts";

let _keys = null;

/**
 * 站内角色清单（64 个）。**惰性读**，import 时无副作用。
 *
 * 直接从 TS 源文件正则抽 key，而不是 import 它 —— 那个文件是 TS + 有 `@/` 别名，
 * 纯 node 脚本（`node scripts/sync-gamebanana.mjs`）import 不动。
 */
export function characterKeys() {
  if (_keys) return _keys;
  const src = readFileSync(new URL(CHARACTER_IMAGE_SOURCE, import.meta.url), "utf8");
  _keys = [...src.matchAll(/^\s*"([^"]+)":\s*"\/character-imgs\//gm)].map((m) => m[1]);
  if (_keys.length !== 64) {
    throw new Error(
      `characterImageMap 应有 64 个 key，实得 ${_keys.length} —— 源文件结构可能变了，` +
        `分类模块的正则要跟着改（见 ${CHARACTER_IMAGE_SOURCE}）`
    );
  }
  return _keys;
}

/** 落点越界就抛错。同步脚本在写库前调用，避免把计划外分类写进库。 */
export function assertCharacterInDomain(character) {
  if (!characterKeys().includes(character)) {
    throw new Error(
      `「${character}」不在 characterImageMap 里 —— 写进库会让前台角色分类页多出一个空分类（CLAUDE.md 硬规则）`
    );
  }
  return character;
}

// ── EN→CN 表（56 个命名子分类）─────────────────────────────────────────────
// 英文子分类名 → 站内中文角色。**这是本功能的核心资产**，逐条证据与可信度
// （36 条双语标题同现证据 / 20 条官方译名 + 主理人 2026-09-28 签字）见
// `docs/gamebanana-character-map.md`；单测会断言本表与该文档逐行一致。
//
// 顺序按该子分类的条数降序，方便人工比对文档（不影响判定）。
export const SUBCATEGORY_MAP = {
  Changli: "长离",
  "Rover Female": "女漂",
  Shorekeeper: "守岸人",
  Yinlin: "吟霖",
  Camellya: "椿",
  Carlotta: "珂莱塔",
  Jinhsi: "今汐",
  "Rover Male": "男漂",
  Cartethyia: "卡提希娅",
  Phoebe: "菲比",
  Cantarella: "坎特蕾拉",
  Chisa: "千咲",
  Aemeath: "爱弥斯",
  Augusta: "奥古斯塔",
  Iuno: "尤诺",
  Zani: "赞妮",
  Hiyuki: "绯雪",
  Sanhua: "散华",
  Lynae: "琳奈",
  Phrolova: "弗洛洛",
  Lupa: "露帕",
  Zhezhi: "折枝",
  Baizhi: "白芷",
  Galbrena: "嘉贝莉娜",
  Ciaccona: "夏空",
  "Yangyang: Xuanling": "玄翎",
  Qingxiao: "清宵",
  Jianxin: "鉴心",
  Danjin: "丹瑾",
  Yangyang: "秧秧",
  Suisui: "穗穗",
  Mornye: "莫宁",
  Chixia: "炽霞",
  Verina: "维里奈",
  Taoqi: "桃祈",
  Lucilla: "洛瑟菈",
  Encore: "安可",
  "Xiangli Yao": "相里要",
  Denia: "达妮娅",
  Jiyan: "忌炎",
  Calcharo: "卡卡罗",
  Qiuyuan: "仇远",
  Roccia: "洛可可",
  Sigrika: "西格莉卡",
  Brant: "布兰特",
  Lumi: "灯灯",
  Lucy: "露西",
  Mortefi: "莫特斐",
  Buling: "卜灵",
  Yuanwu: "渊武",
  "Luuk Herssen": "路赫斯",
  Lingyang: "凌阳",
  Rebecca: "丽贝卡",
  Youhu: "釉瑚",
  Aalto: "秋水",
  Jingran: "景燃",
};

/**
 * 不给映射的子分类：GameBanana 的**混合桶**，实测混着真角色、载具、立绘
 * （`Baizhi's …`→白芷、`Character Themed Bike`→载具、`Fleurdelys-Virtuosa`→大卡）。
 *
 * 所以它**只能当末位兜底**，绝不能一进门就短路返回 —— 早短路会把上面这些静默吞掉。
 * 主理人口径「NPC / 怪物归 `Other/Misc`」仍然成立：真正的 NPC 走完整条链自然落到那里。
 */
export const NO_MAP_SUBCATEGORIES = ["NPCs & Entities"];

// ── 特例 ────────────────────────────────────────────────────────────────────
// 必须排在**子分类查表之前**。GameBanana 把大卡小卡都塞进 `Skins >> Cartethyia`、
// 把机甲塞进 `Skins >> Aemeath`，只查表会把它们整批糊成一个值，**且不报错**。
const FLEUR_RE = /fleurdelys|fuludelisi|\bfleur\b|大卡/i;
const CART_RE = /cartethyia|卡提希娅|小卡/i;
const MECH_RE = /机甲|\bmecha\b|\bexo\b/i;
const AEM_RE = /aemeath|ameath|爱弥斯/i;

// ── 标题英文名匹配 ──────────────────────────────────────────────────────────

/**
 * 一个子分类名在标题里可能的写法。
 *
 * - 标题常把名字**连写**（`RoverMale-Detective`），所以补一个去空格的变体；
 * - `Yangyang: Xuanling` 取冒号**后**那截才是玄翎的英文名 —— 前半截是秧秧本名，
 *   带上它会让玄翎的池子混进秧秧的标题，统计因此误判成秧秧。
 */
function enAliases(sub) {
  const out = new Set([sub]);
  if (sub.includes(" ")) out.add(sub.replace(/\s+/g, ""));
  if (sub.includes(":")) out.add(sub.split(":").slice(1).join(":").trim());
  return [...out].filter((a) => a.length >= 4);
}

/**
 * 标题里实测出现过的别名 / 拼写变体 / 拼音，左边是标题里的写法。
 * 全部来自残差清单逐条看过，不是猜的。
 */
const EXTRA_ALIASES = {
  "Luuk Hersson": "路赫斯", // 子分类名是 Luuk Herssen，标题常拼错
  "Luuk herssen": "路赫斯",
  Calbrena: "嘉贝莉娜", // `CalbrenaChaopin`
  Feibi: "菲比", // `FeibiWhite dress`（菲比的拼音，子分类用的是 Phoebe）
  nvzhu: "女漂", // `nvzhu2.1npc`、`Wajit nvzhu`（女主 = 女漂）
  Hsin: "心月狐", // `绯雪×心月狐2.0 Hiyuki×Hsin 2.0`
};

let _enMatch = null;
function enMatch() {
  if (_enMatch) return _enMatch;
  const out = [];
  for (const [sub, cn] of Object.entries(SUBCATEGORY_MAP)) {
    for (const a of enAliases(sub)) out.push({ en: a, cn });
  }
  for (const [en, cn] of Object.entries(EXTRA_ALIASES)) out.push({ en, cn });
  // 长名字优先：否则 `Yangyang` 会抢在 `Yangyang: Xuanling` 前面
  _enMatch = out.sort((a, b) => b.en.length - a.en.length);
  return _enMatch;
}

/**
 * 大小写不敏感**只作用在名字上**，边界类保留原始大小写。
 *
 * 坑：给整个正则加 `i` 之后，`[^a-z]` 会退化成「不是字母」，
 * 于是 `JianxinModify`、`2LODGalbrena` 这类**连写标题**永远匹配不上（实测残差因此多 11 条）。
 * 所以这里把名字逐字母展开成 `[aA]` 形式，正则本体不带 `i`。
 *
 * 两侧只要求「相邻字符不是小写字母」：放行 CamelCase 连写，
 * 同时靠大小写挡住 `Luminous` 里的 `Lumi` 这类伪命中（后继是小写 n）。
 */
const ci = (s) => s.replace(/[a-zA-Z]/g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const _reCache = new Map();
function enRe(en) {
  if (!_reCache.has(en)) {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    _reCache.set(en, new RegExp(`(^|[^a-z])${ci(esc)}($|[^a-z])`));
  }
  return _reCache.get(en);
}

/** 标题中文名候选：站内角色 key，去掉三个兜底分类，长名字优先（`芙露德莉斯` 先于 `芙` 这类） */
let _cnByLen = null;
function cnByLen() {
  if (!_cnByLen) _cnByLen = characterKeys().filter((k) => !FALLBACKS.has(k)).sort((a, b) => b.length - a.length);
  return _cnByLen;
}

// ── 非角色内容 ──────────────────────────────────────────────────────────────
// 每一项 = [匹配正则, 性质标签, 落点]。落点为 null 表示进 `Other/Misc`。
// **顺序即优先级**：载具必须排在武器前面，否则 `Alpha's Motorbike` 会被武器规则吃掉。
const NONCHAR = [
  [
    /reshade|image\s*quality|画质|graphics?\s*(?:mod|patch|setting)|解锁帧率|\bdlss\b|\bfsr\b|engine\s*ini|mod\s*manager|启动器|launcher|工具|install/i,
    "工具 / 画质 / 管理器",
    null,
  ],
  [
    /motorcycle|motorbike|\bbike\b|摩托|滑翔|glider|翱翔|翅膀|\bwings?\b|载具|vehicle/i,
    "载具 / 滑翔翼",
    VEHICLE_CATEGORY,
  ],
  [
    /\bfx\b|effect|特效|glow|发光|filter|transparen|去雾|雾|remover|remove\s|hider|hide\s|遮挡|censor|shadow|阴影|weather|天气|lighting|光照/i,
    "特效 / 滤镜 / 去遮挡",
    null,
  ],
  [
    /splash\s*art|portrait|立绘|头像|avatar|loading\s*screen|加载屏|gacha|抽卡|界面|\bui\b|hud|图标|icon|cursor|光标|背包|backpack|guidebook|菜单/i,
    "UI / 立绘 / 加载屏",
    FALLBACK_UI,
  ],
  [
    /\bnpc\b|虹镇|黑海岸|洛海|lahai|monster|boss|怪物|敌人|enemy|emot|表情|动作|animation|pose|舞蹈|语音|voice|音效|音乐/i,
    "NPC / 怪物 / 动作 / 音频",
    null,
  ],
  [/weapon|武器|projection|涂装/i, "武器", null],
  // 武器名要单独列 —— 实测残差里最大一坨是武器投影 mod（`Emerald of Genesis` 等），
  // 标题里根本不出现 "weapon" 这个词，只写武器关键词抓不到。
  [
    /emerald of genesis|\beog\b|static mist|cosmic ripples|verdant summit|ages? of harvest|lustrous razor|abyss surge|blazing brilliance|red spring\b|rectifier|commando of conviction|hollow mirage|novaburst|undying flame|amity accord|verity|thunderbolt|rejuvenating glow|solar\b|wildfire|dawnbreaker|broadblade|sword of (?:the )?(?:creator|voyager)/i,
    "武器（WuWa 武器名）",
    null,
  ],
];
const nonCharKind = (title) => NONCHAR.find(([re]) => re.test(title)) ?? null;

// ── 判定链 ──────────────────────────────────────────────────────────────────

const str = (v) => String(v ?? "").trim();

/**
 * 判定一条记录该落哪个角色。
 *
 * @param {{ title?: string, subcategory?: string, rootCategory?: string }} mod
 *   `title` = GameBanana 的 `_sName`；`subcategory` = `_aSubCategory._sName`；
 *   `rootCategory` = `_aRootCategory._sName`。
 * @returns {{ character: string, via: string }}
 *   `character` **必定** ∈ `characterImageMap`，且必定非空（判不出时落 `Other/Misc`）；
 *   `via` 是判定依据，报告按它分桶，也是排查时唯一的线索。
 */
export function classify(mod) {
  const title = str(mod?.title);
  const sub = str(mod?.subcategory);
  const root = str(mod?.rootCategory);

  // 特例 1：大卡 / 小卡。标题点名的优先，其次看子分类。
  if (FLEUR_RE.test(title) || FLEUR_RE.test(sub)) {
    return { character: FLEURDELYS, via: "特例 芙露德莉斯/大卡" };
  }
  if (sub === "Cartethyia" || CART_RE.test(title)) {
    return { character: CARTETHYIA, via: "特例 卡提希娅/小卡" };
  }

  // 特例 2：爱弥斯的机甲是站内独立分类，含机甲的换装 mod 不并进爱弥斯。
  // 必须排在子分类查表前，否则 `Skins >> Aemeath` 69 条全成爱弥斯。
  if (sub === "Aemeath" || AEM_RE.test(title)) {
    return MECH_RE.test(title)
      ? { character: AEMEATH_MECH, via: "特例 机甲" }
      : { character: AEMEATH, via: "特例 爱弥斯" };
  }

  // 子分类 = 最强信号。注意 `Cartethyia` / `Aemeath` 已在上面被特例截走。
  if (sub && SUBCATEGORY_MAP[sub]) {
    return { character: SUBCATEGORY_MAP[sub], via: `子分类 ${sub}` };
  }

  for (const k of cnByLen()) {
    if (title.includes(k)) return { character: k, via: "标题中文名" };
  }

  for (const { en, cn } of enMatch()) {
    if (enRe(en).test(title)) return { character: cn, via: `标题英文名 ${en}` };
  }

  const kind = nonCharKind(title);
  if (kind) {
    const [, label, target] = kind;
    return { character: target ?? FALLBACK_MISC, via: `非角色：${label}` };
  }

  // `NPCs & Entities` 只能当末位兜底（它混着真角色 / 载具 / 立绘，见 NO_MAP_SUBCATEGORIES）
  if (sub === "NPCs & Entities") {
    return { character: FALLBACK_MISC, via: "非角色：NPC 混合桶" };
  }
  // 根分类兜底：GameBanana 自己就把 UI 与杂项分开了，直接沿用
  if (root === "UI") return { character: FALLBACK_UI, via: "根分类 UI" };
  if (root === "Other/Misc") return { character: FALLBACK_MISC, via: "根分类 Other/Misc" };

  return { character: FALLBACK_MISC, via: VIA_UNRESOLVED };
}

/**
 * 是否算「具体角色」（归类率 KPI 的口径）：
 * 三个兜底分类与载具功能分类都不算，空值也不算。
 */
export function isSpecificCharacter(character) {
  if (!character) return false;
  if (FALLBACKS.has(character)) return false;
  if (character === VEHICLE_CATEGORY) return false;
  return true;
}
