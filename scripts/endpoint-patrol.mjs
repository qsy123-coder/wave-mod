/**
 * 入口巡检：盯着「残留 DNS 用户看到的是不是那张『网站已经暂停部署』页」这类问题。
 *
 * 为什么需要它：2026-09-23 站点从 Vercel 搬到首尔后，**Vercel 那边的域名绑定一直没摘**，
 * 于是任何一条解析路径残留旧 IP 的用户（运营商 DNS 超额缓存、路由器、浏览器内置解析器）
 * 都会命中 Vercel 那个 402 `DEPLOYMENT_DISABLED` 页。这个问题**完全静默** ——
 * 入库不报错、快照照常发、我们自己的机器还一切正常，最后是**用户**发现并来问的。
 * 用户都是电脑小白，教他们清 DNS 不现实，所以至少要让我们先知道。
 *
 * 判定规则抽成无副作用的纯函数（classifyProbe / worstSeverity），交给
 * scripts/endpoint-patrol.test.mjs 逐条锁住 —— 同 daka-classify.mjs 的形状：
 * 不读 argv、不读 env、import 时无副作用。
 *
 * 三项检查：
 *   ① 带 Host 头直打 Vercel anycast IP —— 还回 402 就说明残留用户又在看暂停页
 *   ② www.wave-mod.top 从公共 DNS 解析 —— 必须仍是首尔 IP
 *   ③ 新入口 go.sunnyrose.xyz 与主站 —— 必须 200
 *
 * 只有 critical 会让进程退出码为 1（→ GitHub Actions 报红并给仓库主发邮件）。
 * warn 只打印，因为它是「可接受的退化」（例如兜底项目拆掉后 Vercel 回 404）。
 *
 * 用法：node scripts/endpoint-patrol.mjs
 * 无第三方依赖，只用 Node 内置模块。
 */
import { request } from "node:https";
import { Resolver } from "node:dns/promises";
import { pathToFileURL } from "node:url";

/** 首尔自托管服务器 */
export const SEOUL_IP = "43.133.78.46";
/** 规范主站（也是 NEXT_PUBLIC_SITE_URL 的值） */
export const CANONICAL_HOST = "www.wave-mod.top";
/** 新入口：全新主机名，无 DNS 缓存包袱，见 docs/域名入口拓扑.md */
export const ALT_HOST = "go.sunnyrose.xyz";

/** 兜底重定向部署后，Vercel 端应该把旧域名跳到这个前缀 */
const REDIRECT_TARGET_PREFIX = `https://${ALT_HOST}`;

/**
 * Vercel 的共享 anycast IP。旧 DNS 记录曾经解析到的就是这一组，
 * 所以残留用户命中的也是这一组。2026-09-24 实测六个都返回 402 DEPLOYMENT_DISABLED。
 */
const VERCEL_PROBE_IPS = [
  "76.76.21.21",
  "76.76.21.61",
  "76.76.21.98",
  "66.33.60.66",
  "66.33.60.34",
  "216.198.79.1",
];

/** 用来判断「解析结果是 Vercel」的网段前缀 */
const VERCEL_IP_PREFIXES = ["76.76.21.", "66.33.60.", "216.198.79.", "64.29.17."];

/**
 * 公共 DNS：挑一个国内的（223.5.5.5）+ 一个国外的（1.1.1.1）。
 * 国内那台是关键 —— 它代表「大陆用户会拿到什么」。
 */
const PUBLIC_DNS = [
  { label: "aliyun", server: "223.5.5.5" },
  { label: "cloudflare", server: "1.1.1.1" },
];

const SEVERITY_ORDER = { ok: 0, warn: 1, critical: 2 };

/** 取最严重的等级；空数组按 ok 处理（没有检查就没有问题） */
export function worstSeverity(list) {
  let worst = "ok";
  for (const s of list) {
    if ((SEVERITY_ORDER[s] ?? 0) > SEVERITY_ORDER[worst]) worst = s;
  }
  return worst;
}

/** 响应头 key 大小写不敏感（Node 回调里是小写，人工核对时常常是大写） */
function headerValue(headers, name) {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return Array.isArray(v) ? v[0] : v;
  }
  return undefined;
}

