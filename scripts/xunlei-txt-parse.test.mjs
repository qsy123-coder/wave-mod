import { describe, expect, it } from "vitest";

import { parseXunleiTxt, withXunleiPwd } from "./xunlei-txt-parse.mjs";

/** 与迅雷 App「复制分享」一致的排版：块之间空一行，末尾还有一行提示语 */
const SAMPLE = [
  "分享文件：锁暝-虚假希望（【】）.exe",
  "链接：https://pan.xunlei.com/s/VP57Z3dR67IWEBi0txIibs4kA1",
  "提取码：3rhw",
  "复制这段内容后打开手机迅雷App，查看更方便",
  "",
  "分享文件：莫宁-月光幻影v3.4fix by Alunoop（ctrl+4567890切换）.exe",
  "链接：https://pan.xunlei.com/s/VP57Z3fR7SRcsEWnzrHA_naUA1",
  "提取码：9x5j",
  "复制这段内容后打开手机迅雷App，查看更方便",
  "",
].join("\r\n");

describe("parseXunleiTxt", () => {
  it("解析出每条的分享名（去 .exe）、链接和提取码", () => {
    expect(parseXunleiTxt(SAMPLE)).toEqual([
      {
        name: "锁暝-虚假希望（【】）",
        link: "https://pan.xunlei.com/s/VP57Z3dR67IWEBi0txIibs4kA1",
        pwd: "3rhw",
      },
      {
        name: "莫宁-月光幻影v3.4fix by Alunoop（ctrl+4567890切换）",
        link: "https://pan.xunlei.com/s/VP57Z3fR7SRcsEWnzrHA_naUA1",
        pwd: "9x5j",
      },
    ]);
  });

  it("兼容全角/半角冒号与仅有 \\n 的行尾", () => {
    const text =
      "分享文件:清宵-和服.exe\n链接:https://pan.xunlei.com/s/AAA\n提取码:abcd\n";
    expect(parseXunleiTxt(text)).toEqual([
      { name: "清宵-和服", link: "https://pan.xunlei.com/s/AAA", pwd: "abcd" },
    ]);
  });

  it("无关文本返回空数组，不抛错", () => {
    expect(parseXunleiTxt("今天没有更新")).toEqual([]);
    expect(parseXunleiTxt("")).toEqual([]);
  });

  it("链接不是 http 的条目丢弃（避免把‘链接：无’写进库）", () => {
    const text = "分享文件：x.exe\n链接：无\n提取码：0000\n";
    expect(parseXunleiTxt(text)).toEqual([]);
  });

  it("重复调用不受 lastIndex 影响（正则带 g 标志）", () => {
    expect(parseXunleiTxt(SAMPLE)).toHaveLength(2);
    expect(parseXunleiTxt(SAMPLE)).toHaveLength(2);
  });
});

describe("withXunleiPwd", () => {
  it("裸链接拼成打开即自动填码的形式（与库内历史记录同形态）", () => {
    expect(
      withXunleiPwd("https://pan.xunlei.com/s/VP57Z3dR67IWEBi0txIibs4kA1", "3rhw")
    ).toBe("https://pan.xunlei.com/s/VP57Z3dR67IWEBi0txIibs4kA1?pwd=3rhw#");
  });

  it("已带 pwd 的链接原样返回（导出表才是正式来源，不覆盖它的提取码）", () => {
    const url = "https://pan.xunlei.com/s/VP14jvqskeCZmEOcfqNLqhwQA1?pwd=k99r#";
    expect(withXunleiPwd(url, "zzzz")).toBe(url);
  });

  it("提取码为空 / 非迅雷域名时原样返回，不拼假链接", () => {
    expect(withXunleiPwd("https://pan.xunlei.com/s/AAA", "")).toBe(
      "https://pan.xunlei.com/s/AAA"
    );
    expect(withXunleiPwd("https://pan.quark.cn/s/AAA", "3rhw")).toBe(
      "https://pan.quark.cn/s/AAA"
    );
  });

  it("链接带其它查询参数时用 & 续接，且吃掉末尾多余的 #", () => {
    expect(withXunleiPwd("https://pan.xunlei.com/s/AAA?from=app#", "abcd")).toBe(
      "https://pan.xunlei.com/s/AAA?from=app&pwd=abcd#"
    );
  });

  it("txt 解析出的 name/link/pwd 直接串起来就能落库", () => {
    const [first] = parseXunleiTxt(SAMPLE);
    expect(withXunleiPwd(first.link, first.pwd)).toMatch(/\?pwd=3rhw#$/);
  });
});
