import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// 把 unstable_cache 短路成「原样返回函数体」：Data Cache 在测试进程里不存在，
// 这个文件要验的是它**上面和下面**的东西 —— 回退顺序、进程内 memo、失败冷却。
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

import { readFile } from "node:fs/promises";

import { GAMEBANANA_SNAPSHOT_OBJECT_KEY } from "@/lib/gamebanana-domain/snapshot";

const BUNDLED_ROWS = [{ gb_id: 1, title: "打包内那份", character: "清宵" }];
const REMOTE_ROWS = [{ gb_id: 2, title: "COS 上那份", character: "千咲" }];

const gz = (rows: unknown) => gzipSync(Buffer.from(JSON.stringify(rows), "utf8"));

const responseOf = (body: Buffer) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => body,
});

let fetchMock: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

const warnLines = (): string[] => warnSpy.mock.calls.map((call: unknown[]) => String(call[0]));
const warnCountOf = (needle: string) =>
  warnLines().filter((line: string) => line.includes(needle)).length;

/**
 * 模块级 memo / 冷却 / 告警 flag 都是「一个实例一次」的状态，
 * 用例之间不 resetModules 就会串场 —— 这是本文件唯一需要小心的地方。
 */
async function loadSnapshot() {
  vi.resetModules();
  return import("@/lib/gamebanana-domain/snapshot");
}

beforeEach(() => {
  delete process.env.COS_BUCKET;
  delete process.env.COS_REGION;

  fetchMock = vi.fn(async () => responseOf(gz(REMOTE_ROWS)));
  vi.stubGlobal("fetch", fetchMock);

  // 必须显式清：readFile 来自模块工厂，vi.resetModules() 不会重建它，
  // 全局的 restoreMocks 也不清它的调用历史 —— 不然后一个用例会累加上前一个的调用次数。
  vi.mocked(readFile).mockReset();
  vi.mocked(readFile).mockResolvedValue(gz(BUNDLED_ROWS));

  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getGamebananaSnapshotRows：远程（COS）优先", () => {
  beforeEach(() => {
    process.env.COS_BUCKET = "wave-mod-preview-1327973389";
    process.env.COS_REGION = "ap-guangzhou";
  });

  it("远程有货就用远程的，且不去读打包内文件", async () => {
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    expect(await getGamebananaSnapshotRows()).toEqual(REMOTE_ROWS);
    expect(readFile).not.toHaveBeenCalled();
  });

  // 这一行是排查「锁定期 /gamebanana 的数据到底哪来的」唯一要看的东西，
  // 所以它必须是 warn —— logger.info 在生产被 !isProduction 挡掉。
  it("载入远程快照时用 warn 留下痕迹，且带上 [gamebanana] 前缀", async () => {
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    await getGamebananaSnapshotRows();
    expect(warnLines().some((line) => line.includes("已从远程快照"))).toBe(true);
    expect(warnLines().some((line) => line.includes("[gamebanana]"))).toBe(true);
  });

  // 与 mods 那份的关键差异：本表没有 game_key，整份快照都是鸣潮，一条都不该被过滤掉。
  it("不过滤 game_key（本表根本没有这一列，全量返回）", async () => {
    const rows = [
      { gb_id: 1, title: "A" },
      { gb_id: 2, title: "B" },
      { gb_id: 3, title: "C" },
    ];
    fetchMock.mockResolvedValue(responseOf(gz(rows)));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    expect(await getGamebananaSnapshotRows()).toEqual(rows);
  });

  it("同一份 payload 只解码一次（memo 命中，不重复打载入日志）", async () => {
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    await getGamebananaSnapshotRows();
    await getGamebananaSnapshotRows();
    expect(warnCountOf("已从远程快照")).toBe(1);
  });

  it("远程返回 403 时回退打包内，并留下 warn", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) });
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    expect(await getGamebananaSnapshotRows()).toEqual(BUNDLED_ROWS);
    expect(warnLines().some((line) => line.includes("远程快照不可用"))).toBe(true);
  });

  it("远程超时/网络异常时回退打包内", async () => {
    fetchMock.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    expect(await getGamebananaSnapshotRows()).toEqual(BUNDLED_ROWS);
  });

  // 坏对象（半截上传、传成明文、误设 Content-Encoding 被自动解压）不能进缓存、
  // 也不能当成数据用 —— 否则一次坏上传会固化一个 TTL，前台表现成「数据没了」。
  it("远程 payload 是明文 JSON（被自动解压）时回退打包内", async () => {
    fetchMock.mockResolvedValue(responseOf(Buffer.from(JSON.stringify(REMOTE_ROWS), "utf8")));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    expect(await getGamebananaSnapshotRows()).toEqual(BUNDLED_ROWS);
  });

  it("远程 payload 解出来是空数组时同样回退打包内", async () => {
    fetchMock.mockResolvedValue(responseOf(gz([])));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    expect(await getGamebananaSnapshotRows()).toEqual(BUNDLED_ROWS);
  });

  // 冷却的意义：COS 与 Supabase 同时挂掉时，不能每个请求都等满 5 秒超时 ——
  // 那会把降级从「内容停更」变成「整站卡死」。
  it("失败后进入冷却，第二次调用不再打网络", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    await getGamebananaSnapshotRows();
    const callsAfterFirst = fetchMock.mock.calls.length;

    await getGamebananaSnapshotRows();
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(warnCountOf("远程快照不可用")).toBe(1);
  });

  it("冷却到期后会重新尝试远程（不会永久躺平）", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("boom"));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    await getGamebananaSnapshotRows();
    expect(fetchMock.mock.calls.length).toBe(1);

    vi.setSystemTime(Date.now() + 61_000);
    fetchMock.mockResolvedValue(responseOf(gz(REMOTE_ROWS)));
    expect(await getGamebananaSnapshotRows()).toEqual(REMOTE_ROWS);
    expect(fetchMock.mock.calls.length).toBe(2);
  });
});

