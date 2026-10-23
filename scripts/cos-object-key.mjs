/**
 * 从 COS 公开 URL 反推对象键的纯逻辑。
 *
 * 抽成模块的原因：覆盖脚本（overwrite-cos-image.mjs）要靠它**不查库**定位对象，
 * 而这里一旦算错，后果是「静默覆盖了另一个对象」或「传上去但没人读它」——两种都不会报错。
 * 所以判定规则必须有单测钉住（见 cos-object-key.test.mjs）。
 */

/**
 * 判断是不是本桶的裸对象地址（必须同时满足：https + 精确的 bucket.cos.*.myqcloud.com 主机前缀）。
 *
 * 用 startsWith 逐字比对而不是 includes(".cos.")：后者会把
 * `https://evil.example/?x=.cos.&y=.myqcloud.com/` 之类的东西也放进来。
 */
export function isCosBucketUrl(url, bucket) {
  if (typeof url !== "string" || !bucket) return false;
  const host = `https://${bucket.trim()}.cos.`;
  if (!url.startsWith(host)) return false;
  // 主机段必须以 .myqcloud.com 结束，即 https://{bucket}.cos.{region}.myqcloud.com/{key}
  const rest = url.slice(host.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return false;
  return rest.slice(0, slash).endsWith(".myqcloud.com");
}

/**
 * 从 URL 反推对象键；不是本桶的裸对象地址一律返回 null。
 *
 * 为什么要拒绝带查询串的地址：站点渲染层会给图片拼 `?imageMogr2/thumbnail/...`
 * （src/lib/cos/shared.ts），那不是对象键的一部分；拿它去 putObject 会造出一个
 * 名字里带 `?` 的对象，前台照样读旧图。
 *
 * 中文键在浏览器地址栏里通常是百分号编码的，而 COS 里存的是 UTF-8 原文
 * （见 cos-utf8-key-slow-object），所以要 decodeURIComponent 还原。
 */
export function parseCosObjectKey(url, bucket) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return null;
  if (!isCosBucketUrl(trimmed, bucket)) return null;

  const slash = trimmed.indexOf("/", `https://${bucket.trim()}.cos.`.length);
  if (slash < 0) return null;

  const rawKey = trimmed.slice(slash + 1);
  if (!rawKey || rawKey.includes("?") || rawKey.includes("#")) return null;

  let key;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    // 非法的百分号序列 —— 宁可拒绝，也不要传一个半解码的键
    return null;
  }
  if (!key || key.endsWith("/")) return null;
  return key;
}

/** 覆盖前只允许这些扩展名，避免把 HTML/JSON 之类的对象换掉 */
export const IMAGE_KEY_EXTS = [".webp", ".png", ".jpg", ".jpeg", ".gif"];

export function isImageObjectKey(key) {
  if (typeof key !== "string") return false;
  const lower = key.toLowerCase();
  return IMAGE_KEY_EXTS.some((ext) => lower.endsWith(ext));
}

/**
 * 按对象键的扩展名决定输出编码，而不是一律写 webp。
 * 键是 .png 却塞 webp 字节，Content-Type 与扩展名对不上，后续任何按扩展名处理的链路都会踩坑。
 */
export function encodeFormatForKey(key) {
  const lower = String(key ?? "").toLowerCase();
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
  return "webp";
}

export function contentTypeForFormat(format) {
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  return "image/webp";
}

/**
 * 命令行参数里能不能安全出现这些字符。
 * PowerShell 5.1 下中文参数会被按 ANSI 代码页改写（见 powershell-ansi-encoding-traps），
 * 所以非 ASCII 一律劝用户改用 --url-file。
 */
export function isAsciiOnly(value) {
  return typeof value === "string" && /^[\x20-\x7E]*$/.test(value);
}
