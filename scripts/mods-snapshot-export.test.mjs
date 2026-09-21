import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import {
  SNAPSHOT_MIN_RATIO,
  SNAPSHOT_OBJECT_KEY,
  buildSnapshotCosUrl,
  decideSnapshotWrite,
  normalizeRawSnapshot,
  notifyRevalidate,
  putSnapshotToCos,
} from "./mods-snapshot-export.mjs";

const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, title: `标题 ${i}` }));
/** 与真实导出同形：psql -o 出来的原始字节（含结尾换行），gzip 前的样子 */
const rawOf = (rows) => Buffer.from(`${JSON.stringify(rows)}\n`, "utf8");

describe("decideSnapshotWrite", () => {
  it("没有旧快照 → 写出", () => {
    const rows = rowsOf(100);
    expect(decideSnapshotWrite({ rows, rawBuf: rawOf(rows), prevBuf: null }).action).toBe("write");
  });

  it("与旧快照解压后逐字节相同 → unchanged", () => {
    const rows = rowsOf(100);
    const raw = rawOf(rows);
    expect(decideSnapshotWrite({ rows, rawBuf: raw, prevBuf: raw }).action).toBe("unchanged");
  });

  // 比对的是**解压后**的内容：不同 gzip 实现（CI 的 zlib / 本机 .NET GZipStream，
  // 以及同一实现的不同压缩级别）对同一份输入产出的字节不同，按 gzip 字节比对的话，
  // 500KB 二进制会每天进一次 git 历史。所以 exportModsSnapshot 先 gunzip 再交给这里。
  it("gzip 字节不同但内容相同 → 仍判 unchanged", () => {
    const rows = rowsOf(100);
    const ciStyle = gzipSync(rawOf(rows), { level: 6 });
    const localStyle = gzipSync(rawOf(rows), { level: 9 });
    expect(ciStyle.equals(localStyle)).toBe(false);

    expect(gunzipSync(localStyle).equals(gunzipSync(ciStyle))).toBe(true);
    expect(decideSnapshotWrite({ rows, rawBuf: gunzipSync(localStyle), prevBuf: gunzipSync(ciStyle) }).action).toBe(
      "unchanged",
    );
  });

  it("行数低于旧快照的 90% → 拒绝写出，理由里带两个数字", () => {
    const rows = rowsOf(50);
    const decision = decideSnapshotWrite({ rows, rawBuf: rawOf(rows), prevBuf: rawOf(rowsOf(100)) });
    expect(decision.action).toBe("reject");
    expect(decision.reason).toContain("50");
    expect(decision.reason).toContain("100");
  });

  it("行数刚好等于 90% 的边界 → 写出（不是拒绝）", () => {
    const rows = rowsOf(90);
    expect(decideSnapshotWrite({ rows, rawBuf: rawOf(rows), prevBuf: rawOf(rowsOf(100)) }).action).toBe("write");
  });

  it("比例可覆盖（minRatio 参数生效）", () => {
    const rows = rowsOf(50);
    expect(
      decideSnapshotWrite({ rows, rawBuf: rawOf(rows), prevBuf: rawOf(rowsOf(100)), minRatio: 0.4 }).action,
    ).toBe("write");
  });

  // 旧快照损坏不能反过来把新导出也一起拒绝掉 —— 那会让快照永远停在坏文件上。
  it("旧快照损坏（不是合法 gzip+JSON）→ 照样写出", () => {
    const rows = rowsOf(100);
    const corrupt = Buffer.from("这不是 gzip", "utf8");
    expect(decideSnapshotWrite({ rows, rawBuf: rawOf(rows), prevBuf: corrupt }).action).toBe("write");
  });

  it("默认比例是 0.9", () => {
    expect(SNAPSHOT_MIN_RATIO).toBe(0.9);
  });
});

