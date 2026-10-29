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

/**
 * 同步复制：textarea + execCommand。
 *
 * 单独抽出来是给「复制 + 紧接着打开新页面」用的（手机端网盘按钮）：
 * `navigator.clipboard.writeText` 是异步的，而 `<a target="_blank">` 一跳转，
 * 新标签页就把焦点抢走，Chromium 会以 NotAllowedError 拒绝这次写入 ——
 * 无头实测就是这么失败的。execCommand 在点击手势里同步完成，跳转之前就落盘。
 */
function copyWithTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  // readonly：iOS 上聚焦可编辑元素会弹键盘、把页面顶上去
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  // 移出视口而不是 opacity:0 留在左上角：后者在 iOS 上会带出一次滚动
  textarea.style.top = "-9999px";
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

/**
 * 同步复制。返回 false 表示浏览器拒绝了这次复制（调用方必须如实告诉用户）。
 *
 * 只用于「复制完马上就要离开本页」的场景，例如手机端点网盘按钮：
 * 那时没有机会等异步 API，也等不来第二次用户手势。
 */
export function copyToClipboardSync(text: string): boolean {
  return copyWithTextarea(text);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 忽略，走降级 */
  }

  return copyWithTextarea(text);
}
