/**
 * GameBanana → 站内角色 分类模块的单测。
 *
 * 为什么值得单独锁：这条链的失败模式**全是静默的**。
 *  - 落点不在 `characterImageMap` 里 ⇒ 前台角色分类页凭空长出一个空分类（CLAUDE.md 硬规则）；
 *  - 特例写在查表之后 ⇒ `Skins >> Cartethyia` 89 条整批糊成卡提希娅，大卡全丢，**不报错**；
 *  - 英文名匹配的边界正则写错 ⇒ 连写标题（`JianxinModify`）静默判不出；
 *  - `NPCs & Entities` 当入口短路 ⇒ 混在桶里的真角色 / 载具被吞掉。
 *
 * 用例里的 id 都是**真实记录**（来自 2026-09-28 的全量普查缓存），不是编的。
 * 每条都注明「错的时候会怎样」，方便日后改规则时判断能不能动。
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AEMEATH,
  AEMEATH_MECH,
  CARTETHYIA,
  FALLBACK_MISC,
  FALLBACK_UI,
  FLEURDELYS,
  NO_MAP_SUBCATEGORIES,
  SUBCATEGORY_MAP,
  VEHICLE_CATEGORY,
  VIA_UNRESOLVED,
  characterKeys,
  classify,
  isSpecificCharacter,
} from "./gamebanana-classify.mjs";

/** 简写：只关心落点 */
const charOf = (o) => classify(o).character;

describe("值域：落点必须 ∈ characterImageMap", () => {
  it("characterImageMap 读出来是 64 个 key（源文件结构变了要立刻发现）", () => {
    expect(characterKeys()).toHaveLength(64);
  });

  it("EN→CN 表 56 个子分类的每个落点都在值域内", () => {
    const keys = characterKeys();
    const bad = Object.entries(SUBCATEGORY_MAP).filter(([, cn]) => !keys.includes(cn));
    expect(bad).toEqual([]);
  });

  it("特例用的三个值也在值域内 —— 它们是写死在判定链里的，不经过映射表", () => {
    const keys = characterKeys();
    for (const v of [FLEURDELYS, CARTETHYIA, AEMEATH, AEMEATH_MECH, VEHICLE_CATEGORY]) {
      expect(keys, `${v} 不在 characterImageMap 里，落进库会让前台多一个分类页`).toContain(v);
    }
  });

  it("兜底分类也在值域内", () => {
    const keys = characterKeys();
    expect(keys).toContain(FALLBACK_MISC);
    expect(keys).toContain(FALLBACK_UI);
  });

  it("classify 对任何输入都只吐值域内的值，且**绝不为空**", () => {
    // 空落点会让入库时那列成 NULL，前台 filter 直接崩
    const keys = characterKeys();
    const fixtures = [
      { title: "", subcategory: "", rootCategory: "" },
      { title: "???", subcategory: "不存在的子分类", rootCategory: "Skins" },
      { title: "Thicc Hyvatia", subcategory: "NPCs & Entities", rootCategory: "Skins" },
      { title: "JianxinModify + Thicc", subcategory: "", rootCategory: "Skins" },
      { title: "Woju - Bumblebee Rider", subcategory: "", rootCategory: "Skins" },
    ];
    for (const f of fixtures) {
      const { character } = classify(f);
      expect(character, `「${f.title}」落到了 ${character}`).not.toBeNull();
      expect(keys, `「${f.title}」落到了值域外的 ${character}`).toContain(character);
    }
  });
});

describe("映射表与 docs/gamebanana-character-map.md 必须一致", () => {
  // 文档是给主理人看/签字的资产，代码是执行的那份。两份漂移 = 签字的那张表不作数。
  it("逐行对齐文档里的表格", () => {
    const md = readFileSync(new URL("../docs/gamebanana-character-map.md", import.meta.url), "utf8");
    const rows = [...md.matchAll(/^\| `([^`]+)` \| `([^`]+)` \| (\d+) \|/gm)].map((m) => ({
      sub: m[1],
      cn: m[2],
    }));
    expect(Object.fromEntries(rows.map((r) => [r.sub, r.cn]))).toEqual(SUBCATEGORY_MAP);
  });

  it("文档里不映射的那一行，代码里也明确列出来了", () => {
    expect(NO_MAP_SUBCATEGORIES).toEqual(["NPCs & Entities"]);
    for (const s of NO_MAP_SUBCATEGORIES) expect(SUBCATEGORY_MAP[s]).toBeUndefined();
  });
});

