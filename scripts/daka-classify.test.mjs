/**
 * 「大卡」批次分类规则的单测。
 *
 * 规则的失败模式是**静默的**：把 key 切成站内不存在的假分类，或往错的分类下插一条，
 * 前台只会多出一个莫名其妙的分类页，不会有任何报错。所以这里逐条锁住。
 */
import { describe, expect, it } from "vitest";

import {
  CARTETHYIA,
  FLEURDELYS,
  applyLegacyMigrationSnapshot,
  buildLegacyUpdateSql,
  legacyRowKey,
  migrateLegacyRow,
  refreshQuarkLink,
  resolveDakaTarget,
} from "./daka-classify.mjs";

describe("resolveDakaTarget", () => {
  it("「卡提希娅-大卡-*」归芙露德莉斯，title 去掉「卡提希娅-」", () => {
    expect(resolveDakaTarget("卡提希娅-大卡-兔女郎")).toEqual({
      character: FLEURDELYS,
      title: "大卡-兔女郎",
      fallback: false,
    });
  });

  it("只剥一段前缀，title 里后续的横杠/括号原样保留", () => {
    const key = "卡提希娅-大卡-时韵-自定义版（56上下左右【】0；‘。？切换）";
    expect(resolveDakaTarget(key)).toEqual({
      character: FLEURDELYS,
      title: "大卡-时韵-自定义版（56上下左右【】0；‘。？切换）",
      fallback: false,
    });
  });

  it("「大卡提希娅的剑-*」归芙露德莉斯，title 保留完整 key", () => {
    expect(resolveDakaTarget("大卡提希娅的剑-四种剑（=切换）")).toEqual({
      character: FLEURDELYS,
      title: "大卡提希娅的剑-四种剑（=切换）",
      fallback: false,
    });
  });

  it("「大卡提希娅的武器-*」同上", () => {
    expect(resolveDakaTarget("大卡提希娅的武器-屠龙宝刀 by woju")).toEqual({
      character: FLEURDELYS,
      title: "大卡提希娅的武器-屠龙宝刀 by woju",
      fallback: false,
    });
  });

  it("「卡提希娅玩偶-*」归卡提希娅，title 去掉「卡提希娅」", () => {
    expect(resolveDakaTarget("卡提希娅玩偶-云海妖精（左右切换） by 阿鲁提亚")).toEqual({
      character: CARTETHYIA,
      title: "玩偶-云海妖精（左右切换） by 阿鲁提亚",
      fallback: false,
    });
  });

  it("「卡提希娅的手偶-*」连「的」一起去掉", () => {
    expect(resolveDakaTarget("卡提希娅的手偶-岸漂团子 by b站守岸人")).toEqual({
      character: CARTETHYIA,
      title: "手偶-岸漂团子 by b站守岸人",
      fallback: false,
    });
  });

  it("「卡提希娅的草-*」同理", () => {
    expect(resolveDakaTarget("卡提希娅的草-按摩棒")).toEqual({
      character: CARTETHYIA,
      title: "草-按摩棒",
      fallback: false,
    });
  });

  it("其它形态按用户口径兜底归芙露德莉斯，且标记 fallback 供 dry-run 报警", () => {
    expect(resolveDakaTarget("千咲-蜜桃冰")).toEqual({
      character: FLEURDELYS,
      title: "千咲-蜜桃冰",
      fallback: true,
    });
  });

  it("「卡提希娅-非大卡-*」（如小卡）是语义冲突：报错停，不猜", () => {
    expect(() => resolveDakaTarget("卡提希娅-小卡-休闲服装2.0（内附切换）")).toThrow(/小卡/);
  });
});

