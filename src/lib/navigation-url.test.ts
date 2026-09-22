import { describe, expect, it } from "vitest";

import { buildModsFilterHref, isSameNavigationUrl } from "@/lib/navigation-url";

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

  // 开关只差一个就是不同的页（一条筛过、一条没筛），判成同一个会漏掉整次导航
  it("开关不同不是同一个", () => {
    expect(isSameNavigationUrl("/mods?preview=1", "/mods")).toBe(false);
    expect(isSameNavigationUrl("/mods?direct=1&preview=1", "/mods?preview=1")).toBe(false);
  });

  // 多值参数（理论上不会出现，但判定宁可保守）：漏掉任何一个值都会把「不同」判成
  // 「相同」，那就会漏掉一次真正需要的导航。
  it("同名参数的多个值都参与比较", () => {
    expect(isSameNavigationUrl("/mods?tag=a&tag=b", "/mods?tag=a")).toBe(false);
    expect(isSameNavigationUrl("/mods?tag=a&tag=b", "/mods?tag=b&tag=a")).toBe(true);
  });
});

/** 把查询串拆成对象比对：参数顺序不属于约定，值才是 */
function paramsOf(href: string) {
  const queryIndex = href.indexOf("?");
  return Object.fromEntries(new URLSearchParams(queryIndex < 0 ? "" : href.slice(queryIndex + 1)));
}

describe("buildModsFilterHref（不传的字段 = 取消该筛选）", () => {
  it("五个维度都写进查询串", () => {
    expect(paramsOf(buildModsFilterHref("/mods", { query: "大卡", character: "爱弥斯", sort: "hot", direct: true, preview: true }))).toEqual({
      query: "大卡",
      character: "爱弥斯",
      sort: "hot",
      direct: "1",
      preview: "1",
    });
  });

  // 开关固定写 "1"（服务端 parseModFlag 认这个值），不写 "true"
  it("开关写成 1，不是 true", () => {
    expect(paramsOf(buildModsFilterHref("/mods", { preview: true }))).toEqual({ preview: "1" });
  });

  it("开关传 false 等于取消，不进查询串", () => {
    expect(buildModsFilterHref("/mods", { preview: false, direct: false })).toBe("/mods");
  });

  it("叉掉一个开关：另一个与其余维度原样保留", () => {
    expect(paramsOf(buildModsFilterHref("/mods", { character: "爱弥斯", direct: true, preview: false }))).toEqual({
      character: "爱弥斯",
      direct: "1",
    });
    expect(paramsOf(buildModsFilterHref("/mods", { character: "爱弥斯", direct: false, preview: true }))).toEqual({
      character: "爱弥斯",
      preview: "1",
    });
  });

  it("一个筛选都没有时就是裸路径，不留「?」", () => {
    expect(buildModsFilterHref("/mods", {})).toBe("/mods");
  });

  // 筛选卡片上那个叉的效果：少传一个字段，其余维度原样保留。
  // 三条分开写，是因为「叉掉角色」和「叉掉搜索词」漏掉的那个字段不一样，
  // 写成一个循环就盖不住「谁都可能漏」这件事。
  it("叉掉角色：其余维度保留", () => {
    expect(paramsOf(buildModsFilterHref("/mods", { query: "大卡", sort: "hot" }))).toEqual({
      query: "大卡",
      sort: "hot",
    });
  });

  it("叉掉搜索词：其余维度保留", () => {
    expect(paramsOf(buildModsFilterHref("/mods", { character: "爱弥斯", sort: "hot" }))).toEqual({
      character: "爱弥斯",
      sort: "hot",
    });
  });

  it("叉掉排序：其余维度保留", () => {
    expect(paramsOf(buildModsFilterHref("/mods", { query: "大卡", character: "爱弥斯" }))).toEqual({
      query: "大卡",
      character: "爱弥斯",
    });
  });

  it("sort=latest 省略（服务端把没写 sort 当作最新）", () => {
    expect(buildModsFilterHref("/mods", { sort: "latest" })).toBe("/mods");
  });

  // 清空搜索框后提交 / 源图里角色为空：空串必须与不传等价，否则会拼出
  // ?query= 这种「看着有筛选、实际没有」的链接，判等也会跟着错。
  it("空串与不传等价", () => {
    expect(buildModsFilterHref("/mods", { query: "", character: "", sort: "" })).toBe("/mods");
  });

  it("游戏子路径照样拼（不写死 /mods）", () => {
    expect(buildModsFilterHref("/wuthering-waves/mods", { character: "菲比" })).toBe(
      `/wuthering-waves/mods?character=${encodeURIComponent("菲比")}`
    );
  });

  // 拼链接与判等是一对：拼出来、判等说「就是当前页」的链接，不应该触发导航。
  // 参数顺序不同（工具栏是 query→character→sort，侧边栏是 sort→character→query）
  // 必须仍判为同一页，否则叉掉筛选会卡在骨架屏上。
  it("与判等自洽：拼出的链接和同内容的乱序链接是同一页", () => {
    const href = buildModsFilterHref("/mods", { query: "大卡", sort: "hot" });
    expect(isSameNavigationUrl(href, "/mods?sort=hot&query=大卡")).toBe(true);
  });
});
