/**
 * 官方唤取记录代理。
 *
 * 安全边界（重要）：
 *   - 用户输入的 URL 只用来**取参数**，出站地址永远是下面两个固定常量。
 *     即使有人粘贴 `https://evil.com/?player_id=1&record_id=...` 也不会产生任何
 *     对 evil.com 的请求，从根上避免 SSRF。
 *   - 不写数据库、不写文件、不打日志，`record_id` 只存在于本次请求的内存里。
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { dedupeRecords, normalizeApiRows } from "@/features/gacha/lib/normalize";
import { parseGachaLink } from "@/features/gacha/lib/parse-link";
import { POOL_TYPE_IDS } from "@/features/gacha/lib/pools";
import type { GachaRecord, ServerRegion } from "@/features/gacha/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CN_API_URL = "https://gmserver-api.aki-game2.com/gacha/record/query";
const GLOBAL_API_URL = "https://gmserver-api.aki-game2.net/gacha/record/query";

/**
 * 香港 nginx 的抓取代理。
 *
 * 2026-11-08 实测：官方接口对 Vercel 出口无响应（生产函数 25s 超时），
 * 同一请求从香港机 2.6s 就能拿到响应。配置了 GACHA_PROXY_URL 后，
 * 所有上游请求改走 `https://go.sunnyrose.xyz/__gacha/query*`，
 * 由 nginx 转发；key 用于挡住匿名调用。
 * 本地开发不配这两个变量，仍然直连官方接口。
 */
const PROXY_BASE = process.env.GACHA_PROXY_URL?.trim().replace(/\/+$/, "");
const PROXY_KEY = process.env.GACHA_PROXY_KEY?.trim();

function upstreamUrl(region: ServerRegion): string {
  if (!PROXY_BASE) return region === "cn" ? CN_API_URL : GLOBAL_API_URL;
  return `${PROXY_BASE}/__gacha/query${region === "global" ? "-global" : ""}`;
}

const POOL_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 25_000;
const CONCURRENCY = 4;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const requestSchema = z.object({
  url: z.string().trim().min(10).max(2048),
});

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

type UpstreamErrorCode = "expired_link" | "upstream_timeout" | "upstream_error";

class UpstreamError extends Error {
  constructor(
    readonly code: UpstreamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** 进程内滑动窗口。Vercel 多实例下是近似值，只用于挡住明显滥用 */
const rateLimitLog = new Map<string, number[]>();

function isRateLimited(key: string, now = Date.now()): boolean {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitLog.get(key) ?? []).filter((time) => time > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitLog.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  rateLimitLog.set(key, timestamps);

  // 简单清理，避免长期运行后 Map 无限增长
  if (rateLimitLog.size > 5_000) {
    for (const [entryKey, entry] of rateLimitLog) {
      if (entry.every((time) => time <= windowStart)) rateLimitLog.delete(entryKey);
    }
  }

  return false;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** 同时受「总预算」和「单池超时」约束的 AbortSignal */
function withTimeout(parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

type FetchPoolParams = {
  playerId: string;
  recordId: string;
  resourcesId: string;
  serverId: string;
  lang: string;
  region: ServerRegion;
};

async function fetchPool(
  params: FetchPoolParams,
  poolType: string,
  parentSignal: AbortSignal,
): Promise<GachaRecord[]> {
  const { signal, cleanup } = withTimeout(parentSignal, POOL_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // 官方页面自己带 UA，缺省 UA 容易被网关拒绝
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };
    if (PROXY_BASE && PROXY_KEY) headers["X-Wavemod-Key"] = PROXY_KEY;

    const response = await fetch(upstreamUrl(params.region), {
      method: "POST",
      headers,
      body: JSON.stringify({
        playerId: params.playerId,
        recordId: params.recordId,
        cardPoolId: params.resourcesId,
        serverId: params.serverId,
        languageCode: params.lang,
        cardPoolType: poolType,
      }),
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new UpstreamError("upstream_error", `HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      code?: number;
      message?: string;
      data?: unknown;
    };

    if (payload.code === -1) {
      throw new UpstreamError("expired_link", "链接已失效");
    }

    if (payload.code !== 0) {
      throw new UpstreamError("upstream_error", `接口返回 ${payload.code ?? "unknown"}`);
    }

    return normalizeApiRows(payload.data, poolType).records;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new UpstreamError("upstream_timeout", "上游超时");
    }
    throw new UpstreamError("upstream_error", "上游请求失败");
  } finally {
    cleanup();
  }
}

function jsonError(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status, headers: NO_STORE_HEADERS });
}

type PoolFetchResult =
  | { ok: true; poolType: string; records: GachaRecord[] }
  | { ok: false; poolType: string; error: { code: UpstreamErrorCode; message: string } };

export async function POST(request: NextRequest) {
  if (isRateLimited(clientKey(request))) {
    return jsonError("rate_limited", "请求太频繁，请 1 分钟后再试", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_link", "请求格式不正确", 400);
  }

  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError("invalid_link", "请粘贴完整的唤取记录链接", 400);
  }

  const parsedLink = parseGachaLink(parsedBody.data.url);
  if (!parsedLink.ok) {
    return jsonError("invalid_link", parsedLink.error, 400);
  }

  const params: FetchPoolParams = parsedLink.value;
  const totalController = new AbortController();
  const totalTimer = setTimeout(
    () => totalController.abort(new Error("timeout")),
    TOTAL_TIMEOUT_MS,
  );

  const failedPools: { poolType: string; message: string }[] = [];
  const collected: GachaRecord[] = [];
  let fatalExpired = false;
  let fatalTimeout = false;

  try {
    for (let start = 0; start < POOL_TYPE_IDS.length; start += CONCURRENCY) {
      const chunk = POOL_TYPE_IDS.slice(start, start + CONCURRENCY);

      const results = await Promise.all<PoolFetchResult>(
        chunk.map(async (poolType) => {
          try {
            return {
              ok: true as const,
              poolType,
              records: await fetchPool(params, poolType, totalController.signal),
            };
          } catch (error) {
            const code = error instanceof UpstreamError ? error.code : "upstream_error";
            return {
              ok: false as const,
              poolType,
              error: { code, message: error instanceof Error ? error.message : "未知错误" },
            };
          }
        }),
      );

      for (const result of results) {
        if (result.ok) {
          collected.push(...result.records);
          continue;
        }

        // 链接失效对所有池都一样，没必要继续烧请求
        if (result.error.code === "expired_link") fatalExpired = true;
        if (result.error.code === "upstream_timeout") fatalTimeout = true;
        failedPools.push({ poolType: result.poolType, message: result.error.message });
      }

      if (fatalExpired) break;
    }
  } finally {
    clearTimeout(totalTimer);
  }

  if (fatalExpired) {
    return jsonError(
      "expired_link",
      "链接已失效（约 1 小时有效），请重新从游戏内复制唤取记录链接",
      422,
    );
  }

  if (collected.length === 0 && failedPools.length > 0) {
    return jsonError(
      fatalTimeout ? "upstream_timeout" : "upstream_error",
      fatalTimeout ? "官方接口响应超时，请稍后重试" : "官方接口暂时不可用，请稍后重试",
      502,
    );
  }

  const records = dedupeRecords(collected);

  return NextResponse.json(
    {
      uid: params.playerId,
      region: params.region,
      fetchedAt: new Date().toISOString(),
      records,
      failedPools,
    },
    { headers: NO_STORE_HEADERS },
  );
}
