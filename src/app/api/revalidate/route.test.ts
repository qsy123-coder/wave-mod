import { beforeEach, describe, expect, it, vi } from "vitest";

// 与 mod-cache.test.ts 同一套拦截：这两个模块在 node 测试环境里不能直接 import。
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { revalidateTag } from "next/cache";

import { POST } from "@/app/api/revalidate/route";

const SECRET = "test-secret-at-least-16-chars-long";

function requestWith(secret?: string) {
  const headers = new Headers();
  if (secret !== undefined) headers.set("x-revalidate-secret", secret);
  return new Request("https://example.test/api/revalidate", { method: "POST", headers });
}

const invalidatedTags = () => vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REVALIDATE_SECRET = SECRET;
});

describe("POST /api/revalidate", () => {
  it("密钥正确时清掉公开读缓存", async () => {
    const response = await POST(requestWith(SECRET));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(invalidatedTags()).toContain("mods:list");
  });

  // 一个「谁都能调」的失效接口等于把出口配额交给外人：每次调用都会让下一个
  // 访客重扫全表（约 4.6MB）——正是 2026-09-21 超配额事故的成因。
  it("密钥错误时拒绝，且不发生任何失效", async () => {
    // 故意用等长的错误密钥，走真正的 timingSafeEqual 比较分支
    const wrongButSameLength = "x".repeat(SECRET.length);
    const response = await POST(requestWith(wrongButSameLength));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("没带密钥头时拒绝，且不发生任何失效", async () => {
    const response = await POST(requestWith());

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  // fail closed：宁可在脚本侧报警，也不能因为「忘了配」而把接口敞开。
  it("未配置密钥、或密钥短得不像密钥时都拒绝服务", async () => {
    delete process.env.REVALIDATE_SECRET;
    const unset = await POST(requestWith("whatever-at-least-16-chars"));

    process.env.REVALIDATE_SECRET = "123";
    const tooShort = await POST(requestWith("123"));

    expect(unset.status).toBe(503);
    expect(tooShort.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
