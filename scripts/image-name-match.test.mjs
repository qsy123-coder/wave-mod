import { describe, expect, it } from "vitest";

import { looseImageKey } from "./image-name-match.mjs";

describe("looseImageKey", () => {
  it("去掉命名工坊插在作者前的版本后缀", () => {
    expect(looseImageKey("心月狐-狐之月（Free） by Ceeji-1.jpg")).toBe("心月狐-狐之月");
    expect(looseImageKey("洛瑟菈-酒与花 3.6 贴图修正-2 by PebbleRox.jpg")).toBe(
      "洛瑟菈-酒与花 3.6 贴图修正",
    );
    expect(looseImageKey("UI-通用油亮质感贴图 mod_2-2 by neerajksah.jpg")).toBe(
      "ui-通用油亮质感贴图 mod_2",
    );
  });

  it("分享名没有后缀时和图片落到同一个键", () => {
    expect(looseImageKey("心月狐-狐之月 by Ceeji.exe")).toBe(
      looseImageKey("心月狐-狐之月（Free） by Ceeji-1.jpg"),
    );
    expect(looseImageKey("洛瑟菈-酒与花 3.6 贴图修正 by PebbleRox.exe")).toBe(
      looseImageKey("洛瑟菈-酒与花 3.6 贴图修正-2 by PebbleRox-1.jpg"),
    );
  });

  it("标题中段括号不被当成版本后缀", () => {
    expect(looseImageKey("绯雪-Hiyuki-Pure Serenade_绯雪-清光虔愿（3.5 texture fixed）-2 by PebbleRox.jpg")).toBe(
      "绯雪-hiyuki-pure serenade_绯雪-清光虔愿（3.5 texture fixed）",
    );
  });

  it("不同的模组不会因为去后缀而互相串名", () => {
    expect(looseImageKey("UI-通用油亮质感贴图 mod-3 by neerajksah.jpg")).not.toBe(
      looseImageKey("UI-通用油亮质感贴图 mod_2.exe"),
    );
  });
});
