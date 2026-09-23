import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/mods` 是**匿名可访问**的分页接口，所以这里盯的是两件事：
 * ① pageSize 必须被钳住（钳制前 ?pageSize=999999 会把整表约 6MB 吐出去）；
 * ② 缓存头必须是 public 且分级 —— 它与 /api/mods/[id]（private, no-store，
 *    因为会合并当前用户的收藏/点赞状态）是相反的，两者不要互相抄。
 */

const { getPublicModsPageMock } = vi.hoisted(() => ({
  getPublicModsPageMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mods", async () => {
  // 真的用 sorting.ts 里的解析函数：钳制与解析的口径要跟着实现走，
  // 这里把全模块 mock 掉会让测试变成「断言自己的 mock」。
  const actual = await vi.importActual<typeof import("@/lib/mods-domain/sorting")>(
    "@/lib/mods-domain/sorting",
  );
  return {
    getPublicModsPage: getPublicModsPageMock,
    parseCharacterFilter: actual.parseCharacterFilter,
    parseModFlag: actual.parseModFlag,
    parseModQuery: actual.parseModQuery,
    parseModSort: actual.parseModSort,
  };
});

import { GET } from "@/app/api/mods/route";
import { MODS_MAX_PAGE_SIZE } from "@/lib/mods-domain/filter-params";

// 必须是 NextRequest：路由读的是 `request.nextUrl.searchParams`，
// 传 Web 原生的 Request 会在 `request.nextUrl` 上直接 TypeError。
function request(query: string) {
  return new NextRequest(`https://example.test/api/mods?${query}`);
}

/** 取出被 mock 的 getPublicModsPage 收到的 (page, pageSize) */
function receivedArgs() {
  const call = getPublicModsPageMock.mock.calls.at(-1);
  expect(call).toBeDefined();
  return { page: call![0] as number, pageSize: call![1] as number };
}

beforeEach(() => {
  getPublicModsPageMock.mockReset();
  getPublicModsPageMock.mockResolvedValue({
    hasMore: false,
    items: [],
    nextPage: null,
    page: 1,
    pageSize: 16,
    totalCount: 0,
    totalPages: 1,
  });
});

describe("GET /api/mods —— 入参钳制", () => {
  // 这是这个接口最贵的一个洞：整表 5292 条约 6MB，一个匿名 GET 就能反复拉。
  it("pageSize 被钳到上限", async () => {
    await GET(request("pageSize=999999"));
    expect(receivedArgs().pageSize).toBe(MODS_MAX_PAGE_SIZE);
  });

  // 缺省必须走 fallback：`Number(null)` 是 0（不是 NaN），若直接丢给 Number()
  // 会被当成「用户要 0 条」钳成 1，接口缺省时只回 1 条 —— 静默的语义回退。
  it("pageSize / page 缺省时走默认值", async () => {
    await GET(request(""));
    expect(receivedArgs()).toEqual({ page: 1, pageSize: 12 });
    await GET(request("pageSize=&page="));
    expect(receivedArgs()).toEqual({ page: 1, pageSize: 12 });
  });

  it("pageSize 非法（NaN / 0 / 负数）时退回默认值", async () => {
    await GET(request("pageSize=abc"));
    expect(receivedArgs().pageSize).toBe(12);
    await GET(request("pageSize=0"));
    expect(receivedArgs().pageSize).toBe(1);
    await GET(request("pageSize=-5"));
    expect(receivedArgs().pageSize).toBe(1);
  });

  it("page 非法时退回第 1 页（NaN 会让切片变成空数组，前端以为翻到底了）", async () => {
    await GET(request("page=abc"));
    expect(receivedArgs().page).toBe(1);
    await GET(request("page=-3"));
    expect(receivedArgs().page).toBe(1);
  });

  it("合法入参原样透传", async () => {
    await GET(request("page=3&pageSize=16"));
    expect(receivedArgs()).toEqual({ page: 3, pageSize: 16 });
  });

  it("五个筛选维度都解析出来交给服务层", async () => {
    await GET(request("character=%E5%8D%83%E5%92%B2&query=abc&sort=hot&direct=1&preview=1"));
    expect(getPublicModsPageMock.mock.calls.at(-1)?.[2]).toEqual({
      character: "千咲",
      direct: true,
      gameKey: undefined,
      preview: true,
      query: "abc",
      sort: "hot",
    });
  });
});

describe("GET /api/mods —— 缓存头", () => {
  it("浏览型请求：public + s-maxage=300 + stale-while-revalidate", async () => {
    const response = await GET(request("page=1&pageSize=16&sort=hot"));
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
  });

  // 搜索词是长尾随机的，跟浏览型请求共用 300 秒会把缓存撑爆。
  it("带 query 的请求：TTL 缩到 60 秒", async () => {
    const response = await GET(request("query=abc"));
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=3600",
    );
  });

  // 这份响应里没有任何 per-user 状态，所以可以 public；
  // 一旦有人把它改成 private 是为了「安全」，那是抄错了 /api/mods/[id]。
  it("绝不能带 no-store（本接口没有 per-user 状态）", async () => {
    const response = await GET(request(""));
    expect(response.headers.get("Cache-Control")).not.toContain("no-store");
    expect(response.headers.get("Cache-Control")).not.toContain("private");
  });
});
