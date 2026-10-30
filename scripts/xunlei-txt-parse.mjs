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

/**
 * 把提取码拼进分享链接，变成**打开即自动填码**的形式：
 *   https://pan.xunlei.com/s/VP57…A1  + 3rhw
 *   → https://pan.xunlei.com/s/VP57…A1?pwd=3rhw#
 *
 * 为什么要拼：xlsx 导出表里的「分享链接」列本身就带 `?pwd=…`（迅雷「复制带提取码的链接」），
 * 库里 5000+ 条历史记录全是这个形态；只有手抄 txt 是「链接」和「提取码」分开两行。
 * 2026-10-29 那批 txt 直接写裸链接，前台点开还要手输提取码 —— 用户当天就发现了。
 * 2026-10-30 用无头 Chrome 验证过：带对的 pwd 能直接渲染出文件列表，
 * 不带或带错的 pwd 都停在「请输入提取码」。
 *
 * 已经是带 `?pwd=` 的链接原样返回（不重复拼、不覆盖导出表里的正式提取码）；
 * 非迅雷域名 / 提取码为空也原样返回，免得给脏数据拼出个假链接。
 */
export function withXunleiPwd(link, pwd) {
  const url = String(link ?? "").trim();
  const code = String(pwd ?? "").trim();
  if (!code || !/^https?:\/\/(?:[\w-]+\.)*xunlei\.com\/s\//i.test(url)) return url;
  const base = url.replace(/#+$/, "");
  if (/[?&]pwd=/i.test(base)) return url;
  return `${base}${base.includes("?") ? "&" : "?"}pwd=${encodeURIComponent(code)}#`;
}
