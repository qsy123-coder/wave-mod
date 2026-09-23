import { beforeEach, describe, expect, it, vi } from "vitest";

// mod-cache.ts 是 server-only 模块，测试跑在 node 环境里；
// 不拦掉的话 import "server-only" 会直接抛。
vi.mock("server-only", () => ({}));

// 拦掉 next/cache，把失效动作记下来 —— 这个文件要断言的正是「谁失效了什么」。
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { revalidatePath, revalidateTag } from "next/cache";

import {
  modCacheTags,
  revalidateModEngagementCaches,
  revalidatePublicModCaches,
} from "@/lib/mod-cache";

const tagCalls = () => vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag);
const pathCalls = () => vi.mocked(revalidatePath).mock.calls.map(([path]) => path);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("revalidateModEngagementCaches（用户互动）", () => {
  // 这一条是出口配额的防回归护栏。modCacheTags.list 的分片是整个已发布表按 500
  // 行切出来的，一次 revalidateTag(list) 就会让下一次任意页面的访问重扫全表
  // （约 5.5MB 出口）。而点赞/收藏/评分/评论共 8 处此前全都走的是
  // revalidatePublicModCaches —— 等于每点一次赞就打掉整张列表缓存。
  // 谁把互动改回去调那个函数，这里必须红。
  it("不失效 mods:list —— 一次互动不该换来一次全表重扫", () => {
    revalidateModEngagementCaches();
    expect(tagCalls()).not.toContain(modCacheTags.list);
  });

  it("不失效 mods:characters —— 互动不改 mod 的角色", () => {
    revalidateModEngagementCaches();
    expect(tagCalls()).not.toContain(modCacheTags.characters);
  });

  // 这条同时兜住「别把 modCacheTags.snapshot 塞进来」：网关被锁时它会拉一份
  // 513KB 的远程快照，一次点赞付这个代价毫无道理。
  it("完全不调用 revalidateTag", () => {
    revalidateModEngagementCaches();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  // 2026-09-24：`/mods` 与 `/mods/<id>` 变成 ISR 路由后，互动**不能再**碰它们 ——
  // 那两个页面的 HTML 里的计数正是上面刻意不清的分片缓存，重建只会拿同一份旧计数
  // 重渲染，白付一次全表重扫。这条同时兜住「别把 revalidatePublicModCaches 加回来」。
  it("不刷新 /mods 与首页 —— 它们是 ISR 路由，重建只会重渲染同一份旧计数", () => {
    revalidateModEngagementCaches();
    expect(pathCalls()).not.toContain("/");
    expect(pathCalls()).not.toContain("/mods");
    expect(pathCalls()).not.toContain("/mods/mod-1");
  });

  // 唯一真正会变的是「我的收藏」的成员。这条是行为断言，不是实现断言：
  // 哪天有人把互动改成「什么都不失效」，收藏页就会一直显示旧列表。
  it("刷新「我的收藏」", () => {
    revalidateModEngagementCaches();
    expect(pathCalls()).toEqual(["/favorites"]);
  });
});

describe("revalidatePublicModCaches（内容写入）", () => {
  // 与上面成对：管理侧的内容写入会改变列表成员，必须清分片缓存，
  // 否则新上传/下架的 mod 要等一个 TTL 才出现在列表里。
  it("失效列表与角色分片缓存", () => {
    revalidatePublicModCaches("mod-1");
    expect(tagCalls()).toContain(modCacheTags.list);
    expect(tagCalls()).toContain(modCacheTags.characters);
  });

  // 网关被锁时远程兜底快照是前台唯一的数据源。写库脚本发完新对象后 ping 的
  // 就是这个接口 —— 漏了这条，新内容要等满 1 小时 TTL 才出现。
  it("失效远程兜底快照缓存", () => {
    revalidatePublicModCaches("mod-1");
    expect(tagCalls()).toContain(modCacheTags.snapshot);
    revalidatePublicModCaches();
    expect(tagCalls()).toContain(modCacheTags.snapshot);
  });

  it("带 modId 时额外刷新该 mod 的详情", () => {
    revalidatePublicModCaches("mod-1");
    expect(tagCalls()).toContain(modCacheTags.detail("mod-1"));
    expect(pathCalls()).toContain("/mods/mod-1");
  });

  it("不带 modId（新增 MOD）时同样清列表缓存", () => {
    revalidatePublicModCaches();
    expect(tagCalls()).toContain(modCacheTags.list);
    expect(tagCalls()).not.toContain(modCacheTags.detail(""));
  });
});