describe("getGamebananaSnapshotRows：没有 COS 配置时", () => {
  it("不发网络请求，直接用打包内那份，且只告警一次", async () => {
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    expect(await getGamebananaSnapshotRows()).toEqual(BUNDLED_ROWS);
    await getGamebananaSnapshotRows();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnCountOf("未配置 COS_BUCKET")).toBe(1);
  });

  // 与 mods 那份对称的一条：打包内文件名是构造加载器时的参数，读错文件在别处看不出来。
  it("读的是 gamebanana 那一份文件，不是 mods 那份", async () => {
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    await getGamebananaSnapshotRows();

    const readPath = String(vi.mocked(readFile).mock.calls[0]?.[0]);
    expect(readPath).toContain("gamebanana-snapshot.json.gz");
  });
});

describe("getGamebananaSnapshotRows：两条来源都不可用时", () => {
  // 调用方（public.ts）据此把列表降级成空态并打 error —— 这里只要是空数组、别抛。
  it("返回空数组而不抛（调用方按「没有数据」处理）", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    await expect(getGamebananaSnapshotRows()).resolves.toEqual([]);
  });

  it("读盘失败后进入冷却，冷却到期会重试（不再永久缓存空结果）", async () => {
    vi.useFakeTimers();
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    const { getGamebananaSnapshotRows } = await loadSnapshot();
    await getGamebananaSnapshotRows();
    await getGamebananaSnapshotRows();
    expect(readFile).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 61_000);
    vi.mocked(readFile).mockResolvedValue(gz(BUNDLED_ROWS));
    expect(await getGamebananaSnapshotRows()).toEqual(BUNDLED_ROWS);
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});

describe("对象键与打包内路径的真源", () => {
  // 对象键在 TS 侧和 scripts 侧各有一份（scripts 无法 import TS）。改一处忘了另一处，
  // 会表现成「上传成功了，但前台永远读不到」—— 静默失效，必须有用例挡住。
  it("src 与 scripts 两侧的对象键一致", () => {
    const scriptText = readFileSync(
      new URL("../../../scripts/gamebanana-snapshot.mjs", import.meta.url),
      "utf8",
    );
    expect(scriptText).toContain(`"${GAMEBANANA_SNAPSHOT_OBJECT_KEY}"`);
  });

  // 这一份**必须**与 mods 那份用不同的对象键：共用键会让两边互相覆盖，
  // 表现成「banana 上传完，mods 的兜底数据变成香蕉」这种极难查的错位。
  it("与 mods 快照的对象键不相同", async () => {
    const { SNAPSHOT_OBJECT_KEY } = await import("@/lib/mods-domain/snapshot");
    expect(GAMEBANANA_SNAPSHOT_OBJECT_KEY).not.toBe(SNAPSHOT_OBJECT_KEY);
    expect(GAMEBANANA_SNAPSHOT_OBJECT_KEY).toContain("gamebanana");
  });
});
