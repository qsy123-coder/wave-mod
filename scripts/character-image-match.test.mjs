/**
 * 「按角色目录补/换预览图」匹配规则的单测。
 *
 * 这条链路的失败模式是**静默的**：把图挂到同名的另一行、或挂到别的版本上，
 * 脚本照常退出码 0，只有前台那张卡片悄悄换了图。所以逐条锁住。
 *
 * 用例里的名字都取自 2026-09-27 的 `补图/今汐` 与库内真实记录。
 */
import { describe, expect, it } from "vitest";

import { buildTitleIndex, matchRow, stripRenameSuffix, titleCandidates } from "./character-image-match.mjs";

describe("titleCandidates", () => {
  it("「今汐-」前缀的源图名，两个候选：完整 key 与剥前缀", () => {
    expect(titleCandidates("今汐", "今汐-A2 (左右切换）")).toEqual(["今汐-A2 (左右切换）", "A2 (左右切换）"]);
  });

  it("宽松剥离：角色名后不跟分隔符也照剥（对齐 2026-08-10 老批次的写法）", () => {
    // 库内真实记录 `今汐 | 皮肤[桃夭灼灼]-原版切换（上下右alt+下）by JR7`
    expect(titleCandidates("今汐", "今汐皮肤[桃夭灼灼]-原版切换（上下右alt+下）by JR7")).toEqual([
      "今汐皮肤[桃夭灼灼]-原版切换（上下右alt+下）by JR7",
      "皮肤[桃夭灼灼]-原版切换（上下右alt+下）by JR7",
    ]);
    // 「今汐特效修改-阿维斯之矛」同理剥成「特效修改-阿维斯之矛」
    expect(titleCandidates("今汐", "今汐特效修改-阿维斯之矛")).toContain("特效修改-阿维斯之矛");
  });

  it("不带角色前缀的源图名只有一个候选", () => {
    expect(titleCandidates("今汐", "A2 v1.1（【】）")).toEqual(["A2 v1.1（【】）"]);
  });

  it("剥完为空串的候选被丢弃（避免空 title 命中一片无关行）", () => {
    expect(titleCandidates("今汐", "今汐")).toEqual(["今汐"]);
    expect(titleCandidates("今汐", "今汐-")).toEqual(["今汐-"]);
  });

  it("尾侧重名后缀再退一步（源图 `xx (2).png` 对库里 `xx`）", () => {
    expect(titleCandidates("今汐", "今汐-泳装速羽 (2)")).toEqual([
      "今汐-泳装速羽 (2)",
      "泳装速羽 (2)",
      "今汐-泳装速羽",
      "泳装速羽",
    ]);
  });

  it("名字中间的括号不是重名后缀，不受影响", () => {
    expect(stripRenameSuffix("小卡-校园JK2.0（内附切换）")).toBe("小卡-校园JK2.0（内附切换）");
    expect(stripRenameSuffix("今汐-优诺2.0（90切换）")).toBe("今汐-优诺2.0（90切换）");
    expect(stripRenameSuffix("今汐-假日闲服（】切换）") ).toBe("今汐-假日闲服（】切换）");
  });
});

describe("matchRow", () => {
  const row = (id, character, title) => ({ id, character, title, images: [] });

  it("唯一命中才 ok", () => {
    const index = buildTitleIndex([row("1", "今汐", "A2 (左右切换）"), row("2", "今汐", "李素裳")]);
    expect(matchRow(index, "今汐", "今汐-A2 (左右切换）")).toMatchObject({ status: "ok", title: "A2 (左右切换）" });
    expect(matchRow(index, "今汐", "今汐-李素裳")).toMatchObject({ status: "ok", title: "李素裳" });
  });

  it("完全对不上返回 none，不猜", () => {
    const index = buildTitleIndex([row("1", "今汐", "李素裳")]);
    expect(matchRow(index, "今汐", "今汐-夜穿者")).toEqual({ status: "none" });
  });

  it("同名两行返回 ambiguous，绝不取第一条", () => {
    const index = buildTitleIndex([
      row("1", "今汐", "兔女郎"),
      row("2", "今汐", "兔女郎"),
    ]);
    const got = matchRow(index, "今汐", "今汐-兔女郎");
    expect(got.status).toBe("ambiguous");
    expect(got.hits.map((h) => h.row.id).sort()).toEqual(["1", "2"]);
  });

  it("两个候选各命中一行也算 ambiguous", () => {
    // 库里既有带前缀的旧写法、又有剥前缀的写法：这是同一 mod 的两个版本，
    // 挂哪一条都得先问人，不能凭候选顺序决定。
    const index = buildTitleIndex([
      row("1", "今汐", "今汐-A2"),
      row("2", "今汐", "A2"),
    ]);
    expect(matchRow(index, "今汐", "今汐-A2").status).toBe("ambiguous");
  });

  it("前缀恰好是另一行 title 的真前缀时不会误命中", () => {
    const index = buildTitleIndex([row("1", "今汐", "桃夭灼灼2.0"), row("2", "今汐", "桃夭灼灼")]);
    expect(matchRow(index, "今汐", "今汐-桃夭灼灼")).toMatchObject({ status: "ok", row: { id: "2" } });
  });

  it("matchRow 不做角色过滤 —— 角色范围必须由调用方先收紧", () => {
    // 库内真实存在 `夏空 | 今汐-桃夭灼灼 by 阿鲁提亚`：title 里带「今汐」但属于别的角色。
    // matchRow 只看 title，所以它**会**命中这条；主流程必须先用
    // `character = <本角色>` 把候选行收窄，再建索引。这里把这条边界钉住，
    // 免得日后有人图省事把全表索引传进来。
    const fullTable = buildTitleIndex([row("9", "夏空", "今汐-桃夭灼灼 by 阿鲁提亚")]);
    expect(matchRow(fullTable, "今汐", "今汐-桃夭灼灼 by 阿鲁提亚").status).toBe("ok");

    const onlyJinxi = buildTitleIndex([row("1", "今汐", "桃夭灼灼")]);
    expect(matchRow(onlyJinxi, "今汐", "今汐-桃夭灼灼").status).toBe("ok");
  });
});
