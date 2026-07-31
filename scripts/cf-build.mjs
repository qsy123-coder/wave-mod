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

  // 4. 修补 worker.js：/next/image → 302 重定向到原始 URL
  //    绕过 Cloudflare SSRF 防护 (CVE-2025-6087)
  log("Patching worker.js to redirect /_next/image...");
  const WORKER_FILE = join(ROOT, ".open-next", "worker.js");
  let worker = readFileSync(WORKER_FILE, "utf-8");

  // 替换 /_next/image handler：提取 url 参数，302 重定向到原始图片
  const nextImageMatch = /return await handleImageRequest\(url,\s*request\.headers,\s*env\);/g;
  worker = worker.replace(nextImageMatch,
    `const rawUrl = url.searchParams.get("url");
    if (rawUrl) {
      try { new URL(rawUrl); return Response.redirect(rawUrl, 302); } catch {}
    }
    return new Response('"url" parameter is not allowed', { status: 400 });`
  );

  writeFileSync(WORKER_FILE, worker, "utf-8");
  log("Worker.js /_next/image redirect patch applied.");

  // 5. 修补 worker.js：apex 域名 301 重定向到 www，避免 CDN/缓存不一致
  log("Patching worker.js: wave-mod.top → www.wave-mod.top 301 redirect...");
  worker = worker.replace(
    "const url = new URL(request.url);",
    `const url = new URL(request.url);
            if (url.hostname === "wave-mod.top") {
                return Response.redirect(\`https://www.wave-mod.top\${url.pathname}\${url.search}\`, 301);
            }`
  );
  writeFileSync(WORKER_FILE, worker, "utf-8");
  log("Worker.js apex→www redirect patch applied.");

  // 7. 修补 worker.js：HTML 响应添加 Cache-Control: no-store 防止 CF CDN 缓存
  log("Patching worker.js to add Cache-Control: no-store for HTML...");

  // 把 return runWithCloudflareRequestContext 改为 const __resp = await ...
  worker = worker.replace(
    "return runWithCloudflareRequestContext(request, env, ctx,",
    "const __resp = await runWithCloudflareRequestContext(request, env, ctx,"
  );

  // 在 fetch handler 末尾 return 之前注入缓存头检查
  worker = worker.replace(
    /(return handler\(reqOrResp, env, ctx, request\.signal\);)\s*\}\);\s*\},\s*\};/s,
    `$1
        });
        if (__resp instanceof Response) {
            const __ct = __resp.headers.get("content-type") || "";
            if (__ct.includes("text/html")) {
                const __h = new Headers(__resp.headers);
                __h.set("Cache-Control", "no-store, max-age=0, must-revalidate");
                __h.set("CDN-Cache-Control", "no-store");
                return new Response(__resp.body, { status: __resp.status, statusText: __resp.statusText, headers: __h });
            }
        }
        return __resp;
    },
};`
  );

  writeFileSync(WORKER_FILE, worker, "utf-8");
  log("Worker.js no-cache patch applied.");
} finally {
  // 5. 恢复 proxy.ts
  log("Restoring proxy.ts...");
  renameSync(PROXY_BACKUP, PROXY_FILE);
}

log("Cloudflare build complete!");
log("Run 'npm run cf:deploy' or 'npx wrangler deploy' to deploy.");