/**
 * 把一次探测结果判成 ok / warn / critical。
 *
 * @param {object} p
 * @param {"vercel-edge"|"site"|"dns"} p.kind
 * @param {number|null} p.status     HTTP 状态码；连不上或 DNS 检查时为 null
 * @param {object} [p.headers]       响应头
 * @param {string} [p.error]         失败原因（网络错误码等）
 * @param {string} [p.host]          被探测的主机名（site 判定误 301 时需要）
 * @param {string[]} [p.addresses]   kind=dns 时的解析结果
 * @returns {{ severity: "ok"|"warn"|"critical", reason: string }}
 */
export function classifyProbe({ kind, status, headers = {}, error, host, addresses }) {
  if (kind === "dns") return classifyDns({ addresses, host });
  if (kind === "vercel-edge") return classifyVercelEdge({ status, headers, error });

  // kind === "site"
  if (status === null || status === undefined) {
    return { severity: "critical", reason: `站点不可达（${error ?? "无响应"}）` };
  }
  if (status >= 500) {
    return { severity: "critical", reason: `站点返回 ${status}` };
  }
  if (status >= 300 && status < 400) {
    const location = headerValue(headers, "location") ?? "";
    // 实测本机 nginx 对未知 Host 会回落到该端口的第一个 server block（apex 的 301 块），
    // 直接跳到 www —— 那意味着新入口根本没配上，用户会被弹回有缓存包袱的域名。
    if (location.includes(CANONICAL_HOST) && host !== CANONICAL_HOST) {
      return {
        severity: "critical",
        reason: `被误 301 到 ${CANONICAL_HOST}（server_name 没生效，用户会被弹回旧域名）`,
      };
    }
    return { severity: "warn", reason: `${status} → ${location || "未知目标"}` };
  }
  if (status >= 200 && status < 300) {
    return { severity: "ok", reason: `${status}` };
  }
  return { severity: "warn", reason: `意外状态码 ${status}` };
}

function classifyVercelEdge({ status, headers, error }) {
  if (status === null || status === undefined) {
    // Vercel 换了 anycast IP 就会连不上。判「测不了」而不是「有故障」，避免假警报。
    return { severity: "warn", reason: `连不上 Vercel 边缘（${error ?? "无响应"}）` };
  }

  const vercelError = headerValue(headers, "x-vercel-error");
  if (vercelError === "DEPLOYMENT_DISABLED" || status === 402) {
    return {
      severity: "critical",
      reason: `Vercel 仍在替该域名应答 ${vercelError ?? status} —— 残留 DNS 用户看到的是「网站已暂停部署」`,
    };
  }

  if (status === 307 || status === 308) {
    const location = headerValue(headers, "location") ?? "";
    if (location.startsWith(REDIRECT_TARGET_PREFIX)) {
      return { severity: "ok", reason: `${status} → ${location}` };
    }
    return { severity: "warn", reason: `${status} 跳到了非预期目标：${location || "未知"}` };
  }

  if (status === 404) {
    // 兜底项目拆掉之后就是这个形状：残留用户看到普通 404，而不是那张吓人的暂停页。
    // 这是可接受的退化，不该每天报红。
    return { severity: "warn", reason: "Vercel 已不认领该域名（残留用户看到 404，可接受）" };
  }

  return { severity: "warn", reason: `Vercel 边缘返回意外状态码 ${status}` };
}

function classifyDns({ addresses, host }) {
  const list = (addresses ?? []).filter(Boolean);
  const label = host ?? CANONICAL_HOST;
  if (list.length === 0) {
    return { severity: "critical", reason: `${label} 解析不出任何地址` };
  }
  const bad = list.filter((ip) => ip !== SEOUL_IP);
  if (bad.length === 0) {
    return { severity: "ok", reason: `${label} → ${SEOUL_IP}` };
  }
  const isVercel = bad.some((ip) => VERCEL_IP_PREFIXES.some((p) => ip.startsWith(p)));
  return {
    severity: "critical",
    reason: isVercel
      ? `${label} 解析到了 Vercel 的 IP（${bad.join(", ")}）—— A 记录被改回去了`
      : `${label} 解析到了非预期 IP（${bad.join(", ")}）`,
  };
}

