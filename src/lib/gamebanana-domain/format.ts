/**
 * 领域取值的展示格式化。**纯函数**，服务端页面与客户端抽屉共用同一份 ——
 * 同一件作品在「整页看」与「抽屉里看」必须显示成同一个字符串，两处各写一遍
 * 必然在某次改动后分叉（比如这边改成 MB 保留两位、那边还是一位）。
 */

/**
 * 字节 → 人看的串。拿不到（`null`）或非正数返回 `null`，由调用方决定「不显示这一项」。
 *
 * 三档就够：GameBanana 的文件从几 KB 到几百 MB，没有出现 GB 量级；
 * 真出现了也只是显示成偏大的 MB，不会错。
 */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
