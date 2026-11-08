import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "./route";

/**
 * 路由层测试重点不是「能不能拿到数据」，而是三条安全/降级边界：
 *   1. 用户给的域名绝不会被请求（SSRF）
 *   2. 单个卡池失败不拖垮整页
 *   3. 链接失效时立刻 422，不继续烧上游请求
 */

const VALID_URL =
  "https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?player_id=123456789&record_id=0123456789abcdef0123456789abcdef&resources_id=pool&svr_id=svr&lang=zh-Hans";

function makeRequest(body: unknown, ip = "10.0.0.1") {
  return new NextRequest("http://localhost/api/gacha/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function apiResponse(data: unknown, code = 0) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ code, message: code === 0 ? "success" : "error", data }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/gacha/fetch", () => {
  it("只请求固定官方域名，不会请求用户输入的 host", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return apiResponse([]);
      }),
    );

    const response = await POST(
      makeRequest(
        {
          url: "https://evil.example.com/steal?player_id=123456789&record_id=0123456789abcdef0123456789abcdef",
        },
        "10.0.0.2",
      ),
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(13);
    expect(calls.every((url) => url.startsWith("https://gmserver-api.aki-game2.com/"))).toBe(true);
    expect(calls.some((url) => url.includes("evil.example.com"))).toBe(false);
  });

  it("单个卡池失败时其余结果照常返回", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { cardPoolType?: string };
        if (body.cardPoolType === "2") {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return apiResponse([
          {
            cardPoolType: "角色精准调谐",
            resourceId: 1001,
            qualityLevel: 5,
            resourceType: "角色",
            name: "测试角色",
            time: "2026-01-01 12:00:00",
          },
        ]);
      }),
    );

    const response = await POST(makeRequest({ url: VALID_URL }, "10.0.0.3"));
    const body = (await response.json()) as {
      failedPools: { poolType: string }[];
      records: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.failedPools.map((pool) => pool.poolType)).toContain("2");
    expect(body.records.length).toBeGreaterThan(0);
  });

  it("链接失效（code -1）返回 422 并停止后续请求", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return apiResponse(null, -1);
      }),
    );

    const response = await POST(makeRequest({ url: VALID_URL }, "10.0.0.4"));

    expect(response.status).toBe(422);
    // 第一批 4 个并发请求之后就应该短路，而不是跑满 13 个
    expect(calls.length).toBe(4);
  });

  it("缺少参数返回 400 且不请求上游", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      makeRequest({ url: "https://aki-gm-resources.aki-game.com/x#/record?player_id=1" }, "10.0.0.5"),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("同一 IP 超过 10 次/分钟返回 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => apiResponse([])),
    );

    const ip = "10.9.9.9";
    for (let i = 0; i < 10; i++) {
      const ok = await POST(makeRequest({ url: VALID_URL }, ip));
      expect(ok.status).toBe(200);
    }

    const limited = await POST(makeRequest({ url: VALID_URL }, ip));
    expect(limited.status).toBe(429);
  });

  it("响应头带 no-store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => apiResponse([])),
    );

    const response = await POST(makeRequest({ url: VALID_URL }, "10.0.0.6"));
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