describe("统计陷阱：映射表本身给不出正确答案的两个", () => {
  it("`Qiuyuan` → 仇远。统计会答成千咲（多角色混搭 mod 污染共现），错的话仇远整批消失", () => {
    expect(charOf({ title: "Radiant Qiuyuan", subcategory: "Qiuyuan", rootCategory: "Skins" })).toBe(
      "仇远"
    );
    expect(SUBCATEGORY_MAP.Qiuyuan).toBe("仇远");
  });

  it("`Chisa` → 千咲（千咲真正的归属，别被 Qiuyuan 抢走）", () => {
    expect(charOf({ title: "Chisa千咲泳装", subcategory: "Chisa", rootCategory: "Skins" })).toBe("千咲");
  });

  it("`Yangyang: Xuanling` → 玄翎。别名展开会把它混成秧秧（它是秧秧的形态，站内独立分类）", () => {
    expect(charOf({ title: "Yangyang XuanLing barefoot SP秧秧裸足", subcategory: "Yangyang: Xuanling", rootCategory: "Skins" })).toBe(
      "玄翎"
    );
  });

  it("`Yangyang` → 秧秧（本体，不能被 Xuanling 那条抢走）", () => {
    expect(charOf({ title: "Yangyang Mod", subcategory: "Yangyang", rootCategory: "Skins" })).toBe("秧秧");
  });

  it("`Aalto` → 秋水。别再说「站内没有 Aalto」—— 秋水就是它", () => {
    expect(charOf({ title: "Aalto Thicc + Slightly Prettier", subcategory: "Aalto", rootCategory: "Skins" })).toBe(
      "秋水"
    );
  });
});

describe("特例必须排在子分类查表之前", () => {
  // 写反了 -> `Skins >> Cartethyia` 89 条整批落卡提希娅、`Skins >> Aemeath` 69 条整批落爱弥斯。
  // 表现是完全静默的：库里看着有数据，只是大卡和机甲两个分类空了。
  it("子分类是 Cartethyia、但标题点名 Fleurdelys ⇒ 芙露德莉斯", () => {
    expect(
      charOf({ title: "Bunnysuit Cartethyia + Reverse Fleurdelys", subcategory: "Cartethyia", rootCategory: "Skins" })
    ).toBe(FLEURDELYS);
    expect(
      charOf({ title: "Fat Fleurdelys & Cartethyia", subcategory: "Cartethyia", rootCategory: "Skins" })
    ).toBe(FLEURDELYS);
  });

  it("子分类是 Cartethyia、标题没点名 ⇒ 卡提希娅", () => {
    expect(charOf({ title: "Cartethyia Nyx NSFW", subcategory: "Cartethyia", rootCategory: "Skins" })).toBe(
      CARTETHYIA
    );
  });

  it("「大卡」中文标记同样触发特例", () => {
    expect(charOf({ title: "一直期待的大卡来啦~~", subcategory: "", rootCategory: "Skins" })).toBe(FLEURDELYS);
  });

  it("漏写的 `fuludelisi` / 截断的 `Fleur` 也算大卡", () => {
    expect(charOf({ title: "fuludelisi simple", subcategory: "", rootCategory: "Skins" })).toBe(FLEURDELYS);
    expect(charOf({ title: "Uncensored Fleur", subcategory: "NPCs & Entities", rootCategory: "Skins" })).toBe(
      FLEURDELYS
    );
  });

  it("子分类是 Aemeath、标题带机甲 ⇒ 爱弥斯的机甲", () => {
    expect(charOf({ title: "3.2LODFIX小爱机甲~AemeathMecha", subcategory: "", rootCategory: "Skins" })).toBe(
      AEMEATH_MECH
    );
    expect(charOf({ title: "Simple Thicc Ameath Exo", subcategory: "NPCs & Entities", rootCategory: "Skins" })).toBe(
      AEMEATH_MECH
    );
  });

  it("子分类是 Aemeath、标题没提机甲 ⇒ 爱弥斯本体", () => {
    expect(charOf({ title: "Aemeath-Rami 's present", subcategory: "Aemeath", rootCategory: "Skins" })).toBe(
      AEMEATH
    );
  });
});

