/**
 * COS 对象键反推的单测。
 *
 * 失败模式是静默的：算错键 → 覆盖到别的对象，或传上去但前台读的还是旧键，
 * putObject 都会返回 200。所以边界逐条钉住。
 */
import { describe, expect, it } from "vitest";

import {
  encodeFormatForKey,
  isAsciiOnly,
  isCosBucketUrl,
  isImageObjectKey,
  parseCosObjectKey,
} from "./cos-object-key.mjs";

const BUCKET = "wavemod-1250000000";
const BASE = `https://${BUCKET}.cos.ap-northeast-2.myqcloud.com`;

describe("isCosBucketUrl", () => {
  it("本桶的地址返回 true", () => {
    expect(isCosBucketUrl(`${BASE}/mods/ui/a.webp`, BUCKET)).toBe(true);
  });

  it("别的桶返回 false", () => {
    expect(isCosBucketUrl(`https://other-125.cos.ap-northeast-2.myqcloud.com/a.webp`, BUCKET)).toBe(
      false
    );
  });

  it("没有路径分隔符时返回 false；主机后面只有斜杠时主机本身仍是合法的", () => {
    expect(isCosBucketUrl(`${BASE}`, BUCKET)).toBe(false);
    expect(isCosBucketUrl(`${BASE}/`, BUCKET)).toBe(true); // 空 key 由 parseCosObjectKey 拒
  });

  it("http（非 https）不放行", () => {
    expect(isCosBucketUrl(`http://${BUCKET}.cos.ap-northeast-2.myqcloud.com/a.webp`, BUCKET)).toBe(
      false
    );
  });

  it("主机段不以 .myqcloud.com 结尾的不放行（防前缀伪装）", () => {
    const spoof = `https://${BUCKET}.cos.ap-northeast-2.myqcloud.com.evil.test/a.webp`;
    expect(isCosBucketUrl(spoof, BUCKET)).toBe(false);
  });
});

describe("parseCosObjectKey", () => {
  it("取出 key", () => {
    expect(parseCosObjectKey(`${BASE}/mods/ui/abc/preview.webp`, BUCKET)).toBe(
      "mods/ui/abc/preview.webp"
    );
  });

  it("带查询串的地址返回 null（渲染层拼的 imageMogr2 不是键的一部分）", () => {
    expect(parseCosObjectKey(`${BASE}/mods/ui/a.webp?imageMogr2/thumbnail/800x%3E`, BUCKET)).toBe(
      null
    );
  });

  it("带 fragment 的地址返回 null", () => {
    expect(parseCosObjectKey(`${BASE}/mods/ui/a.webp#x`, BUCKET)).toBe(null);
  });

  it("百分号编码的中文键会被还原成 UTF-8 原文", () => {
    const encoded = `${BASE}/mods/%E5%8D%A1%E6%8F%90%E5%B8%8C%E5%A8%85/a.webp`;
    expect(parseCosObjectKey(encoded, BUCKET)).toBe("mods/卡提希娅/a.webp");
  });

  it("中文键本身就是原文时原样返回", () => {
    expect(parseCosObjectKey(`${BASE}/mods/卡提希娅/a.webp`, BUCKET)).toBe("mods/卡提希娅/a.webp");
  });

  it("非本桶 / 非字符串 / 尾斜杠都返回 null", () => {
    expect(parseCosObjectKey("https://example.com/a.webp", BUCKET)).toBe(null);
    expect(parseCosObjectKey(null, BUCKET)).toBe(null);
    expect(parseCosObjectKey(`${BASE}/mods/`, BUCKET)).toBe(null);
  });

  it("非法百分号序列返回 null（不返回半解码的键）", () => {
    expect(parseCosObjectKey(`${BASE}/mods/%E0%A4%A/a.webp`, BUCKET)).toBe(null);
  });

  it("前后空格会被裁掉", () => {
    expect(parseCosObjectKey(`  ${BASE}/mods/a.webp  `, BUCKET)).toBe("mods/a.webp");
  });
});

describe("isImageObjectKey", () => {
  it("常见图片扩展名放行", () => {
    for (const key of ["a.webp", "a.PNG", "a.jpg", "a.jpeg", "a.gif"]) {
      expect(isImageObjectKey(key)).toBe(true);
    }
  });

  it("其它扩展名拒绝（防把 json/html 换掉）", () => {
    for (const key of ["a.json", "a.html", "a.webp.bak", ""]) {
      expect(isImageObjectKey(key)).toBe(false);
    }
  });
});

describe("encodeFormatForKey", () => {
  it("按扩展名决定编码，避免 Content-Type 与扩展名不符", () => {
    expect(encodeFormatForKey("a.png")).toBe("png");
    expect(encodeFormatForKey("a.JPG")).toBe("jpeg");
    expect(encodeFormatForKey("a.jpeg")).toBe("jpeg");
    expect(encodeFormatForKey("a.webp")).toBe("webp");
    expect(encodeFormatForKey("a.gif")).toBe("webp");
  });
});

describe("isAsciiOnly", () => {
  it("中文 URL 判为非 ASCII（应改用 --url-file）", () => {
    expect(isAsciiOnly(`${BASE}/mods/卡提希娅/a.webp`)).toBe(false);
  });

  it("纯 ASCII URL 判为可安全入参", () => {
    expect(isAsciiOnly(`${BASE}/mods/ui/a.webp`)).toBe(true);
  });
});
