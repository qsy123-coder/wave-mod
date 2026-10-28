/**
 * 清掉香港反代里 `/api/mods` 的 nginx 缓存条目（按 URL 子串匹配）。
 *
 * 为什么需要单独一步：`deploy/hk-proxy/nginx/wavemod-proxy.conf.template` 里
 * `location = /api/mods` 是 `proxy_cache_valid 200 7200s`，缓存键是
 * `$host$request_uri` 的 md5，且 `proxy_ignore_headers Cache-Control`。
 * 所以脚本 ping `/api/revalidate` 只能清**上游 Next** 那一层（unstable_cache / ISR），
 * 反代这一层照样把旧 JSON 发给浏览器最长 2 小时 —— 表现就是「库改了、图换了，
 * 前台还是旧的」，而直接用带随机查询串的 URL 测又永远是新的（`$arg_query` 会让它 BYPASS）。
 * 2026-10-25 换弗洛洛预览图时踩到：页面 65 张图里 0 张新的。
 *
 * 服务器上没有 nginx cache purge 模块（Ubuntu 自带的 nginx 1.18 只有核心模块），
 * 所以走「缓存文件头部带 KEY 原文 → grep 出来删掉」这条路。删掉后下一次请求 MISS，
 * 自然回源重建。不需要 reload nginx。
 *
 * 用法:
 *   node scripts/purge-hk-api-cache.mjs --pattern='character=%E5%BC%97%E6%B4%9B%E6%B4%9B' --dry-run
 *   node scripts/purge-hk-api-cache.mjs --pattern='character=%E5%BC%97%E6%B4%9B%E6%B4%9B'
 *   node scripts/purge-hk-api-cache.mjs --all --dry-run    # 整层缓存（每日上传后自动跑）
 *
 * 参数:
 *   --pattern=<子串>  要匹配的缓存键片段（URL 编码后的形式）；与 --all 二选一
 *   --all             清空整个缓存目录。**每日上传脚本用这个**：TTL 已经拉到 6 小时，
 *                     没有主动失效的话新 mod 在列表里会晚到 6 小时才出现。
 *                     清空是安全的 —— 下一次请求 MISS，自然回源重建，不需要 reload。
 *   --ssh=<用户@主机> 默认 root@45.135.119.204
 *   --port=<端口>     默认 28822
 *   --key=<私钥路径>  默认 C:\Users\qsy123\.ssh\id_ed25519
 *   --cache=<目录>    默认 /var/cache/nginx/wavemod
 *   --dry-run         只统计命中条数
 *
 * 链路质量差（新建连接丢包），ssh 失败会自动重试 3 次。
 */

import { execFileSync } from "node:child_process";

function readArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const pattern = readArg("--pattern")?.trim();
const host = readArg("--ssh")?.trim() || "root@45.135.119.204";
const port = readArg("--port")?.trim() || "28822";
const key = readArg("--key")?.trim() || String.raw`C:\Users\qsy123\.ssh\id_ed25519`;
const cacheDir = readArg("--cache")?.trim() || "/var/cache/nginx/wavemod";
const isDryRun = process.argv.includes("--dry-run");
const purgeAll = process.argv.includes("--all");

if (!pattern && !purgeAll) {
  console.error("❌ 需要 --pattern=<缓存键里的 URL 片段>，或用 --all 清空整层缓存");
  process.exit(1);
}

let remote;
if (purgeAll) {
  // 只删文件，保留目录结构：nginx 启动时按 levels=1:2 建好了子目录，删掉要 reload 才恢复
  remote = [
    `if [ ! -d ${cacheDir} ]; then echo "缓存目录不存在"; exit 0; fi`,
    `n=$(find ${cacheDir} -type f | wc -l)`,
    isDryRun ? `echo "可清理 $n 条"` : `find ${cacheDir} -type f -delete; echo "已清空 $n 条"`,
  ].join("; ");
} else {
  /** 单引号包裹并转义，防止子串里的 & 被远端 shell 当成后台执行 */
  const quoted = `'${pattern.replace(/'/g, "'\\''")}'`;
  remote = [
    `grep -rl --binary-files=text ${quoted} ${cacheDir} > /tmp/wavemod-purge.txt || true`,
    `n=$(wc -l < /tmp/wavemod-purge.txt)`,
    isDryRun ? `echo "命中 $n 条"` : `xargs -r rm -f < /tmp/wavemod-purge.txt; echo "已清理 $n 条"`,
  ].join("; ");
}

function runOnce() {
  return execFileSync(
    "ssh",
    ["-p", port, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15", "-i", key, host, remote],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

let out;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    out = runOnce();
    break;
  } catch (err) {
    const message = String(err.stderr || err.message || "").trim().split("\n").slice(-1)[0];
    console.warn(`⚠️  第 ${attempt} 次 ssh 失败：${message}`);
    if (attempt === 3) {
      console.error("❌ 三次都失败，缓存未清理");
      process.exit(1);
    }
  }
}

const scope = purgeAll ? "整层缓存" : `/api/mods 缓存（${pattern}）`;
console.log(`🧹 香港反代 ${scope}：${out.trim()}${isDryRun ? "（dry-run，未删除）" : ""}`);
