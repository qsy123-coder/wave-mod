/**
 * 汉字 → 拼音首字母（零依赖）。
 *
 * 原理：Node 自带完整 ICU，`Intl.Collator("zh-Hans-u-co-pinyin")` 会把汉字按拼音排序。
 * 为每个声母准备一个「该声母下拼音最小的汉字」当边界，目标字落在哪个区间就取哪个声母。
 * 这比维护一张几千字的映射表小得多，也不会因为新增生僻字就整段失效。
 *
 * 局限：ICU 没有拼音数据的极少数扩充区汉字会返回空串，调用方应回退成 `_`。
 * 多音字按 ICU 的默认读音处理 —— 防和谐用途下不需要区分。
 */

// 顺序必须按拼音升序；新增声母时要同时调整位置。
const BOUNDARIES = [
  ["a", "阿"],
  ["b", "八"],
  ["c", "擦"],
  ["d", "搭"],
  ["e", "婀"],
  ["f", "发"],
  ["g", "嘎"],
  ["h", "哈"],
  ["j", "击"],
  ["k", "咖"],
  ["l", "拉"],
  ["m", "妈"],
  ["n", "拿"],
  ["o", "噢"],
  ["p", "趴"],
  ["q", "七"],
  ["r", "然"],
  ["s", "撒"],
  ["t", "他"],
  ["w", "挖"],
  ["x", "夕"],
  ["y", "丫"],
  ["z", "匝"],
];

const collator = new Intl.Collator("zh-Hans-u-co-pinyin");

/** 统一汉字范围：基本区 + 扩展 A。扩展 B 及以后大概率不被 ICU 收录。 */
export const CJK_RE = /[㐀-鿿]/;

export function initialOf(char) {
  let result = "";
  for (const [letter, boundary] of BOUNDARIES) {
    if (collator.compare(char, boundary) >= 0) result = letter;
    else break;
  }
  return result;
}

/** 只转换汉字，其它字符（英文、数字、标点、空格）原样保留。 */
export function toPinyinInitials(name) {
  return [...name]
    .map((char) => (CJK_RE.test(char) ? initialOf(char) || "_" : char))
    .join("");
}
