/**
 * 探针：用 UTF-8 原文 key 读 火花v1.1 的 COS 对象，并测公共 URL 两种编码。
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const B = process.env.COS_BUCKET, R = process.env.COS_REGION;
const KEY = "mods/aemeath/A_clear_png/爱弥斯-火花v1.1.png";
console.log(`key(utf8)=${KEY}\n`);

async function ds_conv(ms){return new Promise(r=>setTimeout(r,ms));}

// 1) headObject UTF-8 key
try {
  const h = await new Promise((res, rej) => cos.headObject({ Bucket: B, Region: R, Key: KEY }, (e, d) => e ? rej(new Error(e.message)) : res(d)));
  console.log("headObject(utf8) OK:", JSON.stringify({ len: h.headers?.ContentLength ?? h.headers?.["content-length"], type: h.headers?.ContentType ?? h.headers?.["content-type"] }));
} catch (e) {
  console.log("headObject(utf8) FAIL:", e.message);
}

// 2) headObject URL-encoded key（再确认）
const KEYENC = "mods/aemeath/A_clear_png/%E7%88%B1%E5%BC%A5%E6%96%AF-%E7%81%AB%E8%8A%B1v1.1.png";
try {
  const h = await new Promise((res, rej) => cos.headObject({ Bucket: B, Region: R, Key: KEYENC }, (e, d) => e ? rej(new Error(e.message)) : res(d)));
  console.log("headObject(url-encoded) OK, len:", h.headers?.ContentLength ?? h.headers?.["content-length"]);
} catch (e) {
  console.log("headObject(url-encoded) FAIL:", e.message);
}

// 3) getObject UTF-8 key（绕公共CDN拉取全量）
try {
  const t0 = Date.now();
  const g = await new Promise((res, rej) => cos.getObject({ Bucket: B, Region: R, Key: KEY }, (e, d) => e ? rej(new Error(e.message)) : res(d)));
  const buf = Buffer.isBuffer(g.Body) ? g.Body : Buffer.from(g.Body);
  console.log(`getObject(utf8) OK: ${(buf.byteLength/1048576).toFixed(2)}MB in ${((Date.now()-t0)/1000).toFixed(1)}s  head=${(buf.subarray(0,8).toString("hex"))}`);
} catch (e) {
  console.log("getObject(utf8) FAIL:", e.message);
}

// 4) 公共 URL：UTF-8 原文 vs 百分号编码
for (const [label, url] of [
  ["公共URL(百分号编码)", `https://${B}.cos.${R}.myqcloud.com/mods/aemeath/A_clear_png/%E7%88%B1%E5%BC%A5%E6%96%AF-%E7%81%AB%E8%8A%B1v1.1.png`],
  ["公共URL(UTF8原文)", `https://${B}.cos.${R}.myqcloud.com/${KEY}`],
]) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const b = await r.arrayBuffer();
    console.log(`${label}: ${r.status} ${(b.byteLength/1048576).toFixed(2)}MB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`${label}: ${e.name} ${e.message} (${(Date.now()-t0)/1000}s)`);
  }
}
console.log("\n完成。");
