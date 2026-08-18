import { config } from "dotenv";
import { resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
config({ path: resolve(process.cwd(), ".env.local"), override: true });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const bucket = process.env.COS_BUCKET;
const region = process.env.COS_REGION;
console.log("bucket:", bucket, "region:", region);

const keys = [
  "mods/katixiya/daa97514-e97f-471a-9e8a-e2def4600bd2/preview.webp",
  "mods/琳奈/dae6e3ee-d9f2-48e4-96b5-630ee97babff/preview.webp",
];
for (const key of keys) {
  try {
    const r = await new Promise((res) => cos.headObject({ Bucket: bucket, Region: region, Key: key }, (err, d) => res({ err, d })));
    if (r.err) console.log(`ERR ${key}: ${r.err.message ?? r.err}`);
    else console.log(`OK  ${key}: lm=${r.d.LastModified} len=${r.d.ContentLength}`);
  } catch (e) {
    console.log(`THROW ${key}: ${e.message}`);
  }
}
