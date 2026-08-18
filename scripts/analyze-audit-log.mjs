/** 分析审计日志：统计 GET 返回的 Content-Length 是否等于「期望打码 webp 大小」 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = process.argv[2] ?? "scripts/logs/preview-audit-20260817074829..log";
const lines = readFileSync(resolve(process.cwd(), path), "utf8").split(/\r?\n/);

let stale = 0, ok = 0, mismatch = 0, cacheSuspect = 0;
const mismatchDetails = [];
const cacheDetails = [];

for (let i = 0; i < lines.length; i++) {
  const titleMatch = lines[i].match(/^✗ \[stale\] (.*)$/);
  if (!titleMatch) continue;
  stale++;
  const title = titleMatch[1];
  const cosLine = lines[i + 2] ?? "";
  const getLine = lines[i + 3] ?? "";
  const expM = cosLine.match(/期望=(\d+)/);
  const getM = getLine.match(/GET: (\S+) lm=([^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+) len=(\d+)/);
  const exp = expM ? Number(expM[1]) : null;
  const getLen = getM ? Number(getM[3]) : null;
  const getLm = getM ? getM[2] : null;
  const getStatus = getM ? getM[1] : null;

  if (exp != null && getLen === exp) {
    ok++;
  } else if (getLen != null) {
    mismatch++;
    mismatchDetails.push(`${title} : exp=${exp} get=${getLen} status=${getStatus}`);
  } else {
    cacheSuspect++;
    cacheDetails.push(`${title} : GET 无有效长度 (${getStatus ?? "?"})`);
  }
}

console.log(`stale 标记: ${stale}`);
console.log(`其中 GET 长度===期望(打码✓): ${ok}`);
console.log(`GET 长度≠期望(真问题): ${mismatch}`);
console.log(`GET 无法判断: ${cacheSuspect}`);
if (mismatchDetails.length) { console.log("\n--- 真问题清单 ---"); mismatchDetails.forEach((d) => console.log("  " + d)); }
if (cacheDetails.length) { console.log("\n--- 无法判断 ---"); cacheDetails.forEach((d) => console.log("  " + d)); }
