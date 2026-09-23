import { describe, expect, it } from "vitest";

import { REQUIRED_TOOL_DRIVES, REQUIRED_TOOLS_SUMMARY } from "./tool-download";

/**
 * 这里守的是「链接被人手改坏」：分享链接少一段、丢提取码，前台按钮照样渲染、
 * 照样显示「已复制」，用户粘进客户端才发现转存不了 —— 只能靠测试挡。
 */
describe("教程必要工具的网盘链接", () => {
  it("夸克 + 迅雷各一条，且平台名能对上提示文案", () => {
    expect(REQUIRED_TOOL_DRIVES.map((d) => d.platform)).toEqual(["夸克网盘", "迅雷网盘"]);
  });

  it("都是对应网盘的分享链接，且带提取码（pwd）", () => {
    for (const drive of REQUIRED_TOOL_DRIVES) {
      expect(drive.url.startsWith("https://")).toBe(true);
      expect(drive.url).toMatch(/\?pwd=[A-Za-z0-9]+/);
    }

    expect(REQUIRED_TOOL_DRIVES[0].url).toContain("pan.quark.cn/s/");
    expect(REQUIRED_TOOL_DRIVES[1].url).toContain("pan.xunlei.com/s/");
  });

  it("两条链接互不相同（避免复制粘贴时复制错条目）", () => {
    const urls = new Set(REQUIRED_TOOL_DRIVES.map((d) => d.url));
    expect(urls.size).toBe(REQUIRED_TOOL_DRIVES.length);
  });

  it("面板说明写清了打包的是哪三个工具", () => {
    expect(REQUIRED_TOOLS_SUMMARY).toContain("JASM");
    expect(REQUIRED_TOOLS_SUMMARY).toContain("XXMI");
    expect(REQUIRED_TOOLS_SUMMARY).toContain("修复工具");
  });
});
