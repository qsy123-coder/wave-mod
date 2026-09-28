import { describe, expect, it } from "vitest";

import {
  GAMEBANANA_SNAPSHOT_OBJECT_KEY,
  GAMEBANANA_SNAPSHOT_REL_PATH,
  GAMEBANANA_SNAPSHOT_SQL_REL_PATH,
  publishGamebananaSnapshotBestEffort,
} from "./gamebanana-snapshot.mjs";
import { SNAPSHOT_OBJECT_KEY, SNAPSHOT_REL_PATH } from "./mods-snapshot-export.mjs";

describe("gamebanana 快照的身份常量", () => {
  it("对象键与打包内路径都与 mods 那份**不同**", () => {
    // 共用一个键会让两份快照互相覆盖，表现成「banana 上传完，mods 的兜底数据变成香蕉」——
    // 两边都不会报错，只会各读到对方的行。
    expect(GAMEBANANA_SNAPSHOT_OBJECT_KEY).not.toBe(SNAPSHOT_OBJECT_KEY);
    expect(GAMEBANANA_SNAPSHOT_REL_PATH).not.toBe(SNAPSHOT_REL_PATH);
    expect(GAMEBANANA_SNAPSHOT_OBJECT_KEY).toContain("gamebanana");
    expect(GAMEBANANA_SNAPSHOT_REL_PATH).toContain("gamebanana");
  });

  it("SQL 指向本表那一份，而不是 mods 的", () => {
    expect(GAMEBANANA_SNAPSHOT_SQL_REL_PATH).toBe("scripts/gamebanana-snapshot.sql");
  });
});

describe("publishGamebananaSnapshotBestEffort", () => {
  /**
   * 这是 sync-gamebanana.mjs 收尾调用的那个函数：缺配置时必须**返回 false 而不是抛** ——
   * 数据已经入库了，一次成功的写库不该因为没配 COS 而显示成失败。
   */
  it("缺 COS 环境变量时返回 false、只告警、不抛", async () => {
    // 显式清掉而不是假设测试进程里没有：本机 .env.local 里有这四个变量，
    // vitest 若有任何一处把它们加载进来，这条用例就会真的去连 COS。
    for (const name of ["COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"]) {
      delete process.env[name];
    }

    const warn = [];
    const ok = await publishGamebananaSnapshotBestEffort({
      databaseUrl: "postgres://x/y",
      warn: (line) => warn.push(String(line)),
      log: () => {},
    });

    expect(ok).toBe(false);
    expect(warn.join(" ")).toContain("跳过 GameBanana 兜底快照发布");
  });
});
