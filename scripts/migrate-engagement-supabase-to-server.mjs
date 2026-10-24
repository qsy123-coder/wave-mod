#!/usr/bin/env node
/**
 * 把 Supabase 里的互动计数增量导出成「HK 计数服务」的 state.json。
 *
 * 背景：2026-10-24 Supabase 免费出口额度再次耗尽，REST/Auth 全站 402，计数既读不到
 * 也写不进。计数搬回自己的香港反代机（deploy/hk-engagement/service.py）。
 *
 * 数据模型没有变，仍然是「基线 + 增量」：
 *   data/engagement-baseline.json（进 git，只读种子）
 * + state.json（本脚本的产物，落 HK 本地盘，定时镜像 COS）
 *
 * 导出内容：
 *   - engagement_totals 的 views / downloads → 增量计数
 *   - engagement_devices 的 liked/favorited → likedBy / favoritedBy / favoritedAt
 *   - 最近两天的 last_view_day / last_download_day → 当天的去重表
 *
 * ⚠️ 只在「切换前一刻」跑，导出后到切流之间的写入仍会落在 Supabase，切完就丢了。
 *    所以脚本最后会打印 totals 与 devices 重建出来的 likes/favorites 是否一致，
 *    不一致时用 `legacy-*` 合成设备补齐计数（否则切过去会少几个赞/收藏）。
 *
 * 用法：
 *   node scripts/migrate-engagement-supabase-to-server.mjs --out=.tmp-engagement-state.json
 *   # 然后 scp 到 HK: /var/lib/wavemod-engagement/state.json
 */

import { writeFileSync } from "node:fs";
import dotenv from "dotenv";

import { psqlJson } from "./psql-db.mjs";

dotenv.config({ path: ".env.local" });

const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith("--out="));
const OUT_PATH = outArg?.slice("--out=".length) || ".tmp-engagement-state.json";

const toCount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

/** 上海日历日（与 store-core.shanghaiDayKey 同口径） */
function shanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayBefore(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function emptyEntry() {
  return {
    likedBy: [],
    favoritedBy: [],
    favoritedAt: {},
    views: 0,
    viewDays: {},
    downloadDays: {},
    downloads: 0,
  };
}

const data = await psqlJson(`
select json_build_object(
  'totals', (
    select coalesce(json_agg(json_build_object(
      'mod_id', mod_id,
      'views', views,
      'likes', likes,
      'favorites', favorites,
      'downloads', downloads
    )), '[]'::json)
    from public.engagement_totals
  ),
  'devices', (
    select coalesce(json_agg(json_build_object(
      'mod_id', mod_id,
      'device_id', device_id,
      'liked', liked,
      'favorited', favorited,
      'favorited_at', favorited_at,
      'last_view_day', last_view_day,
      'last_download_day', last_download_day
    )), '[]'::json)
    from public.engagement_devices
  )
)::text;
`);

if (!data || !Array.isArray(data.totals) || !Array.isArray(data.devices)) {
  throw new Error("导出结果形状不对（totals/devices 不是数组）");
}

const today = shanghaiDayKey();
const yesterday = dayBefore(today);
const recentDays = new Set([today, yesterday]);

const mods = {};

function slot(modId) {
  mods[modId] ??= emptyEntry();
  return mods[modId];
}

for (const row of data.totals) {
  const entry = slot(row.mod_id);
  entry.views = toCount(row.views);
  entry.downloads = toCount(row.downloads);
}

let deviceLikes = 0;
let deviceFavorites = 0;

for (const row of data.devices) {
  const entry = slot(row.mod_id);
  const device = String(row.device_id);

  if (row.liked) {
    entry.likedBy.push(device);
    deviceLikes += 1;
  }

  if (row.favorited) {
    entry.favoritedBy.push(device);
    if (row.favorited_at) entry.favoritedAt[device] = String(row.favorited_at);
    deviceFavorites += 1;
  }

  // 只保留最近两天：更早的日期对「同设备同天去重」没有意义，
  // 带上只会让 state 无谓变大（与 pruneDayBuckets 的保留窗口一致）。
  if (row.last_view_day && recentDays.has(String(row.last_view_day))) {
    const day = String(row.last_view_day);
    (entry.viewDays[day] ??= []).push(device);
  }
  if (row.last_download_day && recentDays.has(String(row.last_download_day))) {
    const day = String(row.last_download_day);
    (entry.downloadDays[day] ??= []).push(device);
  }
}

const totalLikes = data.totals.reduce((sum, row) => sum + toCount(row.likes), 0);
const totalFavorites = data.totals.reduce((sum, row) => sum + toCount(row.favorites), 0);

/**
 * totals 是权威计数，devices 是明细。历史上有过「设备行被清理但总数保留」的情况
 * （例如基线时代的老赞），差额用合成设备补齐，保证切过去后总数一致。
 */
let synthetic = 0;
for (const row of data.totals) {
  const entry = mods[row.mod_id];
  const expectedLikes = toCount(row.likes);
  const expectedFavorites = toCount(row.favorites);

  while (entry.likedBy.length < expectedLikes) {
    entry.likedBy.push(`legacy-like-${row.mod_id}-${synthetic++}`);
  }
  while (entry.favoritedBy.length < expectedFavorites) {
    entry.favoritedBy.push(`legacy-favorite-${row.mod_id}-${synthetic++}`);
  }
}

const state = { version: 1, mods };
const body = JSON.stringify(state);

writeFileSync(OUT_PATH, body, "utf8");

console.log("=== 导出完成 ===");
console.log(`输出: ${OUT_PATH} (${(body.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`资源: ${Object.keys(mods).length}`);
console.log(`设备行: ${data.devices.length}`);
console.log(`total.views: ${data.totals.reduce((sum, row) => sum + toCount(row.views), 0)}`);
console.log(`total.downloads: ${data.totals.reduce((sum, row) => sum + toCount(row.downloads), 0)}`);
console.log(`total.likes: ${totalLikes}（设备行 ${deviceLikes}，合成补齐 ${Math.max(0, totalLikes - deviceLikes)}）`);
console.log(`total.favorites: ${totalFavorites}（设备行 ${deviceFavorites}，合成补齐 ${Math.max(0, totalFavorites - deviceFavorites)}）`);
console.log(`去重表窗口: ${yesterday} / ${today}`);

if (totalLikes < deviceLikes || totalFavorites < deviceFavorites) {
  console.warn("⚠️ 设备明细比 totals 还多 —— 说明 totals 被手工改过，切流前先确认哪边是真的。");
}
