import { describe, expect, it } from "vitest";

import { looseImageKey, postGalleryKey } from "./image-name-match.mjs";

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

describe("postGalleryKey", () => {
  // 用例取自 2026-11-12 的 W-2026.11.12：17 张图里 6 张是各变体主图，
  // 另外 11 张标题相同、只有编号，属于整个帖子。
  it("同一帖子的变体主图和孤儿附加图落到同一个键", () => {
    const expected = postGalleryKey("女漂-星界调制器 by Alunoop.jpg");
    expect(expected).toBe("女漂-星界调制器 :: alunoop");
    expect(postGalleryKey("女漂-星界调制器 1 by Alunoop.jpg")).toBe(expected);
    expect(postGalleryKey("女漂-星界调制器 6 by Alunoop.jpg")).toBe(expected);
    expect(postGalleryKey("女漂-星界调制器 by Alunoop-7.jpg")).toBe(expected);
    expect(postGalleryKey("女漂-星界调制器 by Alunoop-10.jpg")).toBe(expected);
  });

  it("分享名与图片名也落到同一个键", () => {
    expect(postGalleryKey("女漂-星界调制器 3 by Alunoop.exe")).toBe(
      postGalleryKey("女漂-星界调制器 3 by Alunoop.jpg"),
    );
  });

  it("没有作者的图不算帖子级（返回 null）", () => {
    expect(postGalleryKey("夏空-校服-粉")).toBeNull();
    expect(postGalleryKey("UI-通用油亮质感贴图 mod_2")).toBeNull();
  });

  it("作者不同的同名图不会并到一起", () => {
    expect(postGalleryKey("女漂-星界调制器 1 by Alunoop.jpg")).not.toBe(
      postGalleryKey("女漂-星界调制器 1 by SomeoneElse.jpg"),
    );
  });

  it("中段括号属于标题，不参与削后缀", () => {
    expect(postGalleryKey("绯雪-Hiyuki-Pure Serenade_绯雪-清光虔愿（3.5 texture fixed） by PebbleRox.jpg")).toBe(
      "绯雪-hiyuki-pure serenade_绯雪-清光虔愿（3.5 texture fixed） :: pebblerox",
    );
  });
});