describe("子分类 `NPCs & Entities` 只能当末位兜底", () => {
  // 它是个**混合桶**：实测 24 条里混着真角色、载具、立绘。当入口短路会静默吞掉它们。
  it("桶里的真角色要捞回来：`Baizhi's …` → 白芷", () => {
    expect(charOf({ title: "Baizhi's Smaller You'tan Familiar", subcategory: "NPCs & Entities", rootCategory: "Skins" })).toBe(
      "白芷"
    );
  });

  it("桶里的载具要捞回来（`Bike` / `摩托`）", () => {
    expect(charOf({ title: "Character Themed Bike (Itansha)", subcategory: "NPCs & Entities", rootCategory: "Skins" })).toBe(
      VEHICLE_CATEGORY
    );
    expect(charOf({ title: "摩托-幻彩虹翎(Aurora Spectrum Wings)-Num022", subcategory: "NPCs & Entities", rootCategory: "Other/Misc" })).toBe(
      VEHICLE_CATEGORY
    );
  });

  it("桶里的立绘归 UI", () => {
    expect(charOf({ title: "Gladiator's Portrait Thicc", subcategory: "NPCs & Entities", rootCategory: "Skins" })).toBe(
      FALLBACK_UI
    );
  });

  it("真 NPC 仍然落 Other/Misc（主理人口径不变）", () => {
    for (const title of ["Thicc Hyvatia", "Thicc Hecate", "Lorelei Uncensored", "Thicc N.A.N.A."]) {
      expect(charOf({ title, subcategory: "NPCs & Entities", rootCategory: "Skins" }), title).toBe(FALLBACK_MISC);
    }
  });
});

describe("英文名匹配的边界：放行连写，但挡住小写续写", () => {
  // `/[^a-z]/i` 里的 `i` 会让 `[^a-z]` 退化成「不是字母」，下面这 6 条真实记录就全都判不出（残差 59→48 的差）。
  it("CamelCase 连写要能匹配（名字后面直接跟大写）", () => {
    expect(charOf({ title: "JianxinModify + Thicc", subcategory: "", rootCategory: "Skins" })).toBe("鉴心");
    expect(charOf({ title: "YinlinModify + Thicc", subcategory: "", rootCategory: "Skins" })).toBe("吟霖");
    expect(charOf({ title: "JinhsiNoPants", subcategory: "", rootCategory: "Skins" })).toBe("今汐");
    expect(charOf({ title: "FeibiWhite dress", subcategory: "", rootCategory: "Skins" })).toBe("菲比");
  });

  it("名字前面被数字连写也要能匹配（`2LODGalbrena`）", () => {
    expect(charOf({ title: "3.2LOD恶魔大姐姐来了3.2LODGalbrena is coming.", subcategory: "", rootCategory: "Skins" })).toBe(
      "嘉贝莉娜"
    );
  });

  it("拼错的 `Calbrena` 是嘉贝莉娜的别名", () => {
    expect(charOf({ title: "CalbrenaChaopin", subcategory: "", rootCategory: "Skins" })).toBe("嘉贝莉娜");
  });

  it("拼音别名 `nvzhu`（女主）是女漂", () => {
    expect(charOf({ title: "nvzhu2.1npc", subcategory: "", rootCategory: "Skins" })).toBe("女漂");
  });

  it("**不能**匹配名字后面跟小写字母的伪命中（`Luminous` 里的 `Lumi`）", () => {
    // 灯灯的英文名是 Lumi，放行小写续写就会把 Luminous 整批错归成灯灯
    const { character } = classify({ title: "Luminous Veil", subcategory: "", rootCategory: "Skins" });
    expect(character).not.toBe("灯灯");
  });

  it("Lumi 本体照样认得出（子分类与标题两条路）", () => {
    expect(charOf({ title: "Lumi Mod", subcategory: "Lumi", rootCategory: "Skins" })).toBe("灯灯");
    expect(charOf({ title: "Lumi summer outfit", subcategory: "", rootCategory: "Skins" })).toBe("灯灯");
  });
});

