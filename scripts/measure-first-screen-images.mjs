/**
 * 量「手机首屏」的图片传输量（PRD 的验收指标：≤1.2MB）。
 *
 * 为什么要真浏览器：卡片是客户端渲染 + 瀑布流算 `sizes`，静态 HTML 里既没有
 * `srcset` 也没有卡片，curl 什么都量不到。
 *
 * 做法（不引入 Playwright —— 项目没装，且 CLAUDE.md 禁止加库）：
 *   起一个 headless Chrome，用 CDP 设成手机视口 + DPR，导航到列表页，
 *   等图片都落地后读 `performance.getEntriesByType('resource')` 的
 *   `transferSize`（压缩后真实传输字节），只统计 `initiatorType === 'img'`。
 *
 * 用法:
 *   node scripts/measure-first-screen-images.mjs                 # 390×844 @2x 打开 /mods
 *   node scripts/measure-first-screen-images.mjs --dpr=3
 *   node scripts/measure-first-screen-images.mjs --path=/ --dpr=3
 *   node scripts/measure-first-screen-images.mjs --wait=8000     # 弱网下多等一会
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const SITE = process.env.WAVE_MOD_SITE_URL?.trim() || "https://go.sunnyrose.xyz";
const PATHNAME = argOf("path", "/mods");
const DPR = Number(argOf("dpr", "2"));
const WAIT_MS = Number(argOf("wait", "7000"));
const WIDTH = Number(argOf("width", "390"));
const HEIGHT = Number(argOf("height", "844"));

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("❌ 找不到 Chrome/Edge，可设 WAVE_MOD_CHROME_PATH 指定");
  process.exit(1);
}

const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "wm-chrome-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    `--window-size=${WIDTH},${HEIGHT}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等到 devtools 端口起来并拿到某个 page target 的 ws 地址 */
async function waitForTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(200);
  }
  throw new Error("Chrome devtools 端口没起来");
}

/** 极简 CDP 客户端：只需要 send(id, method, params) 和 waitFor(event) */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(event) {
    return new Promise((resolve) => {
      const fn = (params) => {
        this.listeners.set(event, (this.listeners.get(event) ?? []).filter((f) => f !== fn));
        resolve(params);
      };
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
    });
  }
}

const cleanup = () => {
  try {
    chrome.kill();
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
};

try {
  const wsUrl = await waitForTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  const cdp = new Cdp(ws);

  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: DPR,
    mobile: true,
  });
  await cdp.send("Emulation.setUserAgentOverride", {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: `${SITE}${PATHNAME}` });
  await loaded;
  // 列表是客户端拉取 + 图片懒加载，load 之后还要给它们时间落地
  await sleep(WAIT_MS);

  const { result } = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify(performance.getEntriesByType('resource').map(r => ({
      name: r.name, type: r.initiatorType, transfer: r.transferSize || r.encodedBodySize || 0
    })))`,
    returnByValue: true,
  });
  const resources = JSON.parse(result.value);

  const imgs = resources.filter((r) => r.type === "img");
  const sum = (arr, key = "transfer") => arr.reduce((s, r) => s + r[key], 0);
  const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

  console.log(`\n视口 ${WIDTH}×${HEIGHT} @${DPR}x → ${SITE}${PATHNAME}`);
  console.log(`资源 ${resources.length} 个，总计 ${kb(sum(resources))}`);
  console.log(`图片 ${imgs.length} 张，合计 ${kb(sum(imgs))}  ← PRD 预算 1.2MB`);

  const byWidth = {};
  for (const img of imgs) {
    const m = /thumbnail\/(\d+)x/.exec(img.name);
    const w = m ? `${m[1]}w` : "原图";
    byWidth[w] = byWidth[w] || { n: 0, bytes: 0 };
    byWidth[w].n++;
    byWidth[w].bytes += img.transfer;
  }
  console.log("\n按请求档位分组：");
  for (const [w, v] of Object.entries(byWidth).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${w.padEnd(6)} ${String(v.n).padStart(2)} 张  ${kb(v.bytes)}`);
  }

  console.log("\n最大的 6 张：");
  imgs
    .slice()
    .sort((a, b) => b.transfer - a.transfer)
    .slice(0, 6)
    .forEach((r) => {
      const m = /thumbnail\/(\d+)x/.exec(r.name);
      console.log(`  ${kb(r.transfer).padStart(6)}  ${m ? m[1] + "w" : "原图"}  ${r.name.split("/").slice(-2).join("/")}`);
    });

  const hd = imgs.filter((r) => r.name.includes("preview-hd")).length;
  console.log(`\n其中 HD 图：${hd} 张`);
  console.log(sum(imgs) <= 1.2 * 1024 * 1024 ? "✅ 在 1.2MB 预算内" : "⚠️ 超出 1.2MB 预算");
} finally {
  cleanup();
  process.exit(0);
}
