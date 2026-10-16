/**
 * 首屏成本实测 —— 冷启动到底下了哪些字节、什么时候画的
 *
 * 为什么不用 Lighthouse / performance.getEntriesByType('resource')：
 *   站里的图全在 COS（另一个域名），跨域资源没有 Timing-Allow-Origin 时
 *   `transferSize` 恒为 0 —— 正好把最贵的那部分算成免费。所以走 CDP 的
 *   Network 域拿 `encodedDataLength`，它不受 TAO 影响。
 *
 * 为什么不用干净 profile 之外的手段保证冷缓存：`--user-data-dir` 每次新建
 *   就是冷缓存，比手工清缓存可靠。
 *
 * 用法：
 *   node scripts/measure-first-screen.mjs --url=https://go.sunnyrose.xyz/
 *   node scripts/measure-first-screen.mjs --viewport=390x844 --mobile
 *   node scripts/measure-first-screen.mjs --settle=8000   等懒加载稳定再收尾
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!found) throw new Error("找不到 Chrome/Edge，请在 CHROME_CANDIDATES 里补上路径");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简 CDP 客户端，与 verify-theme-layout-shift.mjs 同款：够用即可，不引依赖。 */
class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
        return;
      }
      const subs = this.listeners.get(msg.method);
      if (subs) for (const fn of subs) fn(msg.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), fn]);
  }

  once(method, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待 ${method} 超时`)), timeoutMs);
      const fn = (params) => {
        clearTimeout(timer);
        const subs = this.listeners.get(method) ?? [];
        this.listeners.set(method, subs.filter((s) => s !== fn));
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), fn]);
    });
  }
}

async function evaluate(session, expression) {
  const res = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text ?? "页面内求值抛错");
  return res.result.value;
}

/**
 * 在文档开始前注入的绘制埋点。
 *
 * LCP 只报**最后一次**候选在这份报告里最有意义（它就是要优化的那个数），
 * 所以只留最后一条而不是全部。
 */
const PAINT_PROBE = `(() => {
  window.__paint = { lcp: null, lcpEl: null, lcpFirst: null, lcpFirstEl: null, fcp: null };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__paint.fcp = e.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        // 第一条候选 = 首屏自己那张图什么时候画出来的；最后一条 = 规范意义上的 LCP。
        // 两个都留：首页轮播每 4.5 秒自动翻页，每翻一张都会画一张同尺寸的大图，
        // 只报最后一条的话，量到的其实是「自动播放第 N 张」，不是首屏。
        if (window.__paint.lcpFirst === null) {
          window.__paint.lcpFirst = e.startTime;
          const el = e.element;
          window.__paint.lcpFirstEl = el
            ? el.tagName.toLowerCase() + (el.currentSrc ? ' ' + el.currentSrc.slice(0, 120) : '')
            : (e.url || '(无元素)');
        }
        window.__paint.lcp = e.startTime;
        const el = e.element;
        window.__paint.lcpEl = el
          ? el.tagName.toLowerCase() + (el.currentSrc ? ' ' + el.currentSrc.slice(0, 120) : '')
          : (e.url || '(无元素)');
        window.__paint.lcpSize = e.size;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
})()`;

/** 把字节数渲染成人看的样子。 */
function human(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** 按 URL 猜资源类别：CDP 的 type 对 COS 图会给 "Other"/"Image"，这里统一按扩展名兜底。 */
function classify(url, cdpType) {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif|svg)$/.test(clean)) return "image";
  if (/\.(woff2?|ttf|otf|eot)$/.test(clean)) return "font";
  if (/\.(css)$/.test(clean)) return "css";
  if (/\.(m?js)$/.test(clean)) return "js";
  if (cdpType === "Document") return "html";
  if (cdpType === "Fetch" || cdpType === "XHR") return "api";
  return "other";
}

async function main() {
  const args = parseArgs(process.argv);
  const url = typeof args.url === "string" ? args.url : "https://go.sunnyrose.xyz/";
  const [vw, vh] = String(args.viewport ?? "1440x900").split("x").map(Number);
  const mobile = Boolean(args.mobile);
  /** load 事件之后再等这么久，看懒加载还会不会继续偷字节。 */
  const settle = args.settle !== undefined ? Number(args.settle) : 6000;
  const topN = args.top !== undefined ? Number(args.top) : 15;

  const chromePath = findChrome();
  const userDataDir = mkdtempSync(join(tmpdir(), "wavemod-perf-"));
  const port = 9500 + Math.floor(process.pid % 400);

  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    // 关键：这几项默认会禁用真实网络行为（如把请求标记成 localhost 而跳过 lazy 阈值），
    // 关掉才能量到与用户浏览器一致的懒加载时机。
    "--disable-background-networking",
    "--disable-features=OptimizationGuideModelDownloading",
    "about:blank",
  ], { stdio: "ignore" });

  let session;
  const cleanup = () => {
    try { session?.ws.close(); } catch { /* 已关 */ }
    try { chrome.kill(); } catch { /* 已退出 */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 占用中，留给系统清理 */ }
  };
  process.on("exit", cleanup);

  try {
    let target = null;
    for (let i = 0; i < 60; i++) {
      try {
        const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
        target = list.find((t) => t.type === "page");
        if (target) break;
      } catch { /* 还没起来 */ }
      await sleep(250);
    }
    if (!target) throw new Error("Chrome 调试端口未就绪");

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP WebSocket 连接失败")), { once: true });
    });
    session = new CdpSession(ws);

    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Network.enable", {
      maxTotalBufferSize: 200 * 1024 * 1024,
      maxResourceBufferSize: 20 * 1024 * 1024,
    });
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: vw,
      height: vh,
      deviceScaleFactor: mobile ? 3 : 1,
      mobile,
    });
    if (mobile) {
      await session.send("Emulation.setUserAgentOverride", {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
    }

    // 可选：模拟一条远端链路。用来把「页面自身的结构成本」和「本机到线上的抖动」
    // 分开 —— 本机到 COS/首尔的丢包率高到会让绝对时间完全不可读（实测 25–55%），
    // 而在本地叠一个确定的 RTT/带宽，量出来的差异就只可能来自页面结构。
    // 默认值取「中国→首尔」的量级。
    if (args.rtt !== undefined || args.kbps !== undefined) {
      const latency = args.rtt !== undefined ? Number(args.rtt) : 150;
      const kbps = args.kbps !== undefined ? Number(args.kbps) : 4000;
      await session.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: Math.round(latency / 2), // CDP 的 latency 是**单向**的，RTT 要折半
        downloadThroughput: (kbps * 1024) / 8,
        uploadThroughput: (kbps * 1024) / 8,
        connectionType: "cellular4g",
      });
      console.log(`（已模拟链路：RTT ${latency} ms / ${kbps} kbps）`);
    }

    await session.send("Page.addScriptToEvaluateOnNewDocument", { source: PAINT_PROBE });

    /** requestId → 请求信息 */
    const reqs = new Map();
    /** 每次 load 事件的耗时（后续懒加载触发的 load 也算，但只有第一次是导航的） */
    const loads = [];

    session.on("Network.requestWillBeSent", (p) => {
      reqs.set(p.requestId, {
        url: p.request.url,
        type: p.type,
        startedAt: p.timestamp,
        status: null,
        bytes: 0,
        fromCache: false,
      });
    });
    session.on("Network.responseReceived", (p) => {
      const r = reqs.get(p.requestId);
      if (!r) return;
      r.status = p.response.status;
      r.fromCache = Boolean(p.response.fromDiskCache || p.response.fromPrefetchCache);
      r.mime = p.response.mimeType;
      // connectionId 用来数「同源到底开了几条 TCP」。HTTP/1.1 每源上限 6，
      // HTTP/2 理想情况是 1 —— 这是判断协议有没有真正生效最直接的证据。
      r.connectionId = p.response.connectionId;
      r.protocol = p.response.protocol;
    });
    session.on("Network.loadingFinished", (p) => {
      const r = reqs.get(p.requestId);
      if (r) r.bytes = p.encodedDataLength ?? 0;
    });
    session.on("Network.loadingFailed", (p) => {
      const r = reqs.get(p.requestId);
      if (r) r.failed = p.errorText;
    });
    session.on("Page.loadEventFired", (p) => loads.push(p.timestamp));

    // 页面内的运行时异常：只报体积/时间是不够的，动态 import 改动最常见的回归
    // 就是「代码没报错地不工作」（chunk 取不到、promise 没接住）。
    const pageErrors = [];
    session.on("Runtime.exceptionThrown", (p) => {
      const d = p.exceptionDetails;
      pageErrors.push(`${d.text ?? ""} ${(d.exception?.description ?? "").split("\n")[0].slice(0, 160)}`.trim());
    });

    const navStart = Date.now();
    // ⚠️ 必须在 Page.navigate **之前**挂上等待：导航一旦开始，load 可能在
    // navigate 的响应回来之前就触发了，那样 once 会去等「下一次」load ——
    // 而 load 一辈子只来一次，于是量出一个十几秒的假数（踩过）。
    const loadWaiter = session.once("Page.loadEventFired", 45000).then(
      () => true,
      () => false,
    );
    await session.send("Page.navigate", { url });

    const loadFired = await loadWaiter;
    const loadAt = Date.now() - navStart;

    // load 之后再等一会儿，看懒加载有没有继续偷字节
    await sleep(settle);
    const settleAt = Date.now() - navStart;

    const paint = await evaluate(session, "JSON.stringify(window.__paint)").catch(() => null);
    const nav = await evaluate(session, `(() => {
      const n = performance.getEntriesByType('navigation')[0];
      if (!n) return null;
      return JSON.stringify({
        ttfb: n.responseStart,
        domContentLoaded: n.domContentLoadedEventEnd,
        loadEventEnd: n.loadEventEnd,
        transferSize: n.transferSize,
        nextHopProtocol: n.nextHopProtocol,
      });
    })()`).catch(() => null);

    const imgState = await evaluate(session, `(() => {
      const out = [];
      for (const img of document.images) {
        out.push({
          loading: img.getAttribute('loading') || '(默认 eager)',
          loaded: img.complete && img.naturalWidth > 0,
          loading2: img.loading,
          src: (img.currentSrc || img.src || '').slice(0, 130),
          visible: img.getBoundingClientRect().width > 0,
        });
      }
      return JSON.stringify(out);
    })()`).catch(() => "[]");

    // ── 出报告 ───────────────────────────────────────────────
    const list = [...reqs.values()];
    const settled = list.filter((r) => r.startedAt !== undefined);

    console.log(`\n=== 首屏实测 ${url}`);
    console.log(`    视口 ${vw}x${vh}${mobile ? " (mobile, DPR3)" : " (desktop, DPR1)"}`);
    console.log(`    冷缓存（全新 profile）\n`);

    console.log(`load 事件：${loadFired ? `${loadAt} ms` : "❌ 45s 内没来（标签页会一直转圈）"}`);
    if (nav) {
      const n = JSON.parse(nav);
      console.log(`TTFB：${Math.round(n.ttfb)} ms   DOMContentLoaded：${Math.round(n.domContentLoaded)} ms   loadEventEnd：${Math.round(n.loadEventEnd)} ms`);
      console.log(`导航协议：${n.nextHopProtocol}`);
    }
    if (paint) {
      const p = JSON.parse(paint);
      if (p.fcp) console.log(`FCP：${Math.round(p.fcp)} ms`);
      if (p.lcpFirst) console.log(`首张 LCP 候选：${Math.round(p.lcpFirst)} ms  ← ${p.lcpFirstEl}`);
      if (p.lcp) console.log(`末次 LCP 候选：${Math.round(p.lcp)} ms  ← ${p.lcpEl}`);
      if (p.lcpFirst && p.lcp && p.lcp - p.lcpFirst > 1000) {
        console.log(`    （两者相差 ${Math.round((p.lcp - p.lcpFirst) / 1000)}s —— 期间页面又画了更大的东西，`);
        console.log(`      首页是轮播自动翻页，每翻一张就是一张同尺寸大图，会不断刷新末次候选）`);
      }
    }
    console.log(`load 后观察 ${settle} ms（${settleAt} ms 时收尾）`);

    const byCat = new Map();
    for (const r of settled) {
      const c = classify(r.url, r.type);
      byCat.set(c, (byCat.get(c) ?? 0) + (r.bytes || 0));
    }
    const total = [...byCat.values()].reduce((a, b) => a + b, 0);
    console.log(`\n--- 传输字节（CDP encodedDataLength，含响应体+压缩后大小）`);
    console.log(`    总计 ${human(total)}`);
    for (const [c, b] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      if (!b) continue;
      console.log(`    ${c.padEnd(6)} ${human(b).padStart(9)}  ${String(Math.round((b / total) * 100)).padStart(3)}%`);
    }

    // 同源连接数：HTTP/1.1 每源 6 条封顶，超出的请求要排队；HTTP/2 是一条连接
    // 多路复用。请求数远超连接数就说明在排队 —— 这是「首屏慢」最容易被忽略的一环。
    const byProto = new Map();
    const connByOrigin = new Map();
    for (const r of settled) {
      if (!r.protocol) continue;
      byProto.set(r.protocol, (byProto.get(r.protocol) ?? 0) + 1);
      if (r.connectionId !== undefined) {
        let origin;
        try { origin = new URL(r.url).origin; } catch { continue; }
        if (!connByOrigin.has(origin)) connByOrigin.set(origin, new Set());
        connByOrigin.get(origin).add(r.connectionId);
      }
    }
    console.log(`\n--- 协议与连接`);
    for (const [p, n] of [...byProto.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${p.padEnd(10)} ${n} 个响应`);
    }
    for (const [origin, conns] of connByOrigin) {
      console.log(`    ${origin.replace(/^https:\/\//, "").padEnd(46)} ${conns.size} 条 TCP 连接`);
    }
    const sameOrigin = [...connByOrigin.entries()].find(([o]) => url.startsWith(o));
    if (sameOrigin && byProto.get("http/1.1")) {
      const n = settled.filter((r) => { try { return new URL(r.url).origin === sameOrigin[0]; } catch { return false; } }).length;
      if (n > 6) console.log(`    ⚠️ 同源 ${n} 个请求挤在 HTTP/1.1 的 6 条连接上 → 串行排队`);
    }

    console.log(`\n--- 最贵的 ${topN} 个资源`);
    for (const r of settled.sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, topN)) {
      const short = r.url.replace(/^https:\/\/[^/]+/, "").slice(0, 78);
      console.log(`    ${human(r.bytes || 0).padStart(9)}  ${classify(r.url, r.type).padEnd(5)} ${r.status ?? "…"}  ${short}`);
    }

    // 「谁还没回来」——`load` 事件要等**所有**子资源结束，只要有一个悬着就永远不来
    // （标签页一直转圈就是这个）。所以这里把没收到的请求单独列出来，
    // 那是唯一能解释 load 不触发的东西。
    const pending = settled.filter((r) => r.bytes === 0 && !r.failed && r.status === null);
    console.log(`\n--- 收尾时仍未完成的请求：${pending.length} 个`);
    for (const r of pending.slice(0, 12)) {
      console.log(`    ${classify(r.url, r.type).padEnd(6)} ${r.url.slice(0, 110)}`);
    }
    if (pending.length) console.log(`    ↑ 这些悬着一天，load 就一天不来`);

    const failed = settled.filter((r) => r.failed);
    if (failed.length) {
      console.log(`\n--- ⚠️ ${failed.length} 个请求失败`);
      for (const r of failed.slice(0, 10)) {
        console.log(`    ${r.failed}  ${r.url.slice(0, 100)}`);
      }
    }

    // 每张图什么时候到的 —— 比 LCP 候选更能回答「首屏那张图多久出现」。
    // 首页轮播会自动翻页，LCP 的末次候选会被后来的同尺寸大图不断刷新，
    // 拿它当首屏指标会把自动播放算进来。资源计时没有这个问题。
    const imgTiming = await evaluate(session, `(() => {
      const out = [];
      for (const img of document.images) {
        const src = img.currentSrc || img.src || '';
        const e = performance.getEntriesByType('resource').find((r) => r.name === src);
        out.push({
          src: src.slice(-58),
          visible: Math.round(img.getBoundingClientRect().width),
          done: img.complete && img.naturalWidth > 0,
          end: e ? Math.round(e.responseEnd) : null,
        });
      }
      return JSON.stringify(out);
    })()`).catch(() => "[]");
    const timings = JSON.parse(imgTiming || "[]");
    const painted = timings.filter((t) => t.end !== null).map((t) => t.end).sort((a, b) => a - b);
    console.log(`\n--- 图片到位时间（responseEnd，共 ${timings.length} 个 <img>）`);
    if (painted.length) console.log(`    第一张 ${painted[0]} ms   最后一张 ${painted[painted.length - 1]} ms`);
    for (const t of timings.slice(0, 12)) {
      const mark = t.done ? "✅" : "⏳";
      console.log(`    ${mark} ${String(t.end ?? "—").padStart(6)} ms  宽 ${String(t.visible).padStart(4)}px  ${t.src}`);
    }

    console.log(`\n--- 页面内运行时异常：${pageErrors.length} 条`);
    for (const e of pageErrors.slice(0, 10)) console.log(`    ⚠️ ${e}`);
    if (!pageErrors.length) console.log("    （无）");

    const images = JSON.parse(imgState || "[]");
    const loadedImgs = images.filter((i) => i.loaded);
    console.log(`\n--- <img> 元素：${images.length} 个，其中已加载 ${loadedImgs.length} 个`);
    for (const i of images.slice(0, 20)) {
      const mark = i.loaded ? "✅" : "⏳";
      console.log(`    ${mark} loading=${i.loading.padEnd(14)} ${i.src.slice(-70)}`);
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("实测失败：", err.message);
  process.exitCode = 1;
});
