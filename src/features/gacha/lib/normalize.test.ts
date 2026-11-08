import { describe, expect, it } from "vitest";

import { dedupeRecords, normalizeApiRows } from "./normalize";

describe("normalizeApiRows", () => {
  it("把接口中文行归一化，并按池名映射回数字 ID", () => {
    const result = normalizeApiRows(
      [
        {
          cardPoolType: "角色精准调谐",
          resourceId: 1001,
          qualityLevel: 5,
          resourceType: "角色",
          name: "测试角色",
          time: "2026-01-01 12:00:00",
        },
      ],
      "1",
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      poolType: "1",
      poolName: "角色精准调谐",
      resourceType: "role",
      qualityLevel: 5,
      order: 0,
    });
    expect(result.skipped).toBe(0);
    expect(result.unknownPoolRows).toBe(0);
  });

  it("池名无法识别时回退到请求时的池并计数", () => {
    const result = normalizeApiRows(
      [
        {
          cardPoolType: "未来的新池",
          resourceId: 2001,
          qualityLevel: 4,
          resourceType: "武器",
          name: "测试武器",
          time: "2026-01-01 12:00:00",
        },
      ],
      "2",
    );

    expect(result.records[0].poolType).toBe("2");
    expect(result.unknownPoolRows).toBe(1);
  });

  it("坏行被丢弃，不影响其他行", () => {
    const result = normalizeApiRows(
      [
        { name: "缺字段" },
        {
          cardPoolType: "角色精准调谐",
          resourceId: "1001",
          qualityLevel: 5,
          resourceType: "角色",
          name: "ID 类型错误",
          time: "2026-01-01 12:00:00",
        },
        {
          cardPoolType: "角色精准调谐",
          resourceId: 1001,
          qualityLevel: 9,
          resourceType: "角色",
          name: "品质非法",
          time: "2026-01-01 12:00:00",
        },
        {
          cardPoolType: "角色精准调谐",
          resourceId: 1001,
          qualityLevel: 5,
          resourceType: "角色",
          name: "正常行",
          time: "2026-01-01 12:00:00",
        },
      ],
      "1",
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0].name).toBe("正常行");
    expect(result.skipped).toBe(3);
  });

  it("非数组直接返回空结果", () => {
    expect(normalizeApiRows(null, "1")).toEqual({
      records: [],
      skipped: 0,
      unknownPoolRows: 0,
    });
  });

  it("缺失 resourceType 时按 ID 段位兜底", () => {
    const [role] = normalizeApiRows(
      [{ cardPoolType: "角色精准调谐", resourceId: 1001, qualityLevel: 5, name: "角色", time: "t" }],
      "1",
    ).records;
    const [weapon] = normalizeApiRows(
      [{ cardPoolType: "武器精准调谐", resourceId: 21010015, qualityLevel: 5, name: "武器", time: "t" }],
      "2",
    ).records;

    expect(role.resourceType).toBe("role");
    expect(weapon.resourceType).toBe("weapon");
  });
});

describe("dedupeRecords", () => {
  it("按 池 + 物品 + 时间 + 名字 去重", () => {
    const base = {
      poolType: "1",
      poolName: "角色精准调谐",
      resourceId: 1001,
      qualityLevel: 5 as const,
      resourceType: "role" as const,
      name: "测试角色",
      time: "2026-01-01 12:00:00",
      order: 0,
    };

    const records = dedupeRecords([base, { ...base, order: 3 }]);

    expect(records).toHaveLength(1);
  });

  it("不同池的同一件物品不会被合并", () => {
    const base = {
      poolName: "角色精准调谐",
      resourceId: 1001,
      qualityLevel: 5 as const,
      resourceType: "role" as const,
      name: "测试角色",
      time: "2026-01-01 12:00:00",
      order: 0,
    };

    const records = dedupeRecords([
      { ...base, poolType: "1" },
      { ...base, poolType: "3" },
    ]);

    expect(records).toHaveLength(2);
  });
});