describe("normalizeRawSnapshot", () => {
  // Windows 的 psql 用文本模式写 -o，结尾 \n 变成 \r\n；CI（Linux）是 \n。
  // 不归一化的话，本地每次导出都与 CI 那份差一个字节 ⇒ unchanged 判定永远不成立。
  it("结尾的 \\r\\n 归一成 \\n", () => {
    expect(normalizeRawSnapshot(Buffer.from("[1]\r\n", "utf8")).toString("utf8")).toBe("[1]\n");
  });

  it("本来就是 \\n 时原样返回（不复制、不改写）", () => {
    const buf = Buffer.from("[1]\n", "utf8");
    expect(normalizeRawSnapshot(buf)).toBe(buf);
  });

  it("没有结尾换行时原样返回", () => {
    const buf = Buffer.from("[1]", "utf8");
    expect(normalizeRawSnapshot(buf)).toBe(buf);
  });

  it("只动结尾那一处，正文里的转义序列不受影响", () => {
    const raw = '["a\\r\\nb", "中\\n文"]\r\n';
    expect(normalizeRawSnapshot(Buffer.from(raw, "utf8")).toString("utf8")).toBe('["a\\r\\nb", "中\\n文"]\n');
  });

  // 归一化后本地与 CI 的字节一致，才谈得上「内容没变就不重写」
  it("Windows 导出与 CI 导出归一化后逐字节相同 → unchanged", () => {
    const rows = rowsOf(100);
    const ciRaw = rawOf(rows); // 已经以 \n 结尾
    // Windows 的文本模式是把 \n 落成 \r\n（不是再追加一个），所以是替换
    const winRaw = Buffer.from(ciRaw.toString("utf8").replace(/\n$/, "\r\n"), "utf8");
    expect(winRaw.equals(ciRaw)).toBe(false);
    expect(
      decideSnapshotWrite({
        rows,
        rawBuf: normalizeRawSnapshot(winRaw),
        prevBuf: normalizeRawSnapshot(ciRaw),
      }).action,
    ).toBe("unchanged");
  });
});

describe("putSnapshotToCos", () => {
  const makeCos = (cb) => ({ putObject: vi.fn((params, callback) => cb(params, callback)) });

  it("只设 ContentType，绝不设 ContentEncoding，Body 原样是 Buffer", async () => {
    const cos = makeCos((params, cb) => cb(null, {}));
    const body = gzipSync(Buffer.from("[]", "utf8"));
    const result = await putSnapshotToCos({
      cos,
      bucket: "wave-mod-preview-1327973389",
      region: "ap-guangzhou",
      body,
      log: () => {},
    });

    const params = cos.putObject.mock.calls[0][0];
    expect(params.Key).toBe(SNAPSHOT_OBJECT_KEY);
    expect(params.Bucket).toBe("wave-mod-preview-1327973389");
    expect(params.Region).toBe("ap-guangzhou");
    expect(params.ContentType).toBe("application/gzip");
    // 设了 ContentEncoding: gzip 的话，平台 fetch 会自动解压，前台按 gzip 解必然失败
    expect(params.ContentEncoding).toBeUndefined();
    expect(params.Body).toBe(body);

    expect(result.objectKey).toBe(SNAPSHOT_OBJECT_KEY);
    expect(result.url).toBe(
      "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/snapshots/mods-snapshot.json.gz",
    );
  });

  it("COS 报错时抛错（调用方决定是否只告警）", async () => {
    const cos = makeCos((_params, cb) => cb(new Error("AccessDenied")));
    await expect(
      putSnapshotToCos({ cos, bucket: "b", region: "r", body: Buffer.alloc(1), log: () => {} }),
    ).rejects.toThrow(/AccessDenied/);
  });

  it("对象键可覆盖", async () => {
    const cos = makeCos((_params, cb) => cb(null, {}));
    await putSnapshotToCos({ cos, bucket: "b", region: "r", body: Buffer.alloc(1), objectKey: "x/y.gz", log: () => {} });
    expect(cos.putObject.mock.calls[0][0].Key).toBe("x/y.gz");
  });
});

describe("buildSnapshotCosUrl", () => {
  it("拼出公开直读地址（bucket 带 appid 后缀）", () => {
    expect(buildSnapshotCosUrl({ bucket: "wave-mod-preview-1327973389", region: "ap-guangzhou" })).toBe(
      "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/snapshots/mods-snapshot.json.gz",
    );
  });
});

describe("notifyRevalidate", () => {
  it("缺密钥时不发请求，只告警", async () => {
    const fetchImpl = vi.fn();
    const warn = vi.fn();
    const ok = await notifyRevalidate({ siteUrl: "https://x", secret: "", fetchImpl, warn, log: () => {} });
    expect(ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("POST 到 /api/revalidate 并带上密钥头", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const ok = await notifyRevalidate({ siteUrl: "https://x", secret: "s3cret", fetchImpl, log: () => {}, warn: () => {} });
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x/api/revalidate");
    expect(init.method).toBe("POST");
    expect(init.headers["x-revalidate-secret"]).toBe("s3cret");
  });

  it("接口被拒 → 返回 false 且不抛（写库已经成功，不该看起来像失败）", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" }));
    const warn = vi.fn();
    const ok = await notifyRevalidate({ siteUrl: "https://x", secret: "bad", fetchImpl, warn, log: () => {} });
    expect(ok).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toContain("401");
  });

  it("网络异常 → 返回 false 且不抛", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(
      notifyRevalidate({ siteUrl: "https://x", secret: "s", fetchImpl, warn: () => {}, log: () => {} }),
    ).resolves.toBe(false);
  });
});