describe("判定链的顺序与兜底", () => {
  it("子分类是最强信号：标题里另有别的角色名时，以子分类为准", () => {
    // 「Changli-Andoris|长离-安朵丝」这类多角色混搭标题，靠子分类锁定主角色
    expect(charOf({ title: "Changli-Andoris|长离-安朵丝", subcategory: "Changli", rootCategory: "Skins" })).toBe(
      "长离"
    );
  });

  it("没有子分类时退到标题中文名", () => {
    expect(charOf({ title: "珂莱塔黑丝睡衣-Carlotta-black stockings pajamas", subcategory: "", rootCategory: "Skins" })).toBe(
      "珂莱塔"
    );
  });

  it("中文名比英文名优先（同一标题两者都在时）", () => {
    expect(charOf({ title: "守岸人-花间舞 | Shorekeeper - HuaJianWu", subcategory: "", rootCategory: "Skins" })).toBe(
      "守岸人"
    );
  });

  it("载具规则排在武器规则前面（`Alpha's Motorbike` 不能被武器吃掉）", () => {
    expect(charOf({ title: "Alpha's Motorbike", subcategory: "", rootCategory: "Skins" })).toBe(VEHICLE_CATEGORY);
  });

  it("`Woju` 是**作者名**，绝不能被当成载具关键词", () => {
    // 全库 64 条以 `Woju` 开头：41 条角色换装 + **19 条武器 / 特效** + 4 条载具。
    // 有人看到残差里 4 条 `Woju - … Rider` 就想加 `woju` 关键词「修一下」——
    // 那会把这 19 条武器 / 特效整批错归进载具分类。这个用例就是拦这个的。
    expect(charOf({ title: "Woju - Trinity Shooter | Static Mist", subcategory: "", rootCategory: "Skins" })).toBe(
      FALLBACK_MISC
    );
    expect(
      charOf({ title: "Woju - 3in1 Glowing Scythes Replacing Red Spring", subcategory: "", rootCategory: "Skins" })
    ).toBe(FALLBACK_MISC);
    // 真正的载具靠 `glider` 抓到，不靠作者名
    expect(charOf({ title: "Woju - Fantasy Glider", subcategory: "", rootCategory: "Skins" })).toBe(VEHICLE_CATEGORY);
    // 角色换装照样走子分类，一个字都不用为作者改动
    expect(charOf({ title: "Woju - Shorekeeper Neko Maid", subcategory: "Shorekeeper", rootCategory: "Skins" })).toBe(
      "守岸人"
    );
  });

  it("武器投影 mod 落 Other/Misc（标题里不出现 weapon 这个词，靠武器名列表命中）", () => {
    expect(charOf({ title: "Woju - Emerald of Genesis", subcategory: "", rootCategory: "Skins" })).toBe(FALLBACK_MISC);
  });

  it("画质 / 工具类落 Other/Misc", () => {
    expect(charOf({ title: "Aumento de FPS", subcategory: "", rootCategory: "Skins" })).toBe(FALLBACK_MISC);
    expect(charOf({ title: "No Reload Mod Manager", subcategory: "", rootCategory: "Other/Misc" })).toBe(FALLBACK_MISC);
  });

  it("根分类兜底：GameBanana 自己的 UI / Other/Misc 划分直接沿用", () => {
    expect(charOf({ title: "Hi Friends", subcategory: "", rootCategory: "UI" })).toBe(FALLBACK_UI);
    expect(charOf({ title: "Hi Friends", subcategory: "", rootCategory: "Other/Misc" })).toBe(FALLBACK_MISC);
  });

  it("彻底判不出时落 Other/Misc 且带 `判不出` 标记（供报告摘出来人工看），不是 null", () => {
    const out = classify({ title: "Woju - Bumblebee Rider", subcategory: "", rootCategory: "Skins" });
    expect(out.character).toBe(FALLBACK_MISC);
    expect(out.via).toBe(VIA_UNRESOLVED);
  });

  it("via 永远非空，报告靠它分桶", () => {
    for (const f of [
      { title: "Changli X", subcategory: "Changli", rootCategory: "Skins" },
      { title: "珂莱塔 X", subcategory: "", rootCategory: "Skins" },
      { title: "???", subcategory: "", rootCategory: "" },
    ]) {
      expect(classify(f).via).toBeTruthy();
    }
  });
});

describe("isSpecificCharacter", () => {
  it("三个兜底分类与载具不算「具体角色」", () => {
    expect(isSpecificCharacter(FALLBACK_MISC)).toBe(false);
    expect(isSpecificCharacter(FALLBACK_UI)).toBe(false);
    expect(isSpecificCharacter(VEHICLE_CATEGORY)).toBe(false);
    expect(isSpecificCharacter("Skins")).toBe(false);
  });

  it("真角色与两个特例分类算", () => {
    for (const c of ["长离", "千咲", FLEURDELYS, CARTETHYIA, AEMEATH_MECH]) {
      expect(isSpecificCharacter(c), c).toBe(true);
    }
  });

  it("空值不算（防 NULL 进来算成具体角色，虚高归类率）", () => {
    expect(isSpecificCharacter(null)).toBe(false);
    expect(isSpecificCharacter(undefined)).toBe(false);
    expect(isSpecificCharacter("")).toBe(false);
  });
});
