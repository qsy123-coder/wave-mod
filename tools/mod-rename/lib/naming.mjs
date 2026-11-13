/**
 * 命名纯函数：把爬虫原始名拆成「角色 / 名称 / 切换键 / 作者」，再拼回站内规范名。
 *
 * 这里**只做字符串**，不碰 fs、不碰网络、不问模型 —— 好单测，也好在页面上即时预览。
 * 角色是否合法、去重键是否重复，全部交给 plan.mjs 用项目自己的 daily-classify 判断。
 */

/** 韩文音节：出现即说明还有没翻译干净的词，建议名要标黄 */
export const HANGUL_RE = /[가-힣]/;

/** 没有角色但明显是界面类 Mod → 归站内已有的 `UI` 分类 */
const UI_RE =
  /(?<![A-Za-z])ui(?![A-Za-z])|(?<![A-Za-z])cursor|(?<![A-Za-z])guidebook|(?<![A-Za-z])backpack|first[\s-]*person|(?<![A-Za-z])shoulder|(?<![A-Za-z])hud(?![A-Za-z])|(?<![A-Za-z])interface|界面|光标|背包/i;

/** 英文角色名按“整词”匹配，避免 `Lupa` 命中 `LupaLand` 这种 */
function latinWordRe(word) {
  const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "i");
}

/** 站内标题里的括号统一用全角（与现有标题一致） */
export function canonicalParens(text) {
  return String(text).replace(/\(/g, "（").replace(/\)/g, "）");
}

/**
 * Windows 非法字符 + 半角斜杠。
 * `/` 换成全角而不是删掉：文件名里它常是「长离／珂莱塔」这种并列，删掉会改语义。
 */
export function sanitizeName(text) {
  return String(text)
    .replace(/[/]/g, "／")
    .replace(/[\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-\s.]+|[-\s.]+$/g, "")
    .trim();
}

/** `xxx by 作者` → 拆出作者（只在结尾、且作者部分不含括号时认） */
export function splitAuthor(rawBase) {
  const m = /^(.*?)\s+by\s+([^()（）]+)$/i.exec(String(rawBase).trim());
  if (!m) return { text: String(rawBase).trim(), author: "" };
  return { text: m[1].trim(), author: m[2].trim() };
}

/**
 * 只认「明显是切换键」的括号内容，避免把 `(長髮+胧嫣)` 这种名字当成热键。
 * 认得的有：含 ctrl/alt/shift/num/小键盘；或纯方向/数字/符号组合，如 `（890上下左右）`。
 */
const HOTKEY_HINT_RE = /ctrl|alt|shift|num|小键盘|切换/i;
const HOTKEY_SYMBOLS_RE = /^[0-9上下左右前后【】\[\]；;‘’。.、,，?？~\-=+*/\\\s]+$/;

export function extractHotkeys(text) {
  const s = String(text).trim();
  const m = /[(（]([^()（）]*)[)）]\s*$/.exec(s);
  if (!m) return { text: s, hotkeys: "" };
  const inner = m[1].trim();
  if (!inner) return { text: s, hotkeys: "" };
  if (HOTKEY_HINT_RE.test(inner) || HOTKEY_SYMBOLS_RE.test(inner)) {
    return { text: s.slice(0, m.index).trim(), hotkeys: inner };
  }
  return { text: s, hotkeys: "" };
}

/** 词表里 key 长的先替换，避免 `수정` 把 `찐막 수정` 拆坏 */
function sortedEntries(obj) {
  return Object.entries(obj).sort((a, b) => b[0].length - a[0].length);
}

/**
 * 原始名 → 建议名。
 *
 * @param {string} rawBase 不含扩展名的原始条目名（目录名或文件名）
 * @param {object} glossary data/glossary.json
 * @param {{author?:string, subcategory?:string}} [meta]
 * @returns {{characters:string[], name:string, hotkeys:string, author:string,
 *            leftover:string[], confidence:"high"|"low"}}
 */
