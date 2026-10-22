/** 临时：列出 COS 上 mods/ 下的非 webp 对象，看能否按 mod id 对回在用记录（找可复用的高清源） */
import COS from "cos-nodejs-sdk-v5";
import { resolve } from "node:path";
import { config } from "dotenv";
import { psqlJson, requireDatabaseUrl } from "./psql-db.mjs";

config({ path: resolve(process.cwd(), ".env"), override: true, quiet: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true, quiet: true });
requireDatabaseUrl();

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID?.trim(),
  SecretKey: process.env.COS_SECRET_KEY?.trim(),
});
const Bucket = process.env.COS_BUCKET?.trim();
const Region = process.env.COS_REGION?.trim();

function listAll(prefix) {
  return new Promise((res, rej) => {
    const out = [];
    const next = (marker) => {
      cos.getBucket(
        { Bucket, Region, Prefix: prefix, Marker: marker, MaxKeys: 1000 },
        (err, data) => {
          if (err) return rej(err);
          for (const o of data.Contents ?? []) {
            out.push({ key: o.Key, size: Number(o.Size), modified: o.LastModified });
          }
          if (data.IsTruncated === "true" && data.NextMarker) next(data.NextMarker);
          else res(out);
        }
      );
    };
    next("");
  });
}

const objs = await listAll("mods/");
console.log("mods/ 下对象总数:", objs.length);

const nonWebp = objs.filter((o) => !/\.webp$/i.test(o.key) && /\.(png|jpe?g)$/i.test(o.key));
console.log("非 webp 图片对象:", nonWebp.length, "合计", (nonWebp.reduce((s, o) => s + o.size, 0) / 1024 / 1024).toFixed(1) + "MB");

const byModId = new Map();
for (const o of nonWebp) {
  const m = /^mods\/[^/]+\/([0-9a-f-]{36})\//i.exec(o.key);
  if (!m) continue;
  if (!byModId.has(m[1])) byModId.set(m[1], []);
  byModId.get(m[1]).push(o);
}
console.log("能解析出 mod id 的对象:", [...byModId.values()].reduce((n, a) => n + a.length, 0), "，涉及 mod:", byModId.size);

const ids = [...byModId.keys()];
const rows = [];
for (let i = 0; i < ids.length; i += 200) {
  const slice = ids.slice(i, i + 200);
  const json = await psqlJson(
    `select coalesce(json_agg(t), '[]'::json)::text from (
       select id, character, title, images[1] as img, created_at
       from mods where id = any(array[${slice.map((s) => `'${s}'`).join(",")}]::uuid[])) t`
  );
  rows.push(...(typeof json === "string" ? JSON.parse(json) : json));
}
console.log("其中仍在库内的 mod:", rows.length);

const list = rows.map((r) => ({
  ...r,
  files: byModId.get(r.id).map((o) => `${(o.size / 1024).toFixed(0)}KB ${o.key.split("/").pop()}`),
}));
list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
console.log("\n前 20 条：");
for (const r of list.slice(0, 20)) {
  console.log(`  ${String(r.created_at).slice(0, 10)} ${r.character} | ${r.title}\n      ${r.files.join(", ")}`);
}
console.log("\n库内 mod 年份分布:", Object.entries(list.reduce((a, r) => {
  const y = String(r.created_at).slice(0, 4); a[y] = (a[y] || 0) + 1; return a;
}, {})).map(([k, v]) => `${k}:${v}`).join(" "));
