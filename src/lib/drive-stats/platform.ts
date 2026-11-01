/**
 * 网盘平台名归一化。
 *
 * `drive_links.platform` 是自由文本（「夸克」「夸克网盘」「Quark」「Xunlei」并存），
 * 若按原样做 key，同一个盘会被拆成多个统计桶，页面上看起来「夸克只有 3 次」。
 * 所有写入都必须先过这里。
 *
 * ⚠️ `deploy/hk-engagement/service.py` 的 `normalize_drive_platform` 必须与本文件
 * 逐条保持一致：两边规则不同 = 本地开发与线上统计口径不同。
 */

export const DRIVE_PLATFORM_MAX_LENGTH = 24;

const RULES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "夸克", pattern: /夸克|quark/i },
  { name: "迅雷", pattern: /迅雷|xunlei/i },
  { name: "百度网盘", pattern: /百度|baidu/i },
  { name: "阿里云盘", pattern: /阿里|aliyun|ali/i },
  { name: "蓝奏云", pattern: /蓝奏|lanzou/i },
  { name: "天翼云盘", pattern: /天翼|ctyun|189/i },
  { name: "115", pattern: /115|一二/i },
  { name: "移动云盘", pattern: /和彩|移动云|139/i },
  { name: "123云盘", pattern: /123|咪咕/i },
];

/**
 * 认不出的平台**保留原名**（去掉结尾「网盘」），而不是塞进「其他」：
 * 站长至少还能看到「某某盘被点了 N 次」，而不是一整块不可解释的「其他」。
 *
 * 返回空串 = 这行数据没有可用平台名，调用方应直接跳过（不计数、不建桶）。
 */
export function normalizeDrivePlatform(raw: string | null | undefined): string {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";

  for (const rule of RULES) {
    if (rule.pattern.test(value)) return rule.name;
  }

  const stripped = value.replace(/\s*网盘$/, "").trim();
  return (stripped || value).slice(0, DRIVE_PLATFORM_MAX_LENGTH);
}
