/**
 * 把互动计数从「单份 JSON」迁移到 COS 分片结构（engagement/v2/shard-<0..15>.json）。
 *
 * 线上计数器原本落在服务器本地 data/runtime/engagement.json（单文件全量状态）。
 * Vercel 无状态环境读不到这个文件，所以改成分片存储，见 src/lib/engagement/cos-store.ts。
 *
 * ⚠️ 分片哈希必须与 `src/lib/engagement/shard.ts` **逐字一致**：
 * 这里算错，数据会落进与线上读取不同的分片，表现为「计数凭空消失」。
 * 两边都改了要跑 `src/lib/engagement/shard.test.ts`（钉死了期望分片）。
 *
 * 用法：
 *   # 先在服务器上把当前文件拉下来（它就是权威状态）：
 *   #   scp ubuntu@host:/var/www/wave-mod/data/runtime/engagement.json .tmp-migrate/
 *   node scripts/migrate-engagement-to-cos.mjs --source=.tmp-migrate/engagement.json --dry-run
 *   node scripts/migrate-engagement-to-cos.mjs --source=.tmp-migrate/engagement.json
 *
 *   不带 --source 时读 COS 上旧的镜像 engagement/live.json（最多落后 5 分钟）。
 *   已存在的分片默认跳过；--force 覆盖。
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import COS from "cos-nodejs-sdk-v5";

config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const sourceArg = args.find((arg) => arg.startsWith("--source="));
const SOURCE = sourceArg ? resolve(process.cwd(), sourceArg.slice("--source=".length)) : null;

const BUCKET = process.env.COS_BUCKET?.trim();
const REGION = process.env.COS_REGION?.trim();
const SECRET_ID = process.env.COS_SECRET_ID?.trim();
const SECRET_KEY = process.env.COS_SECRET_KEY?.trim();

if (!BUCKET || !REGION || !SECRET_ID || !SECRET_KEY) {
  console.error("❌ 缺少 COS 环境变量：COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION");
  process.exit(1);
}

const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY, Timeout: 60000 });

/** ⚠️ 与 src/lib/engagement/shard.ts 的 ENGAGEMENT_SHARD_COUNT / engagementShardIndex 保持一致 */
const SHARD_COUNT = 16;

function shardIndex(modId) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < modId.length; i += 1) {
    hash ^= modId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % SHARD_COUNT;
}

const shardKey = (index) => `engagement/v2/shard-${index}.json`;

function headObject(key) {
  return new Promise((resolveHead) => {
    cos.headObject({ Bucket: BUCKET, Region: REGION, Key: key }, (err) => resolveHead(!err));
  });
}

function putJson(key, value) {
  return new Promise((resolvePut, rejectPut) => {
    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: Buffer.from(JSON.stringify(value), "utf8"),
        ContentType: "application/json",
        // 计数对象里有设备号，不能被公开桶匿名读到
        ACL: "private",
        CacheControl: "no-store",
      },
      (err) => (err ? rejectPut(new Error(err.message)) : resolvePut()),
    );
  });
}

function getJson(key) {
  return new Promise((resolveGet, rejectGet) => {
    cos.getObject({ Bucket: BUCKET, Region: REGION, Key: key }, (err, data) => {
      if (err) return rejectGet(new Error(err.message));
      resolveGet(JSON.parse(String(data.Body)));
    });
  });
}

async function loadSourceState() {
  if (SOURCE) {
    if (!existsSync(SOURCE)) throw new Error(`源文件不存在：${SOURCE}`);
    return JSON.parse(readFileSync(SOURCE, "utf8"));
  }

  const key = "engagement/live.json";
  const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`读取 ${url} 失败：HTTP ${res.status}`);
  return res.json();
}

function summarize(state) {
  const mods = Object.keys(state.mods ?? {});
  let likes = 0;
  let favorites = 0;
  let views = 0;

  for (const id of mods) {
    const entry = state.mods[id] ?? {};
    likes += entry.likedBy?.length ?? 0;
    favorites += entry.favoritedBy?.length ?? 0;
    views += entry.views ?? 0;
  }

  return { mods: mods.length, likes, favorites, views };
}

const source = await loadSourceState();
const totals = summarize(source);

if (!source || typeof source !== "object" || !source.mods) {
  console.error("❌ 源数据不是合法的 EngagementState");
  process.exit(1);
}

console.log(
  `📦 源状态：${totals.mods} 个资源 / 点赞 ${totals.likes} / 收藏 ${totals.favorites} / 浏览 ${totals.views}`,
);

const shards = Array.from({ length: SHARD_COUNT }, () => ({ version: 1, mods: {} }));

for (const [modId, entry] of Object.entries(source.mods)) {
  shards[shardIndex(modId)].mods[modId] = entry;
}

console.log(
  `🔪 分片分布：${shards.map((shard, index) => `${index}:${Object.keys(shard.mods).length}`).join(" ")}`,
);

let written = 0;
let skipped = 0;

for (let index = 0; index < SHARD_COUNT; index += 1) {
  const key = shardKey(index);
  const modCount = Object.keys(shards[index].mods).length;

  if (!FORCE && !DRY_RUN && (await headObject(key))) {
    skipped += 1;
    console.log(`   ⏭  ${key} 已存在（${modCount} 条），跳过`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`   → ${key}（${modCount} 条）`);
    continue;
  }

  await putJson(key, shards[index]);
  written += 1;
  console.log(`   ✅ ${key}（${modCount} 条）`);
}

if (DRY_RUN) {
  console.log("\n🔍 DRY-RUN：未写入。");
  process.exit(0);
}

// 回读校验：签名 GET 能读到、总量与源一致、匿名 GET 读不到
const merged = { version: 1, mods: {} };
for (let index = 0; index < SHARD_COUNT; index += 1) {
  const shard = await getJson(shardKey(index));
  Object.assign(merged.mods, shard.mods ?? {});
}

const check = summarize(merged);
const ok =
  check.mods === totals.mods &&
  check.likes === totals.likes &&
  check.favorites === totals.favorites &&
  check.views === totals.views;

console.log(
  `🔎 回读校验：${check.mods} 个资源 / 点赞 ${check.likes} / 收藏 ${check.favorites} / 浏览 ${check.views} → ${ok ? "一致 ✅" : "不一致 ❌"}`,
);

const anon = await fetch(`https://${BUCKET}.cos.${REGION}.myqcloud.com/${shardKey(0)}`);
console.log(`🔒 匿名访问：HTTP ${anon.status}${anon.status === 403 ? "（已私有 ✅）" : "（⚠️ 仍可公开读取）"}`);

console.log(`\n完成：写入 ${written} 片，跳过 ${skipped} 片`);
if (!ok) process.exitCode = 1;
