/**
 * 下载量的**展示口径**（只决定前台显示哪个数，不改变落库的计数）。
 *
 * 历史背景：
 *   - 2026-10-19 起，下载量的展示值是「当前浏览量 × 65% + 真实下载增量」
 *     （公式在 store-core.ts 的 `DOWNLOAD_RATIO_OF_VIEWS`）。这条规则是给**存量**
 *     mod 补一个合理历史基数用的。
 *   - 但它对新上传的 mod 等于凭空造数：刚发一天、几十次浏览就显示「几十次下载」，
 *     真实点击可能只有个位数。
 *
 * 用户 2026-10-22 要求：「每日发布的卡片，下载量基础应该不受百分比影响，从 0 开始。
 * 从今天的卡片开始从 0 开始计数，今天之前的不用管。以后发布的卡片也从 0 开始计数。」
 *
 * 因此按 mod 的 `createdAt`（发布日，上海时区）切一刀：
 *   - 早于 `DOWNLOAD_BASE_ZERO_SINCE`：沿用旧口径（65% + 真实下载），不回改历史显示；
 *   - 该日及以后：只显示真实下载增量，从 0 开始涨（对应 `EngagementCounts.downloadsReal`）。
 *
 * ⚠️ 这个日期是用户明确说的「今天」，**不要再往后平移** —— 平移会让已经按新口径
 * 涨起来的 mod 又突然套上 65%，等于把它们的下载量凭空抬高。
 *
 * 本模块保持**客户端可导入**（不带 server-only、不引 zod），因为选择展示值发生在
 * 详情抽屉这类 Client Component 里；计数本身（服务端）不感知这条规则。
 */

/** 分界日（上海日历日，含当天）。发布日期 >= 这天的 mod 用「从 0 起算」口径。 */
export const DOWNLOAD_BASE_ZERO_SINCE = "2026-10-22";

// 与 store-core.ts 的 shanghaiDayKey 同一口径（en-CA 输出 YYYY-MM-DD）。
// 这里不复用那个函数，是为了让本模块独立可导入，不把整个计数器逻辑带进客户端包。
const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 某时刻对应的上海日历日；缺失或解析不了返回 null */
export function shanghaiDateKeyOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return shanghaiDateFormatter.format(date);
}

/**
 * 这个 mod 的下载量是否「从 0 起算」。
 *
 * 解析不出日期时返回 false（按老 mod 处理）—— 宁可多显示一个基数，也不要因为
 * 一条脏 createdAt 把新 mod 的真实下载弄丢。
 */
export function isDownloadBaseFromZero(createdAt: string | Date | null | undefined): boolean {
  const day = shanghaiDateKeyOf(createdAt);
  return day !== null && day >= DOWNLOAD_BASE_ZERO_SINCE;
}
