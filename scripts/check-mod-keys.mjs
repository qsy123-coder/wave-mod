/**
 * 重命名后的分类自检：把日期目录里的 mod 名跑一遍 `resolveCharacterAndTitle`，
 * 打印「角色 / 标题 / 去重键」，并标出**库里没有的角色**（上传后会凭空多一个分类）。
 *
 * 为什么要独立成脚本：改名的风险全在分类上 —— 文件名写成什么样，`character` 就解析成
 * 什么样；写错一个前缀前台就多一个分类，而且不报错（见 CLAUDE.md「Mod 重命名」）。
 * 以前只能临时拷一份 upload-daily-by-date.mjs 去掉 main() 再 import，太慢。
 *
 * 用法（不传参数 = 最新那个 W-YYYY.M.D 目录）：
 *   node scripts/check-mod-keys.mjs
 *   node scripts/check-mod-keys.mjs --dir=W-2026.10.24        # 目录名或绝对路径都行
 *
 * 不传中文参数是刻意的：PowerShell 5.1 会把非 ASCII 参数按 GBK 转发给原生程序，
 * 中文路径在命令行里必乱码（见 memory/powershell-ansi-encoding-traps）。
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { dedupKey, resolveCharacterAndTitle } from "./upload-daily-by-date.mjs";
import { psqlJson } from "./psql-db.mjs";

// 数据盘位置随机器不同（旧机 D:，2026-10-29 重装系统后为 F:），用环境变量覆盖默认值。
const BASE =
  process.env.WAVE_MOD_DAILY_BASE?.trim() ||
  String.raw`F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`;
const MOD_EXTS = new Set([".exe", ".7z", ".zip", ".rar"]);
const IMG_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const SKIP_DIRS = new Set(["预览图"]);

function pickDateDir() {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--dir="));
  if (arg) {
    const v = arg.slice("--dir=".length).trim();
    return v ? (existsSync(v) ? resolve(v) : join(BASE, v)) : null;
  }
  const dirs = readdirSync(BASE)
    .filter((n) => /^W-\d{4}\.\d{1,2}\.\d{1,2}$/.test(n))
    .map((n) => {
      const [y, m, d] = n.slice(2).split(".").map(Number);
      return { n, t: new Date(y, m - 1, d).getTime() };
    })
    .sort((a, b) => b.t - a.t);
  return dirs.length ? join(BASE, dirs[0].n) : null;
}

/** 目录顶层 + 预览图 子目录里的文件名（上传脚本两处都索引） */
function listNames(dir) {
  const out = [];
  const push = (d, nested) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (!nested && !SKIP_DIRS.has(name)) out.push({ kind: "dir", name });
        continue;
      }
      out.push({ kind: nested ? "image" : "file", name });
    }
  };
  push(dir, false);
  const previewDir = join(dir, "预览图");
  if (existsSync(previewDir)) push(previewDir, true);
  return out;
}

const dir = pickDateDir();
if (!dir || !existsSync(dir)) {
  console.error(`❌ 找不到日期目录：${dir ?? "(BASE 下没有 W-* 目录)"}`);
  process.exit(1);
}

const names = listNames(dir);
const modKeys = new Set();
const imageBases = [];

for (const { kind, name } of names) {
  // 目录名本身就是 key，**不能**走 extname()：`莫宁-月光幻影v3.4fix by …`
  // 的小圆点会被当成扩展名，截成 `莫宁-月光幻影v3`（多出一条假 key）。
  if (kind === "dir") {
    modKeys.add(name);
    continue;
  }
  const ext = extname(name).toLowerCase();
  if (MOD_EXTS.has(ext)) {
    modKeys.add(basename(name, ext));
  } else if (IMG_EXTS.has(ext)) {
    imageBases.push(basename(name, ext));
  }
}

// 图片 base → mod key：`<key>` 或 `<key>-1` / `<key>-2`（多图编号）
const keyOf = (imgBase) => {
  if (modKeys.has(imgBase)) return imgBase;
  const m = /^(.*)-\d+$/.exec(imgBase);
  if (m && modKeys.has(m[1])) return m[1];
  const noSuffix = imgBase.replace(/[(（]\d+[)）]$/, "");
  return modKeys.has(noSuffix) ? noSuffix : imgBase;
};
for (const b of imageBases) modKeys.add(keyOf(b));

const keys = [...modKeys].sort((a, b) => a.localeCompare(b, "zh"));
if (!keys.length) {
  console.error(`❌ ${dir} 里没有可识别的 mod（文件夹 / exe / 7z / zip / rar）`);
  process.exit(1);
}

const rows = keys.map((k) => {
  const r = resolveCharacterAndTitle(k);
  return { key: k, character: r.character, title: r.title, dedup: dedupKey(r.character, r.title) };
});

// 库内已有角色（拿不到库就跳过这项，不影响其余输出）
let known = null;
try {
  const res = await Promise.race([
    psqlJson(`select coalesce(json_agg(distinct character), '[]'::json)::text from mods;`),
    new Promise((_, reject) => setTimeout(() => reject(new Error("连接超时")), 15000)),
  ]);
  if (Array.isArray(res)) known = new Set(res);
} catch (err) {
  console.warn(`⚠️  跳过「库内角色」校验：${err.message}`);
}

console.log(`目录：${dir}\n`);
for (const r of rows) {
  const flag = known && !known.has(r.character) ? " ⚠️ 库内无此角色" : "";
  console.log(`${r.key}`);
  console.log(`   角色=${r.character}${flag}`);
  console.log(`   标题=${r.title}`);
  console.log(`   去重=${r.dedup}`);
}

const fresh = known ? rows.filter((r) => !known.has(r.character)) : [];
if (fresh.length) {
  console.warn(`\n⚠️  以下角色在库里不存在，上传后会凭空多出分类（先归一或加前缀规则）：`);
  for (const r of fresh) console.warn(`   ${r.character}  ←  ${r.key}`);
  process.exitCode = 1;
} else {
  console.log(`\n✅ 共 ${rows.length} 条，全部落在库内已有分类`);
}
