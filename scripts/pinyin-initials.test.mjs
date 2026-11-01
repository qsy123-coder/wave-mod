import { describe, expect, it } from "vitest";

import { toPinyinInitials } from "./pinyin-initials.mjs";

describe("toPinyinInitials", () => {
  it("把真实 mod 名转成首字母，并保留版本号、标点与英文", () => {
    expect(toPinyinInitials("心(含大招)-绀星绮愿v1.1（0）by 辉映星辰允如光")).toBe(
      "x(hdz)-gxqyv1.1（0）by hyxcyrg",
    );
    expect(toPinyinInitials("心-点绛唇v2.4（内附切换）by PebbleRox")).toBe(
      "x-djcv2.4（nfqh）by PebbleRox",
    );
    expect(toPinyinInitials("心月狐-暗夜雌狐full（alt+6）")).toBe(
      "xyh-aychfull（alt+6）",
    );
  });

  it("只处理汉字，英文/数字/空格/扩展名原样保留", () => {
    expect(toPinyinInitials("心-OL.exe")).toBe("x-OL.exe");
    expect(toPinyinInitials("v1.1 (0) by JR7")).toBe("v1.1 (0) by JR7");
  });

  it("用户给的 103 个测试名里没有出现无法识别的字符", () => {
    const names = [
      "心(含大招)-丰汝肥屯服装全整合v2（【】下）",
      "心(含大招)-光芒四射（右边的shift+7890上下左右back）",
      "心(含大招)-月色红绸v1.1（ctrl+alt)by EnteleJiang",
      "心(含大招)-锚点恐慌莫尔福泳装",
      "心(含大招)-薇尔维特fix（0）",
      "心-朝颜淡v2（上下左右【】79，。）",
      "心-鎏金狐（789）by woju",
      "心-黑桃爱丽丝（【)",
      "心月狐-果体双形态full by KatTDev",
      "心（含大招）-朝颜淡（上下左右【】79，。）",
    ];

    for (const name of names) {
      const converted = toPinyinInitials(name);
      expect(converted).not.toContain("_");
      expect(converted).not.toMatch(/[㐀-鿿]/);
    }
  });
});
