/**
 * 解析「手抄版」迅雷分享记录 txt。
 *
 * 迅雷网盘的正规导出是 `分享结果导出-*.xlsx`（表头：创建分享状态 / 分享名 / 分享链接 /
 * 提取码 / 分享时间），主上传脚本靠 `parse-daily-xunlei-xlsx.ps1` 读它。但有时当天的导出
 * 只有一份纯文本（2026-10-29 那批就是），格式是迅雷 App「复制分享」原样粘出来的：
 *
 *   分享文件：锁暝-虚假希望（【】）.exe
 *   链接：https://pan.xunlei.com/s/VP57Z3dR67IWEBi0txIibs4kA1
 *   提取码：3rhw
 *   复制这段内容后打开手机迅雷App，查看更方便
 *
 * 只认 xlsx 会让整批迅雷**静默漏掉**（入库不报错、前台卡片只是没有迅雷按钮），
 * 所以这里补一条纯文本解析路径。保持成独立纯模块（无 IO、无依赖），便于单测。
 */

/** 分享记录块：分享文件 → 链接 → 提取码，三行紧挨着 */
const BLOCK_RE = /分享文件[：:][ \t]*(.+?)[ \t]*\r?\n链接[：:][ \t]*(\S+)[ \t]*\r?\n提取码[：:][ \t]*(\S+)/g;

/**
 * @param {string} text 迅雷分享记录的原始文本（UTF-8）
 * @returns {{ name: string, link: string, pwd: string }[]} name 已去掉末尾 `.exe`
 */
export function parseXunleiTxt(text) {
  const out = [];
  if (typeof text !== "string" || !text.includes("分享文件")) return out;
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(text))) {
    const name = m[1].replace(/\.exe$/i, "").trim();
    const link = m[2].trim();
    // 表头/说明文字里的「链接：无」之类直接丢弃
    if (!name || !/^https?:\/\//i.test(link)) continue;
    out.push({ name, link, pwd: m[3].trim() });
  }
  return out;
}
