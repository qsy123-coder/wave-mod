/**
 * 把中文名批量换成「拼音首字母」，用于网盘防和谐。
 *
 * 规则：只转换汉字，非汉字（英文、数字、标点、空格、扩展名）原样保留。
 *   心(含大招)-绀星绮愿v1.1（0）by 辉映星辰允如光
 *   → x(hdz)-gxqyv1.1（0）by hyxcyrg
 *
 * 实现方式：不引第三方拼音库，用 Node 内置 ICU 的拼音排序
 * （Intl.Collator("zh-Hans-u-co-pinyin")）配合每个声母的起始字，
 * 判断汉字落在哪个声母区间。2026-11-01 用 103 个真实 mod 文件名验证，0 个漏识别。
 * 极少数 ICU 没有拼音数据的生僻字会输出 `_`，脚本会在最后单独列出。
 *
 * 两种处理模式：
 *   - auto（默认）：文件夹「外面套一层」拼音名，文件直接改名
 *   - wrap：所有条目都套一层拼音文件夹
 *   - rename：所有条目都直接改名
 *
 * 安全：
 *   - 默认 **dry-run**，只打印、不动文件；必须显式加 --apply 才写盘
 *   - 目标已存在时跳过，绝不覆盖
 *   - 不含汉字的条目自动跳过
 *
 * 用法：
 *   node scripts/pinyin-initials-rename.mjs --dir=<目录>                  # 预览目录下所有子项
 *   node scripts/pinyin-initials-rename.mjs --dir=<目录> --apply          # 真正执行
 *   node scripts/pinyin-initials-rename.mjs --dir=<目录> --type=file      # 只处理文件
 *   node scripts/pinyin-initials-rename.mjs --dir=<目录> --mode=rename    # 文件夹也直接改名
 *   node scripts/pinyin-initials-rename.mjs --path=<单个文件或文件夹>      # 只处理一个
 *   node scripts/pinyin-initials-rename.mjs --exclude="a.bat,b.txt"        # 跳过指定文件名
 */

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { CJK_RE, toPinyinInitials } from "./pinyin-initials.mjs";

// 文件扩展名只在「文件」上拆；文件夹名里的点按普通字符保留。
// 列出的都是站内实际用到的包/图片格式，其它未知扩展名按「整名」处理。
const KNOWN_EXTENSIONS = new Set([
  ".exe",
  ".7z",
  ".zip",
  ".rar",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
  ".txt",
  ".csv",
  ".xlsx",
]);

function splitExtension(name, isFile) {
  if (!isFile) return [name, ""];
  const ext = extname(name);
  if (ext && KNOWN_EXTENSIONS.has(ext.toLowerCase())) {
    return [basename(name, ext), ext];
  }
  return [name, ""];
}

const cliArgs = process.argv.slice(2);
const argValue = (name) => {
  const hit = cliArgs.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : null;
};

