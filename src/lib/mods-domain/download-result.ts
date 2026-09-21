/**
 * 把 /api/mods/[id]/download 的响应翻译成前端该做的事。
 *
 * 为什么要单独抽出来：这是全站最容易「静默」的一处。原实现是
 *
 *   if (!response.ok || !result.ok || !result.downloadUrl) return;
 *
 * 失败时按钮转一圈就复原，不报错、不提示、不下载 —— 用户只会以为按钮坏了。
 * 2026-09-21 Supabase 网关被 restriction 期间，线上就是这个表现。
 *
 * 另一条约束来自 CLAUDE.md「错误信息不能暴露敏感信息」：服务端在网关被锁时会把
 * "Service for this project is restricted due to the following violations:
 *  exceed_egress_quota" 原样透出，所以这里一律映射成面向用户的话术，
 * 不把原始 message 交给界面。
 */

export type DownloadResolution =
  | { ok: true; url: string }
  | { ok: false; message: string };

/**
 * 直链不可用时的统一说法。
 *
 * 刻意把用户引到网盘链接上，而不是丢一句「失败」—— 本站 5186 条 mod 全部带
 * 网盘链接，且那条路径是纯浏览器剪贴板操作、不经过服务端，所以它几乎总是可用的。
 */
export const DIRECT_DOWNLOAD_UNAVAILABLE =
  "直链暂时不可用。请用下方的网盘链接 —— 复制后在对应客户端打开即可。";

/** 只放行 http/https，挡掉 javascript: 之类的伪协议（DB 里的 download_url 是外部输入）。 */
function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveDownloadResponse(httpStatus: number, payload: unknown): DownloadResolution {
  // 404 是唯一值得单独说的：这条 mod 真的没了，跟「服务暂时挂了」不是一回事
  if (httpStatus === 404) {
    return { ok: false, message: "这个 MOD 不存在或已下架。" };
  }

  const isSuccessStatus = httpStatus >= 200 && httpStatus < 300;
  if (isSuccessStatus && payload && typeof payload === "object") {
    const result = payload as { ok?: unknown; downloadUrl?: unknown };
    const url = typeof result.downloadUrl === "string" ? result.downloadUrl.trim() : "";

    if (result.ok === true && url && isSafeHttpUrl(url)) {
      return { ok: true, url };
    }
  }

  // 4xx/5xx、响应体不是对象、ok 不为 true、缺 downloadUrl、URL 不是 http(s) ——
  // 对用户而言都是同一件事：这次拿不到直链。不区分，避免泄露服务端细节。
  return { ok: false, message: DIRECT_DOWNLOAD_UNAVAILABLE };
}
