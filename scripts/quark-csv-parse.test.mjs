import { describe, expect, it } from "vitest";

import { parseQuarkCsvText } from "./quark-csv-parse.mjs";

const HEADER = "创建分享状态,分享名,分享内容,提取码,分享时间";

describe("parseQuarkCsvText", () => {
  it("解析带引号的分享名与分享内容，去掉 .exe", () => {
    const csv = [
      HEADER,
      '成功,"弗洛洛-小红帽.exe","分享链接：https://pan.quark.cn/s/abc123?pwd=1111 复制内容",1111,2026-10-31',
    ].join("\r\n");

    expect(parseQuarkCsvText(csv)).toEqual([
      {
        key: "弗洛洛-小红帽",
        filename: "弗洛洛-小红帽.exe",
        url: "https://pan.quark.cn/s/abc123?pwd=1111",
        code: "1111",
      },
    ]);
  });

  it("支持分享内容跨多行", () => {
    const csv = [
      HEADER,
      '成功,"莫宁-月光幻影.exe","第一行',
      '分享链接：https://pan.quark.cn/s/def456',
      '最后一行",9x5j,2026-10-31',
    ].join("\n");

    expect(parseQuarkCsvText(csv)).toEqual([
      {
        key: "莫宁-月光幻影",
        filename: "莫宁-月光幻影.exe",
        url: "https://pan.quark.cn/s/def456",
        code: "9x5j",
      },
    ]);
  });

  it("兼容不带引号的行", () => {
    const csv = "成功,标题.exe,链接：https://pan.quark.cn/s/xyz,abcd";
    expect(parseQuarkCsvText(csv)).toEqual([
      { key: "标题", filename: "标题.exe", url: "https://pan.quark.cn/s/xyz", code: "abcd" },
    ]);
  });

  it("没有夸克链接的行丢弃", () => {
    const csv = [
      HEADER,
      '成功,"只有标题.exe","没有链接",,"2026-10-31',
      '成功,"有链接.exe","https://pan.quark.cn/s/ok",,"2026-10-31',
    ].join("\n");

    expect(parseQuarkCsvText(csv).map((row) => row.key)).toEqual(["有链接"]);
  });

  it("空文本/表头返回空数组", () => {
    expect(parseQuarkCsvText("")).toEqual([]);
    expect(parseQuarkCsvText(HEADER)).toEqual([]);
  });
});