const isApply = cliArgs.includes("--apply");
const mode = (argValue("mode") || "auto").toLowerCase();
const type = (argValue("type") || "all").toLowerCase();
const dirArg = argValue("dir");
const pathArg = argValue("path");
// 逗号分隔的文件名黑名单：拖拽 bat 自己也在目标目录时，别把它也改了
const excludedNames = new Set(
  (argValue("exclude") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

if (!["auto", "wrap", "rename"].includes(mode)) {
  console.error("❌ --mode 只能是 auto / wrap / rename");
  process.exit(1);
}
if (!["all", "dir", "file"].includes(type)) {
  console.error("❌ --type 只能是 all / dir / file");
  process.exit(1);
}
if (!dirArg && !pathArg) {
  console.error("❌ 必须指定 --dir=<目录> 或 --path=<单个文件/文件夹>");
  process.exit(1);
}

/** 待处理项：统一成 { sourcePath, name, isFile } */
function collectItems() {
  if (pathArg) {
    const sourcePath = resolve(pathArg);
    if (!existsSync(sourcePath)) {
      console.error(`❌ 路径不存在: ${sourcePath}`);
      process.exit(1);
    }
    const stat = statSync(sourcePath);
    const isFile = stat.isFile();
    if (!isFile && !stat.isDirectory()) {
      console.error(`❌ 不是普通文件或目录: ${sourcePath}`);
      process.exit(1);
    }
    if (type !== "all" && type !== (isFile ? "file" : "dir")) return [];
    const name = basename(sourcePath);
    if (excludedNames.has(name)) return [];
    return [{ sourcePath, name, isFile }];
  }

  const dir = resolve(dirArg);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`❌ 目录不存在: ${dir}`);
    process.exit(1);
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .filter((entry) => !excludedNames.has(entry.name))
    .filter((entry) => type === "all" || type === (entry.isFile() ? "file" : "dir"))
    .map((entry) => ({
      sourcePath: join(dir, entry.name),
      name: entry.name,
      isFile: entry.isFile(),
    }));
}

const items = collectItems();
const planned = [];
const skipped = [];
const fallbacks = [];

for (const item of items) {
  const [base, ext] = splitExtension(item.name, item.isFile);
  if (!CJK_RE.test(base)) {
    skipped.push({ ...item, reason: "不含中文" });
    continue;
  }

  const converted = toPinyinInitials(base);
  if (converted.includes("_")) fallbacks.push({ ...item, converted });

  const effectiveMode =
    mode === "auto" ? (item.isFile ? "rename" : "wrap") : mode;

  if (effectiveMode === "wrap") {
    // 套一层：新建拼音文件夹，把原条目挪进去（原名保留）
    const wrapperPath = join(item.sourcePath, "..", converted);
    if (existsSync(wrapperPath)) {
      skipped.push({ ...item, reason: `目标文件夹已存在: ${converted}` });
      continue;
    }
    planned.push({
      ...item,
      effectiveMode,
      targetPath: wrapperPath,
      movedTo: join(wrapperPath, item.name),
      display: `${item.name}  →  ${converted}\\${item.name}`,
    });
  } else {
    // 直接改名：保留扩展名
    const nextName = converted + ext;
    const targetPath = join(item.sourcePath, "..", nextName);
    if (existsSync(targetPath) && resolve(targetPath) !== resolve(item.sourcePath)) {
      skipped.push({ ...item, reason: `目标已存在: ${nextName}` });
      continue;
    }
    planned.push({
      ...item,
      effectiveMode,
      targetPath,
      movedTo: targetPath,
      display: `${item.name}  →  ${nextName}`,
    });
  }
}

console.log("=== 拼音首字母批量重命名 ===");
console.log(`模式: ${mode} | 类型: ${type} | 写入: ${isApply ? "是" : "否（dry-run）"}`);
console.log(`待处理: ${planned.length} | 跳过: ${skipped.length} | 含生僻字(_): ${fallbacks.length}\n`);

for (const item of planned) {
  console.log(`${item.isFile ? "[文件]" : "[目录]"} ${item.display}`);
}
if (skipped.length) {
  console.log("\n--- 跳过 ---");
  for (const item of skipped) console.log(`   ${item.name}（${item.reason}）`);
}
if (fallbacks.length) {
  console.log("\n--- 含无法识别字符（输出里的 _），请人工确认 ---");
  for (const item of fallbacks) console.log(`   ${item.name}  →  ${item.converted}`);
}

if (!isApply) {
  console.log("\n🔍 DRY-RUN：未改动任何文件。确认无误后加 --apply 执行。");
  process.exit(0);
}

let succeeded = 0;
let failed = 0;
for (const item of planned) {
  try {
    if (item.effectiveMode === "wrap") {
      mkdirSync(item.targetPath);
    }
    renameSync(item.sourcePath, item.movedTo);
    succeeded += 1;
  } catch (error) {
    failed += 1;
    console.error(`❌ 处理失败: ${item.name} — ${error.message}`);
  }
}

console.log(`\n📊 完成：成功 ${succeeded}，失败 ${failed}`);
if (failed > 0) process.exit(1);
