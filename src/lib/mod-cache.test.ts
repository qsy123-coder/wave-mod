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
    revalidateModEngagementCaches("mod-1");
    expect(tagCalls()).not.toContain(modCacheTags.list);
  });

  it("不失效 mods:characters —— 互动不改 mod 的角色", () => {
    revalidateModEngagementCaches("mod-1");
    expect(tagCalls()).not.toContain(modCacheTags.characters);
  });

  it("完全不调用 revalidateTag", () => {
    revalidateModEngagementCaches("mod-1");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("仍然刷新该 mod 的详情路由", () => {
    revalidateModEngagementCaches("mod-1");
    expect(pathCalls()).toContain("/mods/mod-1");
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
