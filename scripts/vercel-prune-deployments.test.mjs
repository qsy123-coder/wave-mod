/**
 * Vercel 部署清理规则的单元测试。
 *
 * 这条脚本每天在 GitHub Actions 里真删东西，失败模式都是不可逆的：
 *
 * - 选择逻辑算错 ⇒ 把不该删的部署删了（虽然 30 天内可恢复，但旧直链会断）。
 * - 保护规则失效 ⇒ 一天爆发几十个部署时，把刚上线的版本一起卷走。
 *
 * 所以下面重点锁三件事：**保留最新 N 个**、**新部署不碰**、**构建中的不碰**。
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEEP,
  DEFAULT_MIN_AGE_DAYS,
  createdAtOf,
  parseArgs,
  selectDeploymentsToDelete,
} from "./vercel-prune-deployments.mjs";

const DAY = 24 * 60 * 60 * 1000;
/** 固定的“现在”，避免测试随真实时间漂移 */
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

/** 造一个部署；offsetDays 越大越旧 */
function makeDeployment(id, offsetDays, overrides = {}) {
  return {
    uid: `dpl_${id}`,
    createdAt: NOW - offsetDays * DAY,
    readyState: "READY",
    target: "production",
    meta: { githubCommitSha: "0123456789abcdef0123456789abcdef01234567", githubCommitMessage: `commit ${id}` },
    ...overrides,
  };
}

describe("createdAtOf", () => {
  it("兼容 v6 的 created 和 v13 的 createdAt", () => {
    expect(createdAtOf({ created: 1234 })).toBe(1234);
    expect(createdAtOf({ createdAt: 5678 })).toBe(5678);
  });

  it("缺失或非法值退回 0，不抛异常", () => {
    expect(createdAtOf({})).toBe(0);
    expect(createdAtOf({ createdAt: "not-a-number" })).toBe(0);
    expect(createdAtOf(null)).toBe(0);
  });
});

describe("selectDeploymentsToDelete · 基本保留策略", () => {
  it("保留最新 N 个，其余进待删", () => {
    const deployments = Array.from({ length: 5 }, (_, i) => makeDeployment(i, i + 5));
    const { kept, remove } = selectDeploymentsToDelete(deployments, { keep: 2, minAgeMs: 3 * DAY, now: NOW });

    expect(kept.map((d) => d.uid)).toEqual(["dpl_0", "dpl_1"]);
    expect(remove.map((d) => d.uid)).toEqual(["dpl_2", "dpl_3", "dpl_4"]);
  });

  it("输入乱序也按时间正确排序", () => {
    const deployments = [
      makeDeployment("old", 40),
      makeDeployment("new", 2),
      makeDeployment("mid", 20),
    ];
    const { kept, remove } = selectDeploymentsToDelete(deployments, { keep: 1, minAgeMs: 3 * DAY, now: NOW });

    expect(kept.map((d) => d.uid)).toEqual(["dpl_new"]);
    expect(remove.map((d) => d.uid)).toEqual(["dpl_mid", "dpl_old"]);
  });

  it("部署数不超过 keep 时一个都不删", () => {
    const deployments = Array.from({ length: 3 }, (_, i) => makeDeployment(i, i + 1));
    const { remove } = selectDeploymentsToDelete(deployments, { keep: 20, now: NOW });
    expect(remove).toEqual([]);
  });

  it("同一毫秒的部署用 uid 排序，结果稳定", () => {
    const a = makeDeployment("aaa", 10);
    const b = makeDeployment("bbb", 10);
    const { kept } = selectDeploymentsToDelete([b, a], { keep: 1, minAgeMs: 3 * DAY, now: NOW });
    // 时间相同按 uid 升序，所以 dpl_aaa 胜出
    expect(kept[0].uid).toBe("dpl_aaa");
  });

  it("keep 小于 1 直接报错，避免一删到底", () => {
    expect(() => selectDeploymentsToDelete([], { keep: 0, now: NOW })).toThrow(/keep/);
    expect(() => selectDeploymentsToDelete([], { keep: 1.5, now: NOW })).toThrow(/keep/);
  });
});

describe("selectDeploymentsToDelete · 安全保护", () => {
  it("min-age 内的部署即使超出 keep 也不删", () => {
    const deployments = [
      makeDeployment("fresh-1", 0.5),
      makeDeployment("fresh-2", 1),
      makeDeployment("fresh-3", 2),
    ];
    const { remove, skipped } = selectDeploymentsToDelete(deployments, {
      keep: 1,
      minAgeMs: 3 * DAY,
      now: NOW,
    });

    expect(remove).toEqual([]);
    expect(skipped.map((s) => s.deployment.uid)).toEqual(["dpl_fresh-2", "dpl_fresh-3"]);
  });

  it("构建中 / 排队中的部署不删", () => {
    const deployments = [
      makeDeployment("ready", 1),
      makeDeployment("building", 10, { readyState: "BUILDING" }),
      makeDeployment("queued", 11, { readyState: "QUEUED" }),
      makeDeployment("initializing", 12, { readyState: "INITIALIZING" }),
    ];
    const { remove, skipped } = selectDeploymentsToDelete(deployments, {
      keep: 1,
      minAgeMs: 3 * DAY,
      now: NOW,
    });

    expect(remove).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      "状态是 BUILDING，不动",
      "状态是 QUEUED，不动",
      "状态是 INITIALIZING，不动",
    ]);
  });

  it("ERROR / CANCELED 的旧部署可以删", () => {
    const deployments = [
      makeDeployment("new", 1),
      makeDeployment("errored", 10, { readyState: "ERROR", state: "ERROR" }),
      makeDeployment("canceled", 11, { readyState: "CANCELED", state: "CANCELED" }),
    ];
    const { remove } = selectDeploymentsToDelete(deployments, { keep: 1, minAgeMs: 3 * DAY, now: NOW });
    expect(remove.map((d) => d.uid)).toEqual(["dpl_errored", "dpl_canceled"]);
  });
});

describe("parseArgs", () => {
  it("默认值", () => {
    expect(parseArgs([])).toEqual({
      keep: DEFAULT_KEEP,
      minAgeDays: DEFAULT_MIN_AGE_DAYS,
      dryRun: false,
      help: false,
    });
  });

  it("解析 --keep / --min-age-days / --dry-run", () => {
    expect(parseArgs(["--keep=30", "--min-age-days=7", "--dry-run"])).toEqual({
      keep: 30,
      minAgeDays: 7,
      dryRun: true,
      help: false,
    });
  });

  it("--min-age-days=0 合法（想全删时用，但要显式写）", () => {
    expect(parseArgs(["--min-age-days=0"]).minAgeDays).toBe(0);
  });

  it("非法值报错", () => {
    expect(() => parseArgs(["--keep=0"])).toThrow(/keep/);
    expect(() => parseArgs(["--keep=abc"])).toThrow(/keep/);
    expect(() => parseArgs(["--min-age-days=-1"])).toThrow(/min-age-days/);
    expect(() => parseArgs(["--nope"])).toThrow(/未知参数/);
  });
});
