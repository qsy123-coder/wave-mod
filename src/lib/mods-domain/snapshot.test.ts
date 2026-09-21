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

import { SNAPSHOT_OBJECT_KEY } from "@/lib/mods-domain/snapshot";

const GAME_KEY = "wuthering-waves";

const BUNDLED_ROWS = [{ id: "bundled-1", game_key: GAME_KEY, title: "打包内那份" }];
const REMOTE_ROWS = [{ id: "remote-1", game_key: GAME_KEY, title: "COS 上那份" }];

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
  return import("@/lib/mods-domain/snapshot");
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

describe("getSnapshotRows：远程（COS）优先", () => {
  beforeEach(() => {
    process.env.COS_BUCKET = "wave-mod-preview-1327973389";
    process.env.COS_REGION = "ap-guangzhou";
  });

  it("远程有货就用远程的，且不去读打包内文件", async () => {
    const { getSnapshotRows } = await loadSnapshot();
    expect(await getSnapshotRows(GAME_KEY)).toEqual(REMOTE_ROWS);
    expect(readFile).not.toHaveBeenCalled();
  });

  // 这一行是排查「锁定期前台的数据到底哪来的」唯一要看的东西，
  // 所以它必须是 warn —— logger.info 在生产被 !isProduction 挡掉（src/lib/logger.ts:27-31）。
  it("载入远程快照时用 warn 留下痕迹（info 在生产看不见）", async () => {
    const { getSnapshotRows } = await loadSnapshot();
    await getSnapshotRows(GAME_KEY);
    expect(warnLines().some((line) => line.includes("已从远程快照"))).toBe(true);
  });

  it("只返回该 gameKey 的行", async () => {
    fetchMock.mockResolvedValue(
      responseOf(gz([...REMOTE_ROWS, { id: "other", game_key: "another-game" }])),
    );
    const { getSnapshotRows } = await loadSnapshot();
    expect(await getSnapshotRows(GAME_KEY)).toEqual(REMOTE_ROWS);
  });

  it("同一份 payload 只解码一次（memo 命中，不重复打载入日志）", async () => {
    const { getSnapshotRows } = await loadSnapshot();
    await getSnapshotRows(GAME_KEY);
    await getSnapshotRows(GAME_KEY);
    expect(warnCountOf("已从远程快照")).toBe(1);
  });

  it("远程返回 403 时回退打包内，并留下 warn", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) });
    const { getSnapshotRows } = await loadSnapshot();
    expect(await getSnapshotRows(GAME_KEY)).toEqual(BUNDLED_ROWS);
    expect(warnLines().some((line) => line.includes("远程快照不可用"))).toBe(true);
  });

  it("远程超时/网络异常时回退打包内", async () => {
    fetchMock.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    const { getSnapshotRows } = await loadSnapshot();
    expect(await getSnapshotRows(GAME_KEY)).toEqual(BUNDLED_ROWS);
  });

  // 坏对象（半截上传、传成明文、误设 Content-Encoding 被自动解压）不能进缓存、
  // 也不能当成数据用 —— 否则一次坏上传会固化一个 TTL，前台表现成「数据没了」。
  it("远程 payload 是明文 JSON（被自动解压）时回退打包内", async () => {
    fetchMock.mockResolvedValue(responseOf(Buffer.from(JSON.stringify(REMOTE_ROWS), "utf8")));
    const { getSnapshotRows } = await loadSnapshot();
    expect(await getSnapshotRows(GAME_KEY)).toEqual(BUNDLED_ROWS);
  });

  it("远程 payload 解出来是空数组时同样回退打包内", async () => {
    fetchMock.mockResolvedValue(responseOf(gz([])));
    const { getSnapshotRows } = await loadSnapshot();
    expect(await getSnapshotRows(GAME_KEY)).toEqual(BUNDLED_ROWS);
  });

  // 冷却的意义：COS 与 Supabase 同时挂掉时，不能每个请求都等满 5 秒超时 ——
  // 那会把降级从「内容停更」变成「整站卡死」。
  it("失败后进入冷却，第二次调用不再打网络", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const { getSnapshotRows } = await loadSnapshot();
    await getSnapshotRows(GAME_KEY);
    const callsAfterFirst = fetchMock.mock.calls.length;

    await getSnapshotRows(GAME_KEY);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(warnCountOf("远程快照不可用")).toBe(1);
  });

  it("冷却到期后会重新尝试远程（不会永久躺平）", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("boom"));
    const { getSnapshotRows } = await loadSnapshot();
    await getSnapshotRows(GAME_KEY);
    expect(fetchMock.mock.calls.length).toBe(1);

    vi.setSystemTime(Date.now() + 61_000);
    fetchMock.mockResolvedValue(responseOf(gz(REMOTE_ROWS)));
    expect(await getSnapshotRows(GAME_KEY)).toEqual(REMOTE_ROWS);
    expect(fetchMock.mock.calls.length).toBe(2);
  });
});

describe("getSnapshotRows：没有 COS 配置时", () => {
  it("不发网络请求，直接用打包内那份，且只告警一次", async () => {
    const { getSnapshotRows } = await loadSnapshot();
    expect(await getSnapshotRows(GAME_KEY)).toEqual(BUNDLED_ROWS);
    await getSnapshotRows(GAME_KEY);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnCountOf("未配置 COS_BUCKET")).toBe(1);
  });
});

describe("getSnapshotRows：两条来源都不可用时", () => {
  it("返回空数组而不抛（调用方按「没有数据」处理）", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    const { getSnapshotRows } = await loadSnapshot();
    await expect(getSnapshotRows(GAME_KEY)).resolves.toEqual([]);
  });

  // 原来的实现失败即 cachedRows = [] 永久生效，一次读盘失败会让这个实例
  // 在整个生命周期里都不再重试。改成冷却后才能自己恢复。
  it("读盘失败后进入冷却，冷却到期会重试（不再永久缓存空结果）", async () => {
    vi.useFakeTimers();
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    const { getSnapshotRows } = await loadSnapshot();
    await getSnapshotRows(GAME_KEY);
    await getSnapshotRows(GAME_KEY);
    expect(readFile).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 61_000);
    vi.mocked(readFile).mockResolvedValue(gz(BUNDLED_ROWS));
    expect(await getSnapshotRows(GAME_KEY)).toEqual(BUNDLED_ROWS);
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});

describe("对象键的真源", () => {
  // 对象键在 TS 侧和 scripts 侧各有一份（scripts 无法 import TS）。改一处忘了另一处，
  // 会表现成「上传成功了，但前台永远读不到」—— 静默失效，必须有用例挡住。
  it("src 与 scripts 两侧的对象键一致", () => {
    const scriptText = readFileSync(
      new URL("../../../scripts/mods-snapshot-export.mjs", import.meta.url),
      "utf8",
    );
    expect(scriptText).toContain(`"${SNAPSHOT_OBJECT_KEY}"`);
  });
});
