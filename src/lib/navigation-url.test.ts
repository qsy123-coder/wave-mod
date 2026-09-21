import { describe, expect, it } from "vitest";

import { isSameNavigationUrl } from "@/lib/navigation-url";

describe("isSameNavigationUrl（判断一次点击是不是原地踏步）", () => {
  // 这条是整个判定的存在理由：骨架屏的结束只由「服务端 props 变化」触发，
  // 而 push 一个与当前完全相同的 URL 不会带来任何 props 变化 ⇒ 判不出来就一直卡着。
  it("完全相同的 URL 判为同一个", () => {
    expect(isSameNavigationUrl("/mods?character=爱弥斯", "/mods?character=爱弥斯")).toBe(true);
  });

  // 侧边栏链接由 buildModsHref 生成（sort → character → query），搜索框由
  // ModsToolbar 生成（query → character → sort）。同一个页面的两份链接参数顺序不同，
  // 按字符串比会把「就在当前页」误判成「要跳走」，于是又卡回骨架屏。
  it("参数顺序不同但内容相同判为同一个", () => {
    expect(isSameNavigationUrl("/mods?sort=hot&character=爱弥斯", "/mods?character=爱弥斯&sort=hot")).toBe(
      true
    );
  });

  it("查询串为空与没有查询串等价", () => {
    expect(isSameNavigationUrl("/mods?", "/mods")).toBe(true);
    expect(isSameNavigationUrl("/mods?", "/mods?")).toBe(true);
  });

  it("尾斜杠不影响（/mods/ 与 /mods 是同一页）", () => {
    expect(isSameNavigationUrl("/mods/", "/mods")).toBe(true);
  });

  // 构建侧给出的是百分号编码，浏览器 location 给的也是编码形式，但两边编码大小写
  // 或编码方式未必一致；URLSearchParams 统一解码后再比，才不会因为编码差异误判。
  it("同一个中文值的不同编码形式判为同一个", () => {
    expect(isSameNavigationUrl("/mods?character=%E7%88%B1%E5%BC%A5%E6%96%AF", "/mods?character=爱弥斯")).toBe(
      true
    );
  });

  it("不同角色不是同一个", () => {
    expect(isSameNavigationUrl("/mods?character=爱弥斯", "/mods?character=千咲")).toBe(false);
  });

  it("一个带筛选一个不带，不是同一个", () => {
    expect(isSameNavigationUrl("/mods?character=爱弥斯", "/mods")).toBe(false);
    expect(isSameNavigationUrl("/mods?query=大卡", "/mods")).toBe(false);
  });

  it("路径不同不是同一个", () => {
    expect(isSameNavigationUrl("/mods?character=爱弥斯", "/wuthering-waves/mods?character=爱弥斯")).toBe(
      false
    );
  });

  // 多值参数（理论上不会出现，但判定宁可保守）：漏掉任何一个值都会把「不同」判成
  // 「相同」，那就会漏掉一次真正需要的导航。
  it("同名参数的多个值都参与比较", () => {
    expect(isSameNavigationUrl("/mods?tag=a&tag=b", "/mods?tag=a")).toBe(false);
    expect(isSameNavigationUrl("/mods?tag=a&tag=b", "/mods?tag=b&tag=a")).toBe(true);
  });
});
