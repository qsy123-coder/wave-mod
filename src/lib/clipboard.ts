/**
 * 复制到剪贴板。
 *
 * 优先 navigator.clipboard，失败降级 execCommand —— 非安全上下文（http 调试、
 * 部分内嵌 WebView）下 navigator.clipboard 是 undefined，不降级就等于「点了没反应」。
 *
 * 网盘链接一律走复制而不是直接跳转：夸克/迅雷的分享页在浏览器里打开会限速、
 * 反复要求登录，客户端粘贴转存才是正常路径。所以这里的返回值必须被检查 ——
 * 复制失败要给出说法，不能静默。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 忽略，走降级 */
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}
