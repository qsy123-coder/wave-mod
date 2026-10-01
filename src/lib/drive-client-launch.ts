import { buildDriveClientUrl, driveClientKind } from "./drive-client";

/**
 * 尽力唤起网盘桌面客户端，去读剪贴板里刚复制的那条链接。
 *
 * ⚠️ 浏览器给不了的两件事，这里已按「拿不到就算了」处理：
 *
 * 1. **探测不了客户端在不在运行** —— 需求原话是「没打开才打开」，但网页里没有任何 API
 *    能知道某个本地程序是否在跑（公网上 localhost 探测会被 Private Network Access 拦掉，
 *    实测过）。退而求其次：**本会话内一个网盘只唤起一次**（见下面的「唤起记忆」+ `launchMemoryKey`）。
 *    用户反馈过「每点一次就把客户端切到前台」很烦；按网盘去重意味着不管点多少个 mod，
 *    夸克只被拉起来一次，之后只复制链接。
 *
 * 2. **拿不到成败回执** —— 没装客户端时各浏览器行为还不一致（Chrome 多半静默，
 *    Firefox 可能弹「不受支持的协议」）。所以这里是**静默**的：不报错、不弹提示。
 *    复制是主路径，唤起只是顺手。
 *
 * ⚠️ 「客户端有没有真的被拉起来」「确认框有没有被跳过」只能在真机上验证 ——
 *    headless 浏览器没有协议处理器。但**发起唤起的方式**（顶层导航还是隐藏 iframe）
 *    是可以用桩单测锁住的，见 drive-client-launch.test.ts；那正是上一版出事的地方。
 */

const LAUNCH_MEMORY_KEY = "wavemod:drive-client-launched";

/**
 * 记多少条。按网盘去重后现实里最多也就两三条，这里给足余量即可 ——
 * 设上限只是为了别让 sessionStorage 被无限写大。
 */
export const LAUNCH_MEMORY_LIMIT = 50;

/** 够用的最小存储接口：抽成这样是为了能在 node 环境（vitest 没有 jsdom）里测去重逻辑 */
export type LaunchMemoryStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * 「已经唤起过」的记账单位是**网盘种类**，不是链接。
 *
 * 刻意不看 URL：同一个夸克网盘在站内有好几千条链接，按链接记账等于每换一个 mod 就把客户端
 * 再切到前台一次 —— 那正是用户反对的。按网盘记账才是「这个会话里已经把它叫起来过」。
 *
 * @returns 该平台没有桌面客户端时返回 null（这类平台压根不会进记账表）
 */
export function launchMemoryKey(platform: string): string | null {
  return driveClientKind(platform);
}

function parseLaunched(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    // 存储被写脏了也不能把唤起整个卡死
    return [];
  }
}

/** 这个键本会话是不是已经记过了。存储不可用时一律返回 false（宁可多唤起，不可永不唤起） */
export function hasLaunched(storage: LaunchMemoryStorage | null, key: string): boolean {
  if (!storage) return false;
  try {
    return parseLaunched(storage.getItem(LAUNCH_MEMORY_KEY)).includes(key);
  } catch {
    return false;
  }
}

/**
 * 记下这个键已唤起。重复记同一个键只占一格 —— 否则它会被自己挤出上限，
 * 结果是被反复唤起（正是这个功能要避免的）。
 */
export function rememberLaunched(storage: LaunchMemoryStorage | null, key: string): void {
  if (!storage) return;
  try {
    const seen = parseLaunched(storage.getItem(LAUNCH_MEMORY_KEY)).filter((item) => item !== key);
    seen.push(key);
    storage.setItem(LAUNCH_MEMORY_KEY, JSON.stringify(seen.slice(-LAUNCH_MEMORY_LIMIT)));
  } catch {
    // 写不进去就退化成本次会话不去重，不影响唤起本身
  }
}

/** 隐私模式/禁用存储时访问 sessionStorage 会抛，所以每次现取并兜住 */
function safeSessionStorage(): LaunchMemoryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 唤起客户端。
 *
 * @returns 这一次**是否真的发起了唤起**。调用方要据此决定提示文案：
 *   返回 false 时客户端并没有被拉起来，文案就不能说「正在尝试打开」。
 */
export function launchDriveClient(platform: string, shareUrl: string): boolean {
  if (typeof window === "undefined") return false;

  // 两道门槛顺序有讲究：先问「这个平台有没有桌面客户端」，再问「这条链接能不能拼成深链」。
  // 今天后者为 null 时前者必然也是 null，但两句话是两件事（没客户端 / 链接是脏数据），
  // 分开写既说清了原因，也让 memoryKey 自然收窄成 string。
  const memoryKey = launchMemoryKey(platform);
  if (memoryKey === null) return false;

  const clientUrl = buildDriveClientUrl(platform, shareUrl);
  if (clientUrl === null) return false;

  const storage = safeSessionStorage();
  if (hasLaunched(storage, memoryKey)) return false;

  // ⚠️ 必须用**顶层导航**，不要用隐藏 iframe。
  //
  // Chrome 的「始终允许 <站点> 在此类链接中打开关联的应用」**只对顶层导航生效**。
  // 子框架里发起的 `qklink://` / `thunder://` 每次都会重新弹确认框 —— 用户勾了
  // 「始终允许」也不作数，表现就是「每次进站都得再同意一遍」（2026-10-02 用户反馈）。
  //
  // 这条是替换掉原先的隐藏 iframe 方案的。当初选 iframe 的理由是「顶层导航遇到
  // 未注册协议时可能弹找不到应用提示页、甚至离开当前页」；但真机上 Chrome / Firefox
  // 对未注册协议都是**弹框后留在原页**、不留历史记录，而 iframe 的代价是让「始终允许」
  // 彻底失效 —— 明显更糟。这个函数本来就被包在用户点击里，手势条件成立。
  //
  // 先记账再导航：顶层导航一旦被浏览器/系统接管，它后面的代码不保证还会执行。
  rememberLaunched(storage, memoryKey);
  window.location.href = clientUrl;

  return true;
}
