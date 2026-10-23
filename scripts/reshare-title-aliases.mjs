/**
 * 重分享分享名 → 库内 title 的别名表。
 *
 * 背景：同一批 mod 被重新打包分享时，分享名会换个写法。库里 2026-08-10 那批
 * 珂莱塔 mod 的 title 是「名称 by 作者（切换键切换）」，2026-10-23 重分享后
 * 分享名变成「珂莱塔-名称（切换键）by 作者」。
 *
 * 差一个前缀、作者和括注换个位置，`character|title` 去重键就不等了，后果是**静默**的：
 *   · upload-daily-by-date.mjs 把老的 5 条当新增，全量重跑会再插一遍；
 *   · update-drive-links-from-reshare.mjs 按 title 逐字匹配，5 条全部匹配不上 ⇒
 *     前台继续挂着已过期的旧网盘链接，链接挂死但页面照常打开。
 *
 * 为什么不做模糊匹配：归一化猜测（剥前缀、抽作者、重排括注）一旦猜错，就会把
 * 链接挂到别的 mod 上 —— 那比匹配不上更难发现。所以显式登记，一条一行。
 * 新增条目时**必须**先确认库内确实存在该 title（见 README 的「重分享」流程）。
 *
 * 抽成无副作用纯模块，交给 reshare-title-aliases.test.mjs 锁住。
 */

/** @type {Map<string, { character: string, title: string }>} */
export const RESHARE_ALIASES = new Map([
  // 珂莱塔 2026-08-10 批次（重分享于 2026-10-23）
  ["珂莱塔-罪恶之夏（890）by woju", { character: "珂莱塔", title: "罪恶之夏 by woju（890切换）" }],
  ["珂莱塔-花阴（890】）by woju", { character: "珂莱塔", title: "花阴 by woju（890】切换）" }],
  ["珂莱塔-洁塔薇（0）by Actice", { character: "珂莱塔", title: "洁塔薇 by Actice（0切换）" }],
  ["珂莱塔-缪泽(左右）by 阿鲁提亚", { character: "珂莱塔", title: "缪泽 by 阿鲁提亚" }],
  [
    "珂莱塔-吸血鬼-白-斑点袜（上下左右）og 狩野樱",
    { character: "珂莱塔", title: "吸血鬼-白-斑点袜 og 狩野樱（上下左右切换）" },
  ],
]);

/** key 命中别名表时返回 `{ character, title }`，否则返回 `null`（不抛错）。 */
export function resolveReshareAlias(key) {
  return RESHARE_ALIASES.get(String(key ?? "").trim()) ?? null;
}
