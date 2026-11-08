/**
 * Vercel 部署清理：只保留最近 N 个部署，其余删掉。
 *
 * 为什么需要它：Hobby 的 Deployment Storage 只有 10 GB，2026-09 起还取消了超额宽限期
 * （超了直接删超额部署，新部署也会被阻塞）。本站一天推 3~4 个部署、项目保留策略是
 * 30 天，稳态约 100 个部署 ≈ 8~9 GB —— 正好贴着 10 GB 的天花板。定期裁到最近 N 个，
 * 存储就稳定在 2~3 GB，不会每个月再撞一次。
 *
 * 安全边界（故意写死，不做成开关）：
 *   - 永远保留最新的 N 个（默认 20），不看状态；
 *   - 只删 READY / ERROR / CANCELED，BUILDING / QUEUED / INITIALIZING 一律跳过；
 *   - 比 --min-age-days（默认 3 天）新的不删 —— 防止一天爆发几十个部署时把刚上线的
 *     版本卷进去；
 *   - 删掉的部署可在 Vercel「Settings → Security → Recently Deleted」30 天内恢复，
 *     但它的直链会失效。
 *
 * 用法：
 *   node scripts/vercel-prune-deployments.mjs --dry-run          # 先看，不删
 *   node scripts/vercel-prune-deployments.mjs                    # 真删（留最近 20 个）
 *   node scripts/vercel-prune-deployments.mjs --keep=30 --min-age-days=7
 *
 * 需要 VERCEL_TOKEN 环境变量；projectId / teamId 默认读 .vercel/project.json，
 * 也可用 VERCEL_PROJECT_ID / VERCEL_TEAM_ID 覆盖。
 *
 * 本机跑要走代理（系统代理默认关，Clash 只开 127.0.0.1:7897）：
 *   $env:HTTPS_PROXY='http://127.0.0.1:7897'; $env:NODE_USE_ENV_PROXY='1'
 * GitHub Actions 里直连，不需要代理。
 *
 * 选择逻辑抽成无副作用的纯函数，由 scripts/vercel-prune-deployments.test.mjs 锁住；
 * import 本文件不会发请求、不会读 env。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERCEL_API = "https://api.vercel.com";
const PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 默认保留多少个部署。20 个 ≈ 1.7 GB，给 10 GB 上限留足余量。 */
export const DEFAULT_KEEP = 20;
/** 默认只删 3 天以前的部署（新部署一律不动）。 */
export const DEFAULT_MIN_AGE_DAYS = 3;
/** 上次实测：87 个部署 ≈ 7.6 GB，约 85 MB/个。只用于打印「预计释放」的估算，不参与决策。 */
export const ESTIMATED_MB_PER_DEPLOYMENT = 85;

/** 只有这些终态才允许删除；构建中的部署删了会让 Vercel 侧报错。 */
export const DELETABLE_STATES = new Set(["READY", "ERROR", "CANCELED"]);

/** createdAt / created 两种字段在 v6 列表和 v13 详情里不一样，统一取毫秒时间戳 */
export function createdAtOf(deployment) {
  const raw = deployment?.createdAt ?? deployment?.created ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 决定哪些部署该删。
 *
 * @param {object[]} deployments            Vercel /v6/deployments 返回的数组（可乱序）
 * @param {object}   [options]
 * @param {number}   [options.keep]         保留最新几个（必须 ≥ 1）
 * @param {number}   [options.minAgeMs]     比这个更年轻的部署不删
 * @param {number}   [options.now]          当前时间（毫秒），测试注入用
 * @returns {{ kept: object[], remove: object[], skipped: { deployment: object, reason: string }[] }}
 */
export function selectDeploymentsToDelete(
  deployments,
  { keep = DEFAULT_KEEP, minAgeMs = DEFAULT_MIN_AGE_DAYS * DAY_MS, now = Date.now() } = {},
) {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error(`keep 必须是 ≥ 1 的整数，收到 ${keep}`);
  }

  // createdAt 降序；同一毫秒内按 uid 排序，保证结果稳定可复现
  const ordered = [...deployments].sort((a, b) => {
    const diff = createdAtOf(b) - createdAtOf(a);
    if (diff !== 0) return diff;
    return String(a.uid ?? a.id ?? "").localeCompare(String(b.uid ?? b.id ?? ""));
  });

  const kept = ordered.slice(0, keep);
  const remove = [];
  const skipped = [];

  for (const deployment of ordered.slice(keep)) {
    const state = deployment.readyState ?? deployment.state ?? "UNKNOWN";
    if (!DELETABLE_STATES.has(state)) {
      skipped.push({ deployment, reason: `状态是 ${state}，不动` });
      continue;
    }
    if (now - createdAtOf(deployment) < minAgeMs) {
      skipped.push({ deployment, reason: "还在 min-age 保护期内" });
      continue;
    }
    remove.push(deployment);
  }

  return { kept, remove, skipped };
}