// ---------------------------------------------------------------------------
// IO 层
// ---------------------------------------------------------------------------

/**
 * 按域名正常连（走系统解析、校验证书）。
 * 校验证书是刻意的：证书过期是我们要发现的一类故障。
 */
function probeByHost(host, path = "/", timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = request(
      {
        host,
        port: 443,
        path,
        method: "GET",
        headers: { Host: host, "User-Agent": "wavemod-endpoint-patrol" },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode, headers: res.headers, error: undefined });
      },
    );
    req.on("timeout", () => req.destroy(new Error("ETIMEDOUT")));
    req.on("error", (err) => resolve({ status: null, headers: {}, error: err.code || err.message }));
    req.end();
  });
}

/**
 * 连指定 IP、但 SNI / Host 用真实域名 —— 这样 Vercel 才会按 Host 路由到对应项目。
 * 这里不校验证书：我们连的是 IP，要的是「这个 IP 是否还在替这个域名应答」这个事实，
 * 不是信任决策。证书本身由 probeByHost 那一侧校验。
 */
function probeByIp(host, ip, path = "/", timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = request(
      {
        host: ip,
        port: 443,
        path,
        method: "GET",
        servername: host,
        checkServerIdentity: () => undefined,
        headers: { Host: host, "User-Agent": "wavemod-endpoint-patrol" },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode, headers: res.headers, error: undefined });
      },
    );
    req.on("timeout", () => req.destroy(new Error("ETIMEDOUT")));
    req.on("error", (err) => resolve({ status: null, headers: {}, error: err.code || err.message }));
    req.end();
  });
}

/** 用指定 DNS 服务器解析 A 记录，失败返回空数组（由 classifyProbe 判成 critical） */
async function resolveVia(server, host) {
  const resolver = new Resolver({ timeout: 8000, tries: 2 });
  resolver.setServers([server]);
  try {
    return await resolver.resolve4(host);
  } catch {
    return [];
  }
}

function fmt(severity) {
  if (severity === "critical") return "CRITICAL";
  if (severity === "warn") return "warn";
  return "ok";
}

async function main() {
  /** @type {{ name: string, severity: string, reason: string }[]} */
  const results = [];
  const record = (name, v) => {
    results.push({ name, severity: v.severity, reason: v.reason });
    console.log(`[${fmt(v.severity).padEnd(8)}] ${name} — ${v.reason}`);
  };

  console.log("=== 入口巡检 ===");

  // ① 旧端点：Vercel 还在替这个域名应答吗
  for (const ip of VERCEL_PROBE_IPS) {
    const r = await probeByIp(CANONICAL_HOST, ip);
    record(`vercel-edge ${ip}`, classifyProbe({ kind: "vercel-edge", ...r }));
  }

  // ② A 记录是否仍指向首尔（含国内解析器，代表大陆用户会拿到什么）
  for (const { label, server } of PUBLIC_DNS) {
    const addresses = await resolveVia(server, CANONICAL_HOST);
    record(`dns ${label} (${server})`, classifyProbe({ kind: "dns", addresses, host: CANONICAL_HOST }));
  }

  // ③ 两个入口自己是否活着（证书也顺带校验）
  for (const host of [ALT_HOST, CANONICAL_HOST]) {
    const r = await probeByHost(host);
    record(`site ${host}`, classifyProbe({ kind: "site", host, ...r }));
  }

  const severity = worstSeverity(results.map((r) => r.severity));
  const criticals = results.filter((r) => r.severity === "critical");
  const warns = results.filter((r) => r.severity === "warn");

  console.log(`\n=== 总结：${fmt(severity)}（critical ${criticals.length} / warn ${warns.length}）`);

  const summary = [
    `入口巡检：**${fmt(severity)}**`,
    "",
    ...results.map((r) => `- \`${r.severity}\` **${r.name}** — ${r.reason}`),
  ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf8");
  }

  // 只有 critical 让 job 报红 —— warn 是可接受的退化，天天报红会让告警被无视。
  if (severity === "critical") process.exitCode = 1;
}

// 只在直接运行时执行，被 vitest import 时不跑（纯函数必须无副作用）
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("巡检本身崩了：", err);
    process.exitCode = 1;
  });
}
