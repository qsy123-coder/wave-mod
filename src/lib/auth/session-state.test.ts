import { describe, expect, it } from "vitest";

import {
  isAdminLookupNeeded,
  resolveIsAdmin,
  toSessionUser,
  type AdminLookup,
  type SessionUser,
} from "@/lib/auth/session-state";

const USER: SessionUser = { id: "u1", email: "a@b.com", phone: null, displayName: "a" };
const OTHER: SessionUser = { id: "u2", email: "c@d.com", phone: null, displayName: "c" };

describe("toSessionUser", () => {
  it("没有 id 一律视为未登录（空对象、null、undefined 都算）", () => {
    expect(toSessionUser(null)).toBeNull();
    expect(toSessionUser(undefined)).toBeNull();
    expect(toSessionUser({ id: "" })).toBeNull();
  });

  it("邮箱转小写并去空白，空串收敛成 null", () => {
    expect(toSessionUser({ id: "u1", email: "  Boss@Example.COM ", phone: " 13800138000 " })).toEqual({
      id: "u1",
      email: "boss@example.com",
      phone: "13800138000",
      displayName: "boss",
    });
    expect(toSessionUser({ id: "u1", email: "", phone: "" })).toEqual({
      id: "u1",
      email: null,
      phone: null,
      displayName: null,
    });
  });

  describe("展示昵称（评论区默认署名）", () => {
    it("优先 display_name，其次 full_name，再退到邮箱前缀", () => {
      expect(toSessionUser({ id: "u1", email: "a@b.com", user_metadata: { display_name: "小明" } })?.displayName).toBe("小明");
      expect(toSessionUser({ id: "u1", email: "a@b.com", user_metadata: { full_name: "小红" } })?.displayName).toBe("小红");
      expect(toSessionUser({ id: "u1", email: "a@b.com" })?.displayName).toBe("a");
    });

    // Supabase 里留空的名字很常见；空白昵称会让评论区出现一条没有署名的评论。
    it("空字符串 / 纯空白 / 非字符串一律当作没有，继续往下退", () => {
      expect(toSessionUser({ id: "u1", email: "a@b.com", user_metadata: { display_name: "   " } })?.displayName).toBe("a");
      expect(toSessionUser({ id: "u1", email: "a@b.com", user_metadata: { display_name: "" } })?.displayName).toBe("a");
      expect(toSessionUser({ id: "u1", email: "a@b.com", user_metadata: { display_name: 42 } })?.displayName).toBe("a");
      expect(
        toSessionUser({ id: "u1", user_metadata: { display_name: "" } })?.displayName,
      ).toBeNull();
    });

    it("没有邮箱也没有 metadata 时是 null（由调用方兜底成「我」）", () => {
      expect(toSessionUser({ id: "u1" })?.displayName).toBeNull();
    });
  });
});

describe("isAdminLookupNeeded", () => {
  // 爬虫与匿名访客占流量的绝大多数，未登录还去问一次 is-admin 是纯浪费。
  it("匿名不查，登录才查", () => {
    expect(isAdminLookupNeeded(null)).toBe(false);
    expect(isAdminLookupNeeded(USER)).toBe(true);
  });
});

describe("resolveIsAdmin", () => {
  const admin: AdminLookup = { userId: "u1", isAdmin: true };

  it("查的就是当前用户且为 true 才放行", () => {
    expect(resolveIsAdmin(USER, admin)).toBe(true);
    expect(resolveIsAdmin(USER, { userId: "u1", isAdmin: false })).toBe(false);
  });

  it("未登录时一律 false（登出后飞回来的旧响应不算数）", () => {
    expect(resolveIsAdmin(null, admin)).toBe(false);
  });

  // 这是这个模块存在的理由：u1 的查询慢、期间 u2 登入，u1 的 true 绝不能亮在 u2 界面上。
  it("换人后不认上一个人的响应", () => {
    expect(resolveIsAdmin(OTHER, admin)).toBe(false);
  });

  it("查询失败（没有 lookup）时 false —— fail closed", () => {
    expect(resolveIsAdmin(USER, null)).toBe(false);
    expect(resolveIsAdmin(USER, undefined)).toBe(false);
  });

  it("只认真正的布尔 true，其它值一律当 false", () => {
    // 接口返回体被中间层改坏、或少了个字段时，不能因为「truthy」就放行管理入口。
    expect(resolveIsAdmin(USER, { userId: "u1", isAdmin: "true" as unknown as boolean })).toBe(false);
    expect(resolveIsAdmin(USER, { userId: "u1", isAdmin: 1 as unknown as boolean })).toBe(false);
  });
});