/**
 * 解析命令行参数。只认长选项，避免和 Node 自己的短选项冲突。
 *
 * @param {string[]} argv  process.argv.slice(2)
 */
export function parseArgs(argv) {
  const opts = {
    keep: DEFAULT_KEEP,
    minAgeDays: DEFAULT_MIN_AGE_DAYS,
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg.startsWith("--keep=")) {
      opts.keep = parsePositiveInt(arg.slice("--keep=".length), "--keep");
    } else if (arg.startsWith("--min-age-days=")) {
      opts.minAgeDays = parseNonNegativeNumber(arg.slice("--min-age-days=".length), "--min-age-days");
    } else {
      throw new Error(`未知参数：${arg}（用 --help 看用法）`);
    }
  }

  return opts;
}

function parsePositiveInt(raw, name) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} 必须是 ≥ 1 的整数，收到 ${raw}`);
  return n;
}

function parseNonNegativeNumber(raw, name) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} 必须是 ≥ 0 的数字，收到 ${raw}`);
  return n;
}

// ---------------------------------------------------------------------------
// IO 层
// ---------------------------------------------------------------------------

/**
 * 调 Vercel API。只走 Bearer token，不依赖 CLI 登录态
 * （本机 vercel CLI 一直 `fetch failed`，API 反而稳定）。
 */
