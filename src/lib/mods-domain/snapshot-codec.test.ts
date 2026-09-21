import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { decodeSnapshotBase64, decodeSnapshotGzip } from "@/lib/mods-domain/snapshot-codec";

/** 构造一份「看起来像真实导出」的快照：字段名与库里的 snake_case 一致 */
const gz = (value: unknown) => gzipSync(Buffer.from(JSON.stringify(value), "utf8"));

const ROWS = [
  {
    id: "dfadc822-f9fd-4a55-b5b4-dc5fe364283a",
    game_key: "wuthering-waves",
    character: "女漂",
    title: "女漂-逆兔女郎",
    is_published: true,
    featured_order: null,
    drive_links: [
      { platform: "迅雷网盘", url: "https://pan.xunlei.com/s/VP21X6jj", password: "yubk" },
    ],
  },
  {
    id: "0c1f0214-b807-4c38-8f0f-fcd9ec9380b0",
    game_key: "wuthering-waves",
    character: "尤诺",
    title: "尤诺 | 怀韵",
    is_published: true,
    featured_order: 3,
    drive_links: [],
  },
];

describe("decodeSnapshotGzip", () => {
  it("解出原始行数组，中文/null/嵌套 drive_links 原样保留", () => {
    expect(decodeSnapshotGzip(gz(ROWS))).toEqual(ROWS);
  });

  it("base64 入口与 gzip 入口结果一致", () => {
    // 前台走的是 COS 上那份（fetch 回来是字节），CLI/打包路径读的是磁盘文件，
    // 两条入口必须解出同一个东西，否则「线上和本地看到的不一样」根本无从判断。
    expect(decodeSnapshotBase64(gz(ROWS).toString("base64"))).toEqual(ROWS);
  });

  // 空数组是这组测试里最要紧的一条：坏导出产出 [] 时，前台会表现成
  // 「网关正常但一条数据都没有」，比抛错难查得多。宁可抛。
  it("空数组抛错", () => {
    expect(() => decodeSnapshotGzip(gz([]))).toThrow(/非空数组/);
  });

  it("根节点不是数组抛错", () => {
    expect(() => decodeSnapshotGzip(gz({ rows: ROWS }))).toThrow(/非空数组/);
    expect(() => decodeSnapshotGzip(gz("not-an-array"))).toThrow(/非空数组/);
    expect(() => decodeSnapshotGzip(gz(42))).toThrow(/非空数组/);
  });

  it("不是 gzip 时抛错（明文 JSON 直接传进来）", () => {
    expect(() => decodeSnapshotGzip(Buffer.from(JSON.stringify(ROWS), "utf8"))).toThrow(/gzip/);
  });

  it("随机字节抛错", () => {
    expect(() => decodeSnapshotGzip(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toThrow(/gzip/);
  });

  it("gzip 里装的不是 JSON 时抛错", () => {
    expect(() => decodeSnapshotGzip(gzipSync(Buffer.from("不是 JSON", "utf8")))).toThrow(/JSON/);
  });

  // 半截上传 / 传输被截断：绝不能静默返回「部分数据」——那会变成
  // 「站上只有一半 mod」，而快照本身看起来是「成功载入」的。
  it("截断的 buffer 抛错，不返回部分数据", () => {
    const full = gz(ROWS);
    expect(() => decodeSnapshotGzip(full.slice(0, Math.floor(full.length * 0.6)))).toThrow();
  });

  it("非法 base64 抛错", () => {
    // Buffer.from 对非法字符是宽松的（会忽略它们、产出空 buffer），
    // 由 gunzip 兜住，不能变成「返回空数组」。
    expect(() => decodeSnapshotBase64("@@@@")).toThrow(/gzip/);
  });
});
