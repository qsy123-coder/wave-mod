/**
 * 图片加载失败后的重试参数。
 *
 * 卡片图走 CDN（`cdn.sunnyrose.xyz`）时，边缘节点在「对象刚上传/被覆盖」的短窗口里
 * 可能先命中一次失败；同 URL 的失败结果会被浏览器/CDN 记住，单纯重设 `src` 拿不到新
 * 结果，所以每次重试都要换一个查询串。
 *
 * 为什么单独抽成纯函数：`srcSet` 里一条候选是「URL + 描述符」（`... 320w`），直接把
 * 参数拼到整个字符串尾部会把描述符写成 `1000w&_retry=...` —— 这是非法描述符，浏览器
 * 会**整条**丢弃 srcSet，重试就永远落在旧缓存上。所以必须逐条加到 URL 上。
 */

/** 给单个图片 URL 追加 `_retry` 参数；已有同名参数会被替换，保证幂等。 */
export function appendImageRetryParam(url: string, token: number | string): string {
  if (!url) return url;

  const cleaned = url
    .replace(/([?&])_retry=[^&]*/g, "$1")
    .replace(/[?&]$/, "");
  const separator = cleaned.includes("?") ? "&" : "?";

  return `${cleaned}${separator}_retry=${token}`;
}

/** 给 `srcset` 的每一条候选 URL 追加 `_retry` 参数，描述符（`320w`）保持原样。 */
export function appendImageRetryParamToSrcSet(srcSet: string, token: number | string): string {
  return srcSet
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return "";
      // 第一条空白之前是 URL；后面是 `320w` 之类的描述符
      return trimmed.replace(/^\S+/, (url) => appendImageRetryParam(url, token));
    })
    .filter(Boolean)
    .join(", ");
}
