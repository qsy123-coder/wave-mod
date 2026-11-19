/**
 * 浏览器端把 Blob / data URL 触发为一次下载。
 *
 * 单张分享图（data URL）与每日更新批量 zip（Blob）共用，避免各处手写
 * `<a download>` 的重复逻辑。挂到 body 再 click 是为了兼容 Safari：
 * 脱离文档的 anchor.click() 在部分 iOS 上不触发下载。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  // 触发下载后立即 revoke 即可；Safari 对 revoke 的时机比其它浏览器敏感，
  // 这里用 setTimeout 延后一拍，避免极慢磁盘上「还没写就被回收」。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  downloadUrl(dataUrl, filename);
}

function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
