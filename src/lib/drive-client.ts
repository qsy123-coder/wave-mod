/**
 * 网盘分享链接 → 桌面客户端协议链接。
 *
 * 只做纯拼串（可在 node 环境里测，vitest 没有 jsdom）；真正去触发协议的那一步
 * 在 `drive-client-launch.ts`，属于 DOM 逻辑，分开放。
 *
 * 协议名与拼接格式是**在本机注册表里核对过的**（这台机器上夸克与迅雷都装了），不是抄来的：
 *   qklink  → "D:\Quark\quark.exe" "%1"                                 → qklink://<分享链接>
 *   thunder → "D:\Thunder\Program\Thunder.exe" "%1" -StartType:thunder  → thunder://base64("AA"+<分享链接>+"ZZ")
 *
 * 淘汰掉的候选：`qkclouddrive://save`（名字看着更像「弹转存框」），但它在本机注册表里
 * 根本没有，属于移动端方案，PC 上不能用。
 */

export type DriveClientKind = "quark" | "xunlei";

/**
 * 站内 drive_links.platform 是自由文本（「夸克」「夸克网盘」「Xunlei」都有），
 * 沿用 cloud-drive.ts / card-download-action.tsx 已有的宽松中英文匹配口径。
 *
 * 返回 null = 这个平台没有可用的桌面客户端，调用方据此**不要**唤起、
 * 也不要在文案里承诺会自动打开（编一个不存在的协议只会让浏览器弹「找不到应用」）。
 */
export function driveClientKind(platform: string): DriveClientKind | null {
  if (/夸克|quark/i.test(platform)) return "quark";
  if (/迅雷|xunlei/i.test(platform)) return "xunlei";
  return null;
}

/**
 * btoa 只吃 Latin1，遇到中文会直接抛 InvalidCharacterError。
 * 分享链接正常都是纯 ASCII，但 drive_links 的值是后台手填的，兜底先 percent-encode
 * 再还原成 Latin1 字符（同 protocol-launcher 的写法）。
 */
function base64(input: string): string {
  try {
    return btoa(input);
  } catch {
    return btoa(
      encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      ),
    );
  }
}

/**
 * 返回 null = 「该平台没有客户端」或「链接不像链接」，两种情况调用方都应跳过唤起。
 * 分享链接不是 http(s) 开头时直接拒绝，免得脏数据拼出个无意义的协议串。
 */
export function buildDriveClientUrl(platform: string, shareUrl: string): string | null {
  const kind = driveClientKind(platform);
  if (kind === null) return null;

  const url = shareUrl.trim();
  if (!/^https?:\/\//i.test(url)) return null;

  if (kind === "quark") {
    // ⚠️ 必须**去掉内层 scheme**，只给 host+path。
    //
    // 写成 `qklink://https://pan.quark.cn/…` 会被浏览器的 URL 解析毁掉：内层 `https:`
    // 被当作 host=`https` + 空端口，而序列化时空端口的冒号会被吃掉，真正交给系统的
    // 是 `qklink://https//pan.quark.cn/…`（少一个冒号）。夸克客户端再把 `qklink://`
    // 换成 `https://`，就成了 `https://https//pan.quark.cn/…` 这条打不开的死链。
    // 2026-09-28 真机上就是这么暴露的（headless 测试当时只断言了 getAttribute("src")
    // 这个原始串，没断言解析后的 iframe.src，所以没测出来）。
    //
    // 只给 host+path 时解析前后逐字符一致：
    //   new URL("qklink://pan.quark.cn/s/x").href === "qklink://pan.quark.cn/s/x"
    // 客户端补上 https:// 后正是能打开的那条链接。
    return `qklink://${url.replace(/^https?:\/\//i, "")}`;
  }

  // 迅雷的 base64 里不会有冒号（字母表 A-Za-z0-9+/=），所以没有上面那个空端口问题；
  // 含 "/" 时也只是落到 path 里，实测解析前后仍逐字符一致。
  return `thunder://${base64(`AA${url}ZZ`)}`;
}
