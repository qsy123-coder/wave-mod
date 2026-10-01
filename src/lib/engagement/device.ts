const DEVICE_ID_KEY = "wavemod-device-id";

/**
 * 匿名设备号：本站唯一的互动去重键，**不携带任何身份信息**。
 *
 * 为什么不用 IP：同一 WiFi 下的多个真实用户会互相顶掉；
 * 而且 IP 在代理/移动网络下抖动大，去重结果不稳定。
 *
 * localStorage 不可用时（无痕模式、存储被禁用）退化成**本会话内存值**：
 * 交互照常能用，只是关掉标签页后去重记忆会丢。宁可用着不完美，也不要弹窗报错。
 */
let memoryFallback: string | null = null;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  if (memoryFallback) return memoryFallback;

  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      memoryFallback = stored;
      return stored;
    }

    const created = createId();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    memoryFallback = created;
    return created;
  } catch {
    memoryFallback = createId();
    return memoryFallback;
  }
}
