/**
 * 皮肤零位移验收 —— 逐元素比对几何坐标
 *
 * 为什么不用截图 diff：
 *   换成新拟物皮肤后**颜色本来就该变**，截图 diff 会把"颜色变了"和"位置变了"
 *   混在一起报出来，还得额外做遮罩。而本次要证的恰恰是"颜色变、坐标不变"，
 *   所以直接量 `getBoundingClientRect()` 更锋利 —— 它把这件事变成一个
 *   可以判定真假的命题，而不是靠肉眼。
 *
 * 做法：
 *   同一次页面加载内测两遍，中途只切 `<html>` 上的皮肤类名。DOM 结构、元素身份、
 *   图片、字体全都相同，因此两遍的差异**只可能**来自样式 ⇒ 变量唯一，结论可信。
 *   两遍之间不重新加载，也就不会引入加载时序造成的假差异。
 *
 * 用法：
 *   node scripts/verify-theme-layout-shift.mjs --url=http://127.0.0.1:3000/ \
 *        --from=theme-arcade --to=theme-neumorphism
 *
 *   --viewport=1440x900        默认 1440x900
 *   --tolerance=0.01           px，小于此差值视为相同（浮点噪声）
 *   --shot=<path.png>          额外存一张切换后的截图，方便肉眼复核
 *   --all-themes               与 THEMES 里每一款都比一遍（默认只比 --from/--to）
 */

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const ALL_THEMES = [
  "theme-arcade",
  "theme-sunset-flyer",
  "theme-night-neon",
  "theme-macaron",
  "theme-haze-blue",
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

const args = parseArgs(process.argv);
const url = typeof args.url === "string" ? args.url : "http://127.0.0.1:3000/";
const fromTheme = typeof args.from === "string" ? args.from : "theme-arcade";
const targetThemes = args["all-themes"]
  ? ALL_THEMES.filter((t) => t !== fromTheme)
  : [typeof args.to === "string" ? args.to : "theme-neumorphism"];
const tolerance = args.tolerance !== undefined ? Number(args.tolerance) : 0.01;
const [vw, vh] = String(args.viewport ?? "1440x900").split("x").map(Number);
/** 截图倍率。只看局部细节时调到 2，比放大整个视口更省时间。 */
const scale = args.scale !== undefined ? Number(args.scale) : 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简 CDP 客户端：够用即可，不引依赖（项目规范禁止引入未使用的库）。 */
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

  once(method, timeoutMs = 30000) {
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

/**
 * 在页面里取所有元素的几何快照。
 *
 * 用 DOM 顺序下标做元素身份：两遍之间结构完全没动，所以下标是一一对应的，
 * 比拼 CSS 选择器路径更准也更省事。
 */
const SNAPSHOT_FN = `(() => {
  const els = document.querySelectorAll('*');
  const rects = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    rects.push([r.x, r.y, r.width, r.height]);
  }
  return JSON.stringify({
    count: els.length,
    docHeight: document.documentElement.scrollHeight,
    docWidth: document.documentElement.scrollWidth,
    rects,
  });
})()`;

/** 等字体与图片都就绪，否则两遍测量之间可能因为图片陆续解码而发生假位移。 */
const READY_FN = `(() => {
  const imgs = Array.from(document.images);
  const imgsDone = imgs.every((i) => i.complete);
  const fontsDone = !document.fonts || document.fonts.status === 'loaded';
  return imgsDone && fontsDone;
})()`;

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
 * 探针：把匹配到的元素的计算样式打出来。
 *
 * 光看截图容易把"图片没加载"误判成"样式错了"，也看不出某个色到底是从哪条规则
 * 来的。这里直接量计算值，用来定位问题比肉眼可靠。
 */
const PROBE_FN = (selector) => `(() => {
  const out = [];
  for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
    if (out.length >= 12) break;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 120),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 60),
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      radius: cs.borderTopLeftRadius,
      color: cs.color,
      shadow: cs.boxShadow.slice(0, 80),
    });
  }
  return JSON.stringify(out, null, 1);
})()`;

/** 图片加载体检：naturalWidth 为 0 说明这张图**没加载出来**，不是样式问题。 */
const IMG_FN = `(() => {
  const bad = [];
  let total = 0;
  for (const img of document.images) {
    total++;
    if (!img.complete || img.naturalWidth === 0) {
      bad.push({ src: (img.currentSrc || img.src || '').slice(0, 110), w: img.naturalWidth });
    }
  }
  return JSON.stringify({ total, failed: bad }, null, 1);
})()`;

/** 元素身份的可读描述，仅用于把"第 813 个元素变了"翻译成人能看懂的东西。 */
const DESCRIBE_FN = (index) => `(() => {
  const el = document.querySelectorAll('*')[${index}];
  if (!el) return '(不存在)';
  const cls = (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean).slice(0, 4).join(' ');
  const id = el.id ? '#' + el.id : '';
  return el.tagName.toLowerCase() + id + (cls ? '.' + cls.split(' ').join('.') : '');
})()`;

async function main() {
  const chromePath = findChrome();
  const userDataDir = mkdtempSync(join(tmpdir(), "wavemod-cdp-"));
  const port = 9333 + Math.floor(process.pid % 500);

  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
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
    // 等 devtools 端口起来
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
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: vw, height: vh, deviceScaleFactor: scale, mobile: false,
    });

    // 先把皮肤类名挂到 <html> 上，等价于用户已经选过——但页面本身是静态的，
    // 这一步不需要 cookie 参与，避免依赖登录/cookie 状态。
    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{document.documentElement.classList.remove(${JSON.stringify(ALL_THEMES)});document.documentElement.classList.add(${JSON.stringify(fromTheme)});}catch(e){}`,
    });

    const loaded = session.once("Page.loadEventFired");
    await session.send("Page.navigate", { url });
    await loaded;

    // 等资源稳定（最多 15s），保证两遍测量都发生在"资源已就绪"之后
    for (let i = 0; i < 60; i++) {
      if (await evaluate(session, READY_FN)) break;
      await sleep(250);
    }

    // 滚一遍触发 IntersectionObserver 懒加载的内容（如首页第二屏）。
    // 不滚的话量到的只是首屏，第二屏的新拟物效果根本没被验证过。
    //
    // ⚠️ 首页的滚动者**不是 window**，而是 `[data-scroll-lock-root]` 那个内层容器
    // （见 `src/app/(home)/page.tsx` 的 SnapContainer）。只滚 window 的话第二屏
    // 永远不会进入视口、懒加载不触发，测出来的"零位移"就只是首屏的零位移。
    await evaluate(session, `(async () => {
      const findScroller = () => {
        const marked = document.querySelector('[data-scroll-lock-root]');
        if (marked && marked.scrollHeight > marked.clientHeight + 4) return marked;
        for (const el of document.querySelectorAll('div,main,section')) {
          const cs = getComputedStyle(el);
          if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
        }
        return document.scrollingElement || document.documentElement;
      };
      const scroller = findScroller();
      const step = Math.max(200, Math.round((scroller.clientHeight || window.innerHeight) * 0.8));
      for (let y = 0; y < scroller.scrollHeight; y += step) {
        scroller.scrollTo(0, y);
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      scroller.scrollTo(0, scroller.scrollHeight);
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
    })()`);
    // 懒加载的内容到达后还要等它自己的图片解码完
    for (let i = 0; i < 60; i++) {
      if (await evaluate(session, READY_FN)) break;
      await sleep(250);
    }
    await sleep(800);
    // 回到顶部：内层滚动容器与 window 都要复位，否则第二屏仍占着视口，
    // 后面拍出来的"首屏"截图其实是第二屏。
    await evaluate(session, `(() => {
      const marked = document.querySelector('[data-scroll-lock-root]');
      if (marked) marked.scrollTo(0, 0);
      for (const el of document.querySelectorAll('div,main,section')) {
        if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTo(0, 0);
      }
      window.scrollTo(0, 0);
      return true;
    })()`);
    await sleep(300);

    // 冻结动画与过渡再测量。
    // 站内有跑马灯（顶部 ticker）、弹跳箭头这类**持续跑着的动画**，它们的
    // transform 每帧都在变 —— 不冻住的话，两遍快照之间它们必然"位移"，
    // 真正的布局问题会被这堆噪声淹没。
    // 冻结样式对两遍快照一视同仁（同一元素、同一基准位置），所以不会掩盖真实差异。
    await evaluate(session, `(() => {
      const style = document.createElement('style');
      style.id = '__wavemod_freeze';
      style.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;}';
      document.head.appendChild(style);
      return true;
    })()`);
    await sleep(300);

    const setTheme = (theme) => evaluate(session, `(() => {
      const d = document.documentElement;
      d.classList.remove(...${JSON.stringify(ALL_THEMES)});
      d.classList.add(${JSON.stringify(theme)});
      return d.className;
    })()`);

    /** 反复量几次直到连续两次结果一致，避免把"还在重排"当成位移。 */
    const stableSnapshot = async () => {
      let prev = null;
      for (let i = 0; i < 10; i++) {
        const cur = await evaluate(session, SNAPSHOT_FN);
        if (prev === cur) return JSON.parse(cur);
        prev = cur;
        await sleep(200);
      }
      return JSON.parse(prev);
    };

    let anyFailure = false;

    for (const theme of targetThemes) {
      /**
       * 取一对可信的快照。
       *
       * 首页有**自动推进的轮播**，每几秒就会改 DOM（换文案、条件渲染）。如果
       * 基线快照和对照快照之间正好跨了一次推进，两边元素下标就会错位，比出来
       * 一堆"位移"全是假的 —— 实测踩过一次：报了 803 处，数值一看就是
       * 6×6 的元素对上了 59×16.5 的元素。
       *
       * 所以这里跑 A→B→A：只有**前后两次 A 完全一致**，才说明测量窗口内页面
       * 是静止的，此时的 B 才可信。不稳定就重试，重试到头还不稳就如实说
       * "本次结论不可信"，而不是给一个看起来很确定、实则无意义的数字。
       */
      let baseline = null;
      let after = null;
      let stable = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        await setTheme(fromTheme);
        const a1 = await stableSnapshot();
        await setTheme(theme);
        const b1 = await stableSnapshot();
        await setTheme(fromTheme);
        const a2 = await stableSnapshot();
        if (JSON.stringify(a1) === JSON.stringify(a2)) {
          baseline = a1;
          after = b1;
          stable = true;
          break;
        }
      }

      // 稳定性自检的最后一步停在 fromTheme 上（A→B→A），这里必须切回目标皮肤，
      // 否则后面的探针/截图拍到的其实是基准皮肤 —— 实测踩过，截出来的图是错的。
      await setTheme(theme);

      const diffs = [];
      const exceptions = [];

      /**
       * 声明式例外：--allow=<选择器> 命中的元素，其自身几何允许变化。
       *
       * 只用于**装饰性、且脱离文档流**的层（如 ZZZ 首页头图那个 position:fixed
       * 的全屏背景：新拟物下被"收"成一张圆角相框卡片）。这类层动不了任何内容，
       * 但它自己的坐标确实变了 —— 如果任由它算进失败，真正的位移就会被淹没；
       * 如果直接跳过，又成了静默放过。所以单独列出来，并且**打印命中了几个**。
       */
      let allowed = new Set();
      if (!stable) {
        // 不稳时下面直接放弃了，不必再算例外
      } else if (typeof args.allow === "string") {
        const indices = await evaluate(session, `(() => {
          const matched = new Set(document.querySelectorAll(${JSON.stringify(args.allow)}));
          const out = [];
          document.querySelectorAll('*').forEach((el, i) => { if (matched.has(el)) out.push(i); });
          return JSON.stringify(out);
        })()`);
        allowed = new Set(JSON.parse(indices));
        console.log(`（--allow 命中 ${allowed.size} 个元素，其自身位移不计入失败）`);
      }

      if (!stable) {
        console.log(`\n=== ${fromTheme} → ${theme} ===`);
        console.log("⚠️ 页面在测量窗口内持续变化（轮播自动推进？），本次结论不可信，已放弃");
        anyFailure = true;
        continue;
      }
      if (baseline.count !== after.count) {
        diffs.push({ index: -1, note: `元素数量从 ${baseline.count} 变成 ${after.count}` });
      }
      const n = Math.min(baseline.rects.length, after.rects.length);
      for (let i = 0; i < n; i++) {
        const [bx, by, bw, bh] = baseline.rects[i];
        const [ax, ay, aw, ah] = after.rects[i];
        if (
          Math.abs(bx - ax) > tolerance ||
          Math.abs(by - ay) > tolerance ||
          Math.abs(bw - aw) > tolerance ||
          Math.abs(bh - ah) > tolerance
        ) {
          const entry = {
            index: i,
            before: [bx, by, bw, bh].map((v) => Number(v.toFixed(2))),
            after: [ax, ay, aw, ah].map((v) => Number(v.toFixed(2))),
          };
          (allowed.has(i) ? exceptions : diffs).push(entry);
        }
      }

      const docShift =
        baseline.docHeight !== after.docHeight || baseline.docWidth !== after.docWidth;

      console.log(`\n=== ${fromTheme} → ${theme} ===`);
      console.log(`元素数 ${after.count}，文档 ${after.docWidth}x${after.docHeight}`);

      if (!diffs.length && !docShift) {
        console.log(
          exceptions.length
            ? `✅ 零位移：除 ${exceptions.length} 个已声明例外外，所有元素坐标与尺寸完全一致`
            : "✅ 零位移：所有元素坐标与尺寸完全一致",
        );
      } else {
        anyFailure = true;
        if (docShift) {
          console.log(
            `⚠️ 文档尺寸变化：${baseline.docWidth}x${baseline.docHeight} → ${after.docWidth}x${after.docHeight}`,
          );
        }
        console.log(`⚠️ ${diffs.length} 个元素发生位移/变形，前 20 个：`);
        for (const d of diffs.slice(0, 20)) {
          const who = d.index >= 0 ? await evaluate(session, DESCRIBE_FN(d.index)) : d.note;
          console.log(`   ${who}`);
          if (d.before) console.log(`      ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`);
        }
        if (diffs.length > 20) console.log(`   …另有 ${diffs.length - 20} 个`);
      }

      if (exceptions.length) {
        console.log(`ℹ️ ${exceptions.length} 个已声明例外（自身几何变化，不影响内容）：`);
        for (const e of exceptions.slice(0, 8)) {
          const who = await evaluate(session, DESCRIBE_FN(e.index));
          console.log(`   ${who}  ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`);
        }
        if (exceptions.length > 8) console.log(`   …另有 ${exceptions.length - 8} 个`);
      }

      if (typeof args.probe === "string") {
        console.log(`\n🔍 探针 ${args.probe}`);
        console.log(await evaluate(session, PROBE_FN(args.probe)));
      }
      if (args["check-images"]) {
        console.log("\n🖼 图片加载情况");
        console.log(await evaluate(session, IMG_FN));
      }

      // 截图前先点某个元素（如移动端导航按钮），用于验证弹层内的内容
      if (typeof args.click === "string") {
        const r = await evaluate(session, `(async () => {
          const el = document.querySelector(${JSON.stringify(args.click)});
          if (!el) return 'NOT_FOUND';
          el.click();
          await new Promise((r) => setTimeout(r, 600));
          return 'OK';
        })()`);
        console.log(`🖱 点击 ${args.click} → ${r}`);
        if (r === "NOT_FOUND") anyFailure = true;
      }

      if (args["scroll-to"] !== undefined) {
        // 截图前把内层滚动容器挪到指定位置，用于看第二屏之类不在首屏的内容
        await evaluate(session, `(() => {
          const y = ${Number(args["scroll-to"])};
          const marked = document.querySelector('[data-scroll-lock-root]');
          if (marked) marked.scrollTo(0, y);
          window.scrollTo(0, y);
          return true;
        })()`);
        await sleep(400);
      }

      if (typeof args.shot === "string") {
        const shotPath = targetThemes.length > 1
          ? args.shot.replace(/\.png$/, `-${theme}.png`)
          : args.shot;
        const shot = await session.send("Page.captureScreenshot", {
          format: "png",
          // 默认整页；只想看首屏细节时用 --viewport-only 拍当前视口
          captureBeyondViewport: !args["viewport-only"],
        });
        writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
        console.log(`📷 截图：${shotPath}`);
      }
    }

    // ── 交互链路检查：点一下「风格」下拉里的「新拟物」，看类名与 cookie 有没有跟上。
    // 光看静态样式不够 —— 换肤如果没写进 cookie，刷新就丢，而首屏防闪脚本也失效。
    if (args["check-switcher"]) {
      console.log("\n=== 切换器交互检查 ===");
      await setTheme(fromTheme);

      const clicked = await evaluate(session, `(async () => {
        const trigger = document.querySelector('.theme-switcher-trigger');
        if (!trigger) return { ok: false, why: '找不到 .theme-switcher-trigger（桌面下拉按钮）' };
        trigger.click();
        await new Promise((r) => setTimeout(r, 350));
        const items = Array.from(document.querySelectorAll('.theme-switcher-item'));
        const labels = items.map((el) => el.textContent.trim().slice(0, 24));
        const target = items.find((el) => el.textContent.includes('新拟物'));
        if (!target) return { ok: false, why: '下拉里没有「新拟物」选项', labels };
        target.click();
        await new Promise((r) => setTimeout(r, 350));
        return {
          ok: true,
          labels,
          htmlClass: document.documentElement.className,
          cookie: document.cookie,
        };
      })()`);

      if (!clicked.ok) {
        anyFailure = true;
        console.log(`❌ ${clicked.why}`);
        if (clicked.labels) console.log(`   实际选项：${JSON.stringify(clicked.labels)}`);
      } else {
        const hasClass = clicked.htmlClass.includes("theme-neumorphism");
        const hasCookie = /wavemod-theme=theme-neumorphism/.test(clicked.cookie);
        console.log(`下拉选项（${clicked.labels.length} 项）：${JSON.stringify(clicked.labels)}`);
        console.log(`${hasClass ? "✅" : "❌"} <html> 类名：${clicked.htmlClass}`);
        console.log(`${hasCookie ? "✅" : "❌"} cookie：${clicked.cookie || "(空)"}`);
        if (!hasClass || !hasCookie) anyFailure = true;
      }
    }

    // ── 首屏防闪检查
    // 把**服务端真实下发的那段内联脚本**从 HTML 里抠出来，喂一个 cookie 执行一遍。
    // 直接测线上要跑的那段代码，而不是另写一份等价逻辑 —— 后者测的是我的复述。
    if (args["check-bootstrap"]) {
      console.log("\n=== 首屏防闪脚本检查 ===");
      const html = await fetch(url).then((r) => r.text());
      const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => m[1])
        .filter((s) => s.includes("wavemod-theme"));

      if (!blocks.length) {
        anyFailure = true;
        console.log("❌ 下发的 HTML 里找不到防闪脚本（没内联在 <head>？）");
      } else {
        console.log(`找到 ${blocks.length} 段含 wavemod-theme 的内联脚本`);

        // 每个用例都要显式声明 localStorage 的初始状态。
        // 脚本在 cookie 无效时会回退到 localStorage（老用户迁移路径），所以不把
        // 它清干净的话，前一个交互用例写进去的值会污染后面的期望 —— 实测踩过。
        const CASES = [
          { cookie: "wavemod-theme=theme-haze-blue", legacy: null, expect: "theme-haze-blue", why: "有效 cookie" },
          { cookie: "wavemod-theme=theme-night-neon", legacy: null, expect: "theme-night-neon", why: "有效 cookie" },
          { cookie: "wavemod-theme=完全不是皮肤", legacy: null, expect: fromTheme, why: "非法值 + 无 legacy → 回落默认" },
          { cookie: "随便=别的", legacy: null, expect: fromTheme, why: "无 cookie + 无 legacy → 默认" },
          { cookie: "随便=别的", legacy: "theme-macaron", expect: "theme-macaron", why: "无 cookie + 有 legacy → 迁移老值" },
          { cookie: "wavemod-theme=theme-haze-blue", legacy: "theme-macaron", expect: "theme-haze-blue", why: "cookie 优先于 legacy" },
        ];

        for (const c of CASES) {
          const result = await evaluate(session, `(() => {
            const d = document.documentElement;
            d.classList.remove(...${JSON.stringify(ALL_THEMES)});
            d.classList.add(${JSON.stringify(fromTheme)});
            try {
              ${c.legacy === null
                ? "localStorage.removeItem('wavemod-theme');"
                : `localStorage.setItem('wavemod-theme', ${JSON.stringify(c.legacy)});`}
            } catch (e) {}
            document.cookie = ${JSON.stringify(c.cookie)} + '; Path=/';
            ${blocks[0]}
            const out = d.className;
            document.cookie = 'wavemod-theme=; Path=/; Max-Age=0';
            try { localStorage.removeItem('wavemod-theme'); } catch (e) {}
            return out;
          })()`);
          const applied = ALL_THEMES.find((t) => result.includes(t));
          const pass = applied === c.expect;
          if (!pass) anyFailure = true;
          console.log(`${pass ? "✅" : "❌"} ${c.why}：cookie「${c.cookie}」legacy=${c.legacy ?? "无"} → ${applied}（期望 ${c.expect}）`);
        }
      }
    }

    process.exitCode = anyFailure ? 1 : 0;
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("验收失败：", err.message);
  process.exitCode = 1;
});