describe("migrateLegacyRow", () => {
  it("全前缀 title 顺手对齐成「大卡-…」写法", () => {
    expect(
      migrateLegacyRow({ id: "id-1", title: "卡提希娅-大卡-神之御装（0）by woju" }),
    ).toEqual({
      id: "id-1",
      character: FLEURDELYS,
      title: "大卡-神之御装（0）by woju",
      description: "芙露德莉斯 大卡-神之御装（0）by woju MOD，夸克网盘下载。",
    });
  });

  it("已经是「大卡-…」写法的只改 character 与 description", () => {
    expect(migrateLegacyRow({ id: "id-2", title: "大卡-休闲服装" })).toEqual({
      id: "id-2",
      character: FLEURDELYS,
      title: "大卡-休闲服装",
      description: "芙露德莉斯 大卡-休闲服装 MOD，夸克网盘下载。",
    });
  });

  it("传新夸克链接时刷新 drive_links，迅雷那条留着", () => {
    const out = migrateLegacyRow(
      {
        id: "id-3",
        title: "大卡-休闲服装",
        drive_links: [
          { platform: "夸克网盘", url: "https://pan.quark.cn/s/old?pwd=OLD" },
          { platform: "迅雷网盘", url: "https://pan.xunlei.com/s/XL" },
        ],
      },
      { quarkUrl: "https://pan.quark.cn/s/new?pwd=NEW" }
    );
    expect(out.drive_links).toEqual([
      { platform: "夸克网盘", url: "https://pan.quark.cn/s/new?pwd=NEW" },
      { platform: "迅雷网盘", url: "https://pan.xunlei.com/s/XL" },
    ]);
  });

  it("不传新链接时 drive_links 原样保留（一旦变成 undefined，迁移语句会把迅雷链接清空）", () => {
    const links = [{ platform: "迅雷网盘", url: "https://pan.xunlei.com/s/XL" }];
    expect(migrateLegacyRow({ id: "id-4", title: "大卡-X", drive_links: links }).drive_links).toBe(
      links
    );
  });
});

describe("refreshQuarkLink", () => {
  it("只换夸克那条，其它平台顺序不变", () => {
    expect(
      refreshQuarkLink(
        [
          { platform: "迅雷网盘", url: "xl" },
          { platform: "夸克网盘", url: "old" },
        ],
        "new"
      )
    ).toEqual([
      { platform: "迅雷网盘", url: "xl" },
      { platform: "夸克网盘", url: "new" },
    ]);
  });

  it("库里没有夸克条目时追加一条", () => {
    expect(refreshQuarkLink([{ platform: "迅雷网盘", url: "xl" }], "new")).toEqual([
      { platform: "迅雷网盘", url: "xl" },
      { platform: "夸克网盘", url: "new" },
    ]);
  });

  it("drive_links 为空或缺字段时也能给出一条", () => {
    expect(refreshQuarkLink(undefined, "new")).toEqual([{ platform: "夸克网盘", url: "new" }]);
  });
});

describe("legacyRowKey", () => {
  it("迁移行能反查回本批 CSV 里的 key，用来比对夸克链接新旧", () => {
    expect(legacyRowKey("大卡-休闲服装")).toBe("卡提希娅-大卡-休闲服装");
    expect(legacyRowKey("卡提希娅-大卡-神之御装（0）by woju")).toBe(
      "卡提希娅-大卡-神之御装（0）by woju",
    );
  });
});

describe("applyLegacyMigrationSnapshot", () => {
  it("dry-run 的去重集合要按迁移后的写法算，否则这 3 条会被误报成新增", () => {
    const snapshot = [
      { character: CARTETHYIA, title: "大卡-休闲服装" },
      { character: CARTETHYIA, title: "小卡-曲线优美" },
    ];
    const migrated = applyLegacyMigrationSnapshot(snapshot, [
      { id: "id-2", title: "大卡-休闲服装" },
    ]);
    expect(migrated).toEqual([
      { character: FLEURDELYS, title: "大卡-休闲服装" },
      { character: CARTETHYIA, title: "小卡-曲线优美" },
    ]);
  });
});

describe("buildLegacyUpdateSql", () => {
  it("一次 update 改 4 列（含 drive_links），并回报影响行数", () => {
    const sql = buildLegacyUpdateSql([
      { id: "id-1", character: FLEURDELYS, title: "大卡-兔女郎", description: "d" },
    ]);
    expect(sql).toContain("update mods");
    expect(sql).toContain("set character = i.character");
    expect(sql).toContain("drive_links = i.drive_links");
    expect(sql).toContain("json_build_object('updated'");
    expect(sql).toContain("id-1");
  });

  it("空数组直接返回 null，调用方据此跳过写库", () => {
    expect(buildLegacyUpdateSql([])).toBeNull();
  });
});
