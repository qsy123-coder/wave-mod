import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only 与 @/lib/supabase/server 在 node 测试环境里都不能直接 import
// （前者是打包期哨兵，后者会拉进 next/headers）。与 revalidate/route.test.ts 同一套拦截。
vi.mock("server-only", () => ({}));

const { isAdminUserMock } = vi.hoisted(() => ({ isAdminUserMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ isAdminUser: isAdminUserMock }));

import { GET, dynamic } from "@/app/api/auth/is-admin/route";

beforeEach(() => {
  isAdminUserMock.mockReset();
});

describe("GET /api/auth/is-admin", () => {
  it("管理员回 true，非管理员回 false", async () => {
    isAdminUserMock.mockResolvedValueOnce(true);
    expect(await (await GET()).json()).toEqual({ isAdmin: true });

    isAdminUserMock.mockResolvedValueOnce(false);
    expect(await (await GET()).json()).toEqual({ isAdmin: false });
  });

  it("必须是动态路由（要读认证 cookie，不能进静态缓存）", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  // 安全边界：这个响应因人而异，被任何共享缓存存下来都会把管理员的 true 发给所有人。
  it("缓存头是 private + no-store，且绝不能出现 s-maxage", async () => {
    isAdminUserMock.mockResolvedValueOnce(true);
    const cacheControl = (await GET()).headers.get("cache-control") ?? "";

    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).not.toContain("s-maxage");
    expect(cacheControl).not.toContain("public");
  });

  // 响应体只说明「是不是」，绝不泄漏「凭什么是」——ADMIN_EMAIL / ADMIN_PHONES 是 secret。
  it("即使请求者是管理员，响应里也不含任何身份标识", async () => {
    process.env.ADMIN_EMAIL = "boss@example.com";
    isAdminUserMock.mockResolvedValueOnce(true);

    const body = await (await GET()).text();

    expect(JSON.parse(body)).toEqual({ isAdmin: true });
    expect(Object.keys(JSON.parse(body))).toEqual(["isAdmin"]);
    expect(body).not.toContain("boss@example.com");
    expect(body).not.toContain("@");
    delete process.env.ADMIN_EMAIL;
  });
});
