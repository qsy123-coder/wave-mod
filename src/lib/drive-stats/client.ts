import { getDeviceId } from "@/lib/engagement/device";
import { NOCOUNT_COOKIE } from "@/lib/visits/constants";

/**
 * 网盘点击打点（浏览器侧）。
 *
 * 三条硬规则，与站点访问打点一致：
 *   1. **失败静默** —— 计数挂了绝不能影响复制/跳转。
 *   2. **站长设备不计数** —— 打开过 `/visits` 的浏览器带 nocount，直接跳过。
 *   3. **本会话同平台只报一次** —— 服务端本来就按「设备 × 天 × 平台」去重，
 *      这里再挡一层，避免连点把写盘请求打爆。
 *
 * 注意：去重**不含 mod**。同一个人当天在多个 mod 上点夸克，只算 1 次。
 */

const reported = new Set<string>();

export function reportDriveClick(platform: string): void {
  if (typeof window === "undefined") return;

  const value = platform.trim();
  if (!value || reported.has(value)) return;

  // 站长设备：cookie 是普通 cookie（非 httpOnly），这里读得到
  if (document.cookie.split(";").some((part) => part.trim() === `${NOCOUNT_COOKIE}=1`)) return;

  const deviceId = getDeviceId();
  if (!deviceId) return;

  reported.add(value);

  void fetch("/api/drive-click", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": deviceId },
    body: JSON.stringify({ platform: value }),
    keepalive: true,
  }).catch(() => {
    // 断网、被拦截、页面正在卸载：都不重要，丢掉这次打点
  });
}
