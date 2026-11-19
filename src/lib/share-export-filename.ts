/**
 * 分享图导出 / 批量打包的文件名处理。
 *
 * zip 内每个条目用 `<character>-<title>` 命名，标题可能带 Windows 非法字符
 * （`/ : * ? " < > |` 和结尾的点/空格、控制字符），直接写进 zip 在部分
 * 解压工具上会出错或串目录。这里统一替换并保证非空 —— 纯函数，方便单测。
 */

// Windows 文件/目录名非法字符 + 路径分隔符，统一换成下划线
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

// 控制字符（含 NUL、换行等）直接删掉
const CONTROL_CHARS = /[\u0000-\u001f]/g;

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(INVALID_FILENAME_CHARS, "_")
    .replace(CONTROL_CHARS, "")
    // 结尾的点/空格是 Windows 非法（会静默去掉导致重名/错位），一并移除
    .replace(/[. ]+$/g, "")
    .trim();

  return cleaned || "mod";
}

/**
 * 日期键 `YYYY-MM-DD`（Asia/Shanghai）→ zip 文件名 `每日更新-YYYY.M.D.zip`。
 */
export function buildZipFileName(dateKey: string): string {
  const dotted = dateKey.replace(/-/g, ".");
  return `每日更新-${dotted}.zip`;
}