export function translate(rawBase, glossary, meta = {}) {
  let { text, author } = splitAuthor(rawBase);
  if (!author && meta.author) author = String(meta.author).trim();

  const withHotkeys = extractHotkeys(text);
  text = withHotkeys.text;

  // 1) 角色：按在标题里出现的先后收集（同一角色只留一个）
  const hits = [];
  for (const [ko, zh] of Object.entries(glossary.characters ?? {})) {
    const idx = text.indexOf(ko);
    if (idx >= 0) hits.push({ ko, zh, idx });
  }
  hits.sort((a, b) => a.idx - b.idx);
  let characters = [...new Set(hits.map((h) => h.zh))];

  // 2) 文件名里没有角色时，用来源站的分类兜底（GameBanana 的 `Skins/Danjin`）
  if (!characters.length && meta.subcategory) {
    const mapped = glossary.categories?.[meta.subcategory];
    if (mapped) characters = [mapped];
  }

  // 2.5) 标题里直接出现英文角色名（GameBanana 的 UI/皮肤包很常见：
  //      `NSFW Jinhsi Ui`、`Cantarella Ui`）。categories 原本只做子分类精确匹配，
  //      这里补一个按整词扫描的兜底，否则这些包全被判成「认不出角色」。
  const nameHits = [];
  if (!characters.length) {
    for (const [en, zh] of sortedEntries(glossary.categories ?? {})) {
      if (!en || en.startsWith("_") || !zh) continue;
      const re = latinWordRe(en);
      const m = re.exec(text);
      if (m) nameHits.push({ en, zh, idx: m.index });
    }
    nameHits.sort((a, b) => a.idx - b.idx);
    characters = [...new Set(nameHits.map((h) => h.zh))];
  }

  // 2.6) 认不出角色、但一眼就是界面类 Mod（光标 / 背包 / 第一人称 / UI）：
  //      站内角色表里本来就有 `UI`，不要再拦成「不可应用」。
  if (!characters.length && UI_RE.test(text)) characters = ["UI"];

  // 3) 把角色词与常见皮肤词换成中文
  let rest = text;
  for (const h of hits) rest = rest.split(h.ko).join(" ");
  for (const h of nameHits) rest = rest.replace(latinWordRe(h.en), " ");
  for (const [ko, zh] of sortedEntries(glossary.words ?? {})) {
    rest = rest.split(ko).join(zh ? ` ${zh} ` : " ");
  }

  // 4) 收尾：去掉多余分隔符，保留括号里的内容（先把括号统一成全角，才好处理前面的空格）
  rest = canonicalParens(rest)
    .replace(/[,，、]/g, " ")
    .replace(/\bui\b/gi, "UI")
    .replace(/\s+/g, " ")
    // 全角括号前不留空格：`Longyan （長髮+胧嫣）` → `Longyan（長髮+胧嫣）`
    .replace(/\s+（/g, "（")
    .replace(/^[\s+·-]+|[\s+·-]+$/g, "")
    .trim();

  const leftover = (rest.match(/[가-힣]+/g) ?? []).filter(Boolean);

  return {
    characters,
    name: sanitizeName(canonicalParens(rest)),
    hotkeys: withHotkeys.hotkeys,
    author,
    leftover,
    confidence: leftover.length || !characters.length ? "low" : "high",
  };
}

/**
 * 组装站内规范名：`<角色>-<名称>（切换键）by <作者>`。
 * 版本号按 CLAUDE.md 的要求留在名称里（紧贴名称，在切换键与作者之前）。
 */
export function composeKey({ characters = [], name = "", hotkeys = "", author = "" }) {
  // 角色段也要 sanitize：站内特殊分类 `Other/Misc` 带半角斜杠，直接拼进文件名会被
  // journal 的 assertSafeName 拒掉（整批改名失败），Windows 本身也不允许。
  // 统一走 sanitizeName（`/` → 全角 `／`），读取侧由 daily-classify 的
  // `Other／Misc` 前缀规则还原成 `Other/Misc`，去重键不受影响。
  const chars = characters
    .map((c) => sanitizeName(c))
    .filter(Boolean)
    .join(",");
  const cleanName = sanitizeName(canonicalParens(name));
  const cleanHotkeys = sanitizeName(hotkeys).replace(/^（|）$/g, "");
  const cleanAuthor = sanitizeName(author).replace(/^by\s+/i, "");

  let key = chars && cleanName ? `${chars}-${cleanName}` : chars || cleanName;
  if (cleanHotkeys) key += `（${cleanHotkeys}）`;
  if (cleanAuthor) key += ` by ${cleanAuthor}`;
  return key.trim();
}

/**
 * 已经是站内规范名（`<角色>-…`）时，把各字段拆回来，方便在页面上微调。
 * 只在「原始名第一段就是库内角色」时调用 —— 由 server 用 resolveCharacterAndTitle 判定。
 */
export function splitExistingName(base, character) {
  const s = String(base).trim();
  let rest = s.startsWith(`${character}-`) ? s.slice(character.length + 1) : s;
  const withAuthor = splitAuthor(rest);
  const withHotkeys = extractHotkeys(withAuthor.text);
  return {
    characters: [character],
    name: sanitizeName(canonicalParens(withHotkeys.text)),
    hotkeys: withHotkeys.hotkeys,
    author: withAuthor.author,
    leftover: [],
    confidence: "high",
  };
}

/** 条目名是否是「非鸣潮」来源（终末地等），用于自动挪进 _Endfield */
export function looksLikeEndfield(rawBase, glossary) {
  const s = String(rawBase);
  return (glossary.endfieldMarkers ?? []).some((m) => s.includes(m));
}
