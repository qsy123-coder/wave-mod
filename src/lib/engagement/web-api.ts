import "server-only";

import { deviceIdSchema, engagementIdsSchema, engagementWriteSchema } from "./schemas";
import type { EngagementAction, EngagementReadResult } from "./types";

/**
 * `/api/engagement` 的**浏览器协议层**：校验入参、决定状态码与响应体。
 *
 * 抽出来是因为现在有两个宿主都要跑它：
 *   - Next 的 `src/app/api/engagement/route.ts`（Vercel）
 *   - 香港机上的边缘服务 `deploy/hk-edge-api/server.ts`（见 2026-10-29 额度治理）
 * 两边共用这一份，避免「校验规则改了一处、另一处还放行」这种漂移。
 *
 * 落点（哪个 store）由宿主注入 —— Next 注入全量分派（remote/supabase/cos/本地文件），
 * 香港那台只注入 remote（它本来就是 remote 的对端，没必要再把 supabase/COS 打进去）。
 */

export type EngagementApiStore = {
  read(ids: string[], deviceId: string): Promise<EngagementReadResult>;
  write(modId: string, action: EngagementAction, deviceId: string): Promise<EngagementReadResult>;
};

/** 与 HTTP 框架无关的响应描述，由宿主各自翻译成 NextResponse / node res */
export type ApiResult = {
  status: number;
  /** 有值就按 JSON 返回；null 表示空响应体（204） */
  json: unknown;
};

/**
 * 爬虫不计浏览/访问，否则数字会被抓取流量抬穿。
 *
 * 与 `/api/mods/[id]/view` 同一条规则；`/api/visits` 也用它（见 visits/web-api.ts）。
 */
export function isCountableUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  return !ua.includes("bot") && !ua.includes("spider") && !ua.includes("crawler");
}

/** 只认合法的匿名设备号；缺了或不合法一律当「无设备号」 */
export function readDeviceId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = deviceIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** `GET /api/engagement?ids=a,b` */
export async function handleEngagementGet(
  store: EngagementApiStore,
  idsRaw: string | null,
  deviceIdRaw: string | null,
): Promise<ApiResult> {
  const parsedIds = engagementIdsSchema.safeParse(idsRaw ?? "");

  if (!parsedIds.success) {
    return {
      status: 400,
      json: { error: parsedIds.error.issues[0]?.message ?? "参数无效。" },
    };
  }

  const deviceId = readDeviceId(deviceIdRaw) ?? "";
  const { counts, mine, degraded } = await store.read(parsedIds.data, deviceId);

  // degraded：本次是基线兜底。前端据此保留首屏快照值，不能拿 0 覆盖。
  return { status: 200, json: { counts, mine, degraded: Boolean(degraded) } };
}

/** `POST /api/engagement`，body `{ modId, action }` */
export async function handleEngagementPost(
  store: EngagementApiStore,
  bodyRaw: unknown,
  deviceIdRaw: string | null,
  userAgent: string | null,
): Promise<ApiResult> {
  const parsed = engagementWriteSchema.safeParse(bodyRaw);

  if (!parsed.success) {
    return { status: 400, json: { error: parsed.error.issues[0]?.message ?? "参数无效。" } };
  }

  // 写入必须有设备号：没有它就没法去重，放行等于开了一个「无限 +1」的放大器
  const deviceId = readDeviceId(deviceIdRaw);

  if (!deviceId) {
    return { status: 400, json: { error: "缺少合法的设备标识。" } };
  }

  if (parsed.data.action === "view" && !isCountableUserAgent(userAgent)) {
    return { status: 200, json: { skipped: true } };
  }

  const result = await store.write(parsed.data.modId, parsed.data.action, deviceId);

  return { status: 200, json: result };
}
