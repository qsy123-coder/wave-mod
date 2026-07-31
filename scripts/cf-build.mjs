/**
 * Cloudflare 构建脚本
 *
 * 自动处理 proxy.ts 的临时移除（Next.js 16 proxy 与 opennextjs Windows 不兼容），
 * 并在构建后修补 middleware handler 的 __dirname 路径。
 *
 * 用法: npm run cf:build
 */

import { execSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dirname.replace(/[/\\]scripts$/, "");
const PROXY_FILE = join(ROOT, "src", "proxy.ts");
const PROXY_BACKUP = join(ROOT, "src", "proxy.ts.cf-bak");
const HANDLER_FILE = join(ROOT, ".open-next", "middleware", "handler.mjs");

function log(msg) {
  console.log(`[cf:build] ${msg}`);
}

// 1. 临时移除 proxy.ts
log("Temporarily removing proxy.ts...");
renameSync(PROXY_FILE, PROXY_BACKUP);

try {
  // 2. 构建
  log("Building with opennextjs-cloudflare...");
  execSync("npx opennextjs-cloudflare build", { stdio: "inherit", cwd: ROOT });

  // 3. 修补 middleware handler 的 __dirname（Windows 兼容）
  log("Patching middleware handler __dirname...");
  let handler = readFileSync(HANDLER_FILE, "utf-8");

  // 替换 __dirname 默认值，让 middleware handler 能找到 .next/ 配置文件
  handler = handler.replace(
    /globalThis\.__dirname \?\?= "";/g,
    'globalThis.__dirname ??= ".open-next/middleware";',
  );

  writeFileSync(HANDLER_FILE, handler, "utf-8");
  log("Patch applied successfully.");

  // 4. 给 images.js 注入请求日志（调试手机端图片加载问题）
  log("Patching images.js with request logging...");
  const IMAGES_FILE = join(ROOT, ".open-next", "cloudflare", "images.js");
  let images = readFileSync(IMAGES_FILE, "utf-8");

  // 在 handleImageRequest 入口加日志
  images = images.replace(
    /async function handleImageRequest\(requestURL, requestHeaders, env\) \{/,
    `async function handleImageRequest(requestURL, requestHeaders, env) {
  console.log("[img:req] url=", requestURL.toString());
  console.log("[img:req] ua=", requestHeaders.get("user-agent") ?? "none");`
  );

  // 在 fetch 之前记录目标 URL
  images = images.replace(
    /(fetchImageResult = await fetchWithRedirects\(parseResult\.url,)/,
    `console.log("[img:fetch] target=", parseResult.url, "width=", parseResult.width, "quality=", parseResult.quality);
  $1`
  );

  // 在 fetch 成功/失败处加日志
  images = images.replace(
    /if \(!fetchImageResult\.ok\) \{/,
    `console.log("[img:fetch-result] ok=", fetchImageResult.ok, "error=", fetchImageResult.error ?? "none");
  if (!fetchImageResult.ok) {`
  );

  // 在 readImageHeader 之后，处理 ctx 之前加日志
  images = images.replace(
    /(const \{ contentType, imageStream \} = readHeaderResult;)/,
    `console.log("[img:content-type] detected=", readHeaderResult.contentType);
  $1`
  );

  // 在 createImageResponse 之前记录响应头（适用于 GIF 和其他格式的 inline 返回）
  images = images.replace(
    /(const response\d* = createImageResponse\(imageStream, contentType, \{)/g,
    `console.log("[img:response] contentType=", contentType, "immutable=", immutable);
  $1`
  );

  // 覆盖最后一个 createImageResponse（可能被上面的正则匹配了多次，这里确保都有日志）
  writeFileSync(IMAGES_FILE, images, "utf-8");
  log("Images.js logging patch applied.");
} finally {
  // 4. 恢复 proxy.ts
  log("Restoring proxy.ts...");
  renameSync(PROXY_BACKUP, PROXY_FILE);
}

log("Cloudflare build complete!");
log("Run 'npm run cf:deploy' or 'npx wrangler deploy' to deploy.");