async function vercelApi(token, pathname, init = {}) {
  return fetch(`${VERCEL_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function safeText(res) {
  try {
    const text = await res.text();
    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
  } catch {
    return "(无法读取响应体)";
  }
}

/**
 * 拉全量部署列表（分页）。v6 用 `until` 往前翻，一页最多 100 条。
 *
 * 加了 maxPages 兜底：本项目一天 3~4 个部署，30 天也就一百多个，正常一页就够；
 * 万一 API 分页语义变了也不会死循环。
 */
export async function listDeployments({ token, projectId, teamId, maxPages = 50 }) {
  const all = [];
  let until = null;

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      projectId,
      teamId,
      limit: String(PAGE_SIZE),
    });
    if (until !== null) qs.set("until", String(until));

    const res = await vercelApi(token, `/v6/deployments?${qs.toString()}`);
    if (!res.ok) {
      throw new Error(`拉部署列表失败：HTTP ${res.status} ${await safeText(res)}`);
    }

    const body = await res.json();
    const batch = Array.isArray(body.deployments) ? body.deployments : [];
    all.push(...batch);

    if (batch.length < PAGE_SIZE) break;

    const oldest = Math.min(...batch.map(createdAtOf));
    // 下一页从「最早的一条之前」开始；语义若变成包含式，这里直接收手
    if (!Number.isFinite(oldest) || (until !== null && oldest >= until)) break;
    until = oldest - 1;
  }

  return all;
}

/** 删一个部署。404 视为「已经没了」，不算失败（并发/人工删过）。 */
export async function deleteDeployment({ token, teamId, id }) {
  const res = await vercelApi(
    token,
    `/v13/deployments/${encodeURIComponent(id)}?teamId=${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );

  if (res.ok || res.status === 404) {
    return { ok: true, status: res.status, alreadyGone: res.status === 404 };
  }
  return { ok: false, status: res.status, detail: await safeText(res) };
}

/** 从 .vercel/project.json 读项目坐标；读不到就返回 null，交给 env 兜底。 */
async function readVercelProjectFile(cwd = process.cwd()) {
  try {
    const raw = await readFile(path.join(cwd, ".vercel", "project.json"), "utf8");
    const parsed = JSON.parse(raw);
    return {
      projectId: parsed.projectId ?? null,
      teamId: parsed.orgId ?? null,
    };
  } catch {
    return null;
  }
}

function formatDate(ms) {
  if (!ms) return "未知时间";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function shortSha(deployment) {
  const sha = deployment?.meta?.githubCommitSha;
  return typeof sha === "string" ? sha.slice(0, 7) : "-";
}

function shortMessage(deployment) {
  const msg = deployment?.meta?.githubCommitMessage;
  if (typeof msg !== "string" || msg.length === 0) return "(无提交信息)";
  const firstLine = msg.split("\n")[0];
  return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine;
}

function printHelp() {
  console.log(`Vercel 部署清理

用法：
  node scripts/vercel-prune-deployments.mjs [选项]

选项：
  --dry-run              只打印计划，不删除
  --keep=N               保留最近 N 个部署（默认 ${DEFAULT_KEEP}）
  --min-age-days=N       只删 N 天以前的部署（默认 ${DEFAULT_MIN_AGE_DAYS}）
  --help, -h             显示本帮助

环境变量：
  VERCEL_TOKEN          必填，Vercel 个人 Token
  VERCEL_PROJECT_ID     可选，默认读 .vercel/project.json
  VERCEL_TEAM_ID        可选，默认读 .vercel/project.json 的 orgId

本机走代理：
  $env:HTTPS_PROXY='http://127.0.0.1:7897'; $env:NODE_USE_ENV_PROXY='1'`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    console.error(
      "缺少 VERCEL_TOKEN 环境变量。Token 在本机 C:\\Users\\WINDOWS11\\.wavemod-secrets\\vercel.env；\n" +
        "GitHub Actions 里需要先在仓库 Settings → Secrets and variables → Actions 添加 VERCEL_TOKEN。",
    );
    process.exitCode = 1;
    return;
  }

  const projectFile = await readVercelProjectFile();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() || projectFile?.projectId;
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || projectFile?.teamId;

  if (!projectId || !teamId) {
    console.error("找不到 projectId / teamId：.vercel/project.json 缺失，且没有设置 VERCEL_PROJECT_ID / VERCEL_TEAM_ID。");
    process.exitCode = 1;
    return;
  }

  console.log("=== Vercel 部署清理 ===");
  console.log(`projectId: ${projectId}`);
  console.log(`teamId:    ${teamId}`);
  console.log(`策略:      保留最近 ${opts.keep} 个；只删 ${opts.minAgeDays} 天以前的 READY/ERROR/CANCELED`);
  if (opts.dryRun) console.log("模式:      dry-run（不会真的删）");

  const deployments = await listDeployments({ token, projectId, teamId });
  const { kept, remove, skipped } = selectDeploymentsToDelete(deployments, {
    keep: opts.keep,
    minAgeMs: opts.minAgeDays * DAY_MS,
  });

  console.log(`\n共 ${deployments.length} 个部署：保留 ${kept.length} / 待删 ${remove.length} / 跳过 ${skipped.length}`);

  for (const { deployment, reason } of skipped) {
    console.log(`  跳过 ${deployment.uid ?? deployment.id}  ${formatDate(createdAtOf(deployment))}  ${reason}`);
  }

  if (remove.length === 0) {
    console.log("\n没有需要删的部署。");
    return;
  }

  console.log("\n待删清单（从新到旧）：");
  for (const deployment of remove) {
    console.log(
      `  ${deployment.uid ?? deployment.id}  ${formatDate(createdAtOf(deployment))}  ${shortSha(deployment)}  ${shortMessage(deployment)}`,
    );
  }

  const estimatedGb = (remove.length * ESTIMATED_MB_PER_DEPLOYMENT) / 1024;
  console.log(`\n预计释放 ≈ ${estimatedGb.toFixed(2)} GB（按 ${ESTIMATED_MB_PER_DEPLOYMENT} MB/个估算）`);

  /** @type {{ uid: string, status: number, detail?: string }[]} */
  const failures = [];

  if (opts.dryRun) {
    console.log("\ndry-run 结束，未删除任何部署。");
  } else {
    console.log("\n开始删除…");
    for (const deployment of remove) {
      const id = deployment.uid ?? deployment.id;
      const result = await deleteDeployment({ token, teamId, id });
      if (result.ok) {
        console.log(`  已删 ${id}${result.alreadyGone ? "（本来就不存在）" : ""}`);
      } else {
        console.log(`  失败 ${id}  HTTP ${result.status}  ${result.detail ?? ""}`);
        failures.push({ uid: id, status: result.status, detail: result.detail });
      }
    }
    console.log(`\n删除完成：成功 ${remove.length - failures.length} / 失败 ${failures.length}`);
  }

  const summary = [
    "Vercel 部署清理",
    "",
    `- 模式：${opts.dryRun ? "dry-run" : "真删"}`,
    `- 保留策略：最近 ${opts.keep} 个，min-age ${opts.minAgeDays} 天`,
    `- 部署总数：${deployments.length}（保留 ${kept.length} / 待删 ${remove.length} / 跳过 ${skipped.length}）`,
    `- 预计释放：≈ ${estimatedGb.toFixed(2)} GB`,
    ...(opts.dryRun ? [] : [`- 删除结果：成功 ${remove.length - failures.length} / 失败 ${failures.length}`]),
  ].join("\n");

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf8");
  }

  // 有失败就让 job 报红，否则「清理没生效」会一直静默
  if (failures.length > 0) process.exitCode = 1;
}

// 只在直接运行时执行，被 vitest import 时不跑（纯函数必须无副作用）
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("清理脚本本身崩了：", err);
    process.exitCode = 1;
  });
}
