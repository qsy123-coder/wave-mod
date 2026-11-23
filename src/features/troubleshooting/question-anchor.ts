/**
 * 问题解答页的分享锚点工具。
 *
 * 每条 Q&A 的 id 形如 "Q37"，页面锚点统一用小写 "#q37"，
 * 这样复制出来的链接短、可读，且不受大小写影响。
 */

/** Q&A id（"Q37"）→ URL hash（"#q37"） */
export function questionHash(id: string): string {
  return `#${id.trim().toLowerCase()}`;
}

/** URL hash（"#q37" / "#Q37"）→ Q&A id（"Q37"）；不是合法锚点时返回 null */
export function parseQuestionHash(hash: string): string | null {
  const match = /^#q(\d+)$/i.exec(hash.trim());
  return match ? `Q${match[1]}` : null;
}

/** 某条 Q&A 在当前页面下的完整分享链接 */
export function buildQuestionShareUrl(origin: string, pathname: string, id: string): string {
  return `${origin}${pathname}${questionHash(id)}`;
}
