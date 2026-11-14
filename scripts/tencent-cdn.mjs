/**
 * 腾讯云 CDN 最小客户端（TC3-HMAC-SHA256），只做两件事：URL 预热 + 路径刷新。
 *
 * 为什么不用官方 SDK：项目没装 `tencentcloud-sdk-nodejs`（CLAUDE.md 禁止引入未使用的库），
 * 而 CDN 这两个 API 的签名握手用 `node:crypto` 二十行就够。
 *
 * 凭据与 COS 共用：`.env.local` 的 `COS_SECRET_ID` / `COS_SECRET_KEY`。
 * 实测这对子用户密钥可以调 `PurgePathCache`，也可以调 `PushUrlsCache`。
 *
 * ⚠️ 两个易踩的点：
 *   1. `PurgePathCache` 必须传**未编码**的中文路径，percent-encoded 刷不掉（2026-11-13 实测）；
 *   2. 预热的 URL 要连同 `?imageMogr2/...` 查询串一起传 —— CDN 缓存键包含查询串，
 *      只推原图不会顺带把缩放档位热起来。
 */
import { createHash, createHmac } from "node:crypto";

const CDN_HOST = "cdn.tencentcloudapi.com";
const CDN_VERSION = "2018-06-06";
const ALGORITHM = "TC3-HMAC-SHA256";

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function hmac(key, text) {
  return createHmac("sha256", key).update(text, "utf8").digest();
}

/**
 * 调一个 CDN API。
 *
 * @param {object} args
 * @param {string} args.action       例如 `PushUrlsCache` / `DescribePushTasks`
 * @param {object} args.payload
 * @param {{secretId:string, secretKey:string}} args.credentials
 * @param {number} [args.timestamp]  秒；测试时可固定
 * @returns {Promise<any>} `Response` 字段下的内容
 */
export async function callCdnApi({ action, payload, credentials, timestamp = Math.floor(Date.now() / 1000) }) {
  const { secretId, secretKey } = credentials;
  if (!secretId || !secretKey) throw new Error("缺少 COS_SECRET_ID / COS_SECRET_KEY");

  const body = JSON.stringify(payload);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders = `content-type:${contentType}\nhost:${CDN_HOST}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");

  const credentialScope = `${date}/cdn/tc3_request`;
  const stringToSign = [ALGORITHM, timestamp, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", hmac(hmac(hmac(`TC3${secretKey}`, date), "cdn"), "tc3_request"))
    .update(stringToSign, "utf8")
    .digest("hex");

  const res = await fetch(`https://${CDN_HOST}`, {
    method: "POST",
    headers: {
      Authorization: `${ALGORITHM} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": contentType,
      Host: CDN_HOST,
      "X-TC-Action": action,
      "X-TC-Version": CDN_VERSION,
      "X-TC-Timestamp": String(timestamp),
    },
    body,
  });

  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`CDN ${action} 返回非 JSON（HTTP ${res.status}）`);
  if (json.Response?.Error) {
    const { Code, Message } = json.Response.Error;
    throw new Error(`CDN ${action} 失败：${Code} ${Message}`);
  }
  return json.Response ?? {};
}

/** 从环境变量取 CDN 凭据（与 COS 共用一套子用户密钥） */
export function cdnCredentialsFromEnv(env = process.env) {
  return {
    secretId: (env.COS_SECRET_ID ?? "").trim(),
    secretKey: (env.COS_SECRET_KEY ?? "").trim(),
  };
}

/**
 * 提交 URL 预热任务。单次最多 100 条（API 限制）。
 * @returns {Promise<string>} TaskId
 */
export async function pushUrlsCache(urls, { credentials, userAgent = "wavemod-warm/1.0", area } = {}) {
  if (!urls.length) return "";
  if (urls.length > 100) throw new Error(`PushUrlsCache 单次最多 100 条，收到 ${urls.length}`);
  const res = await callCdnApi({
    action: "PushUrlsCache",
    credentials,
    // 2026-11-14 实测：
    //   - UserAgent 是 `string`，传数组会报 InvalidParameter；
    //   - 域名是**境外/全球**加速时，不传 Area 会报
    //     "The domain name acceleration region is different from the selected region"。
    payload: { Urls: urls, UserAgent: userAgent, ...(area ? { Area: area } : {}) },
  });
  return res.TaskId ?? "";
}

// ─────────────────────── 图片档位预热 ───────────────────────

/** 站内图片对外基址（CDN）。可用 `NEXT_PUBLIC_COS_IMAGE_BASE` 覆盖。 */
export const CDN_IMAGE_BASE_DEFAULT =
  (process.env.NEXT_PUBLIC_COS_IMAGE_BASE ?? "").trim().replace(/\/+$/, "") || "https://cdn.sunnyrose.xyz";

/**
 * 详情页实际会请求的档位：
 *   320  抽屉缩略图 / 卡片模糊底
 *   640  低 DPR 手机的首图
 *   960  桌面 1x 首图（sizes=720px）
 *   1280 手机 3x 首图 / 首图兜底 src
 *   1920 桌面 2x 首图
 */
export const IMAGE_VARIANT_WIDTHS = [320, 640, 960, 1280, 1920];

/**
 * 把一个 COS 原图地址变成「宽度档位」地址（与 `withCosImageTransform` 同形）。
 *
 * 非 COS 地址 / 已经带 imageMogr2 的地址返回 null —— 这些不该进预热队列。
 */
export function buildImageVariantUrl(url, width, { base = CDN_IMAGE_BASE_DEFAULT } = {}) {
  if (!url || typeof url !== "string") return null;
  if (url.includes("imageMogr2")) return null;

  let parsed;
  let cdnBase;
  try {
    parsed = new URL(url);
    cdnBase = new URL(base);
  } catch {
    return null;
  }
  if (!parsed.hostname.endsWith(".myqcloud.com")) return null;
  // 占位图（placeholder/mod-placeholder.webp）没必要预热
  if (/\/placeholder\//i.test(parsed.pathname)) return null;

  const prefix = cdnBase.pathname.replace(/\/+$/, "");
  const source = `${cdnBase.origin}${prefix}${parsed.pathname}${parsed.search}`;
  const separator = source.includes("?") ? "&" : "?";
  return `${source}${separator}imageMogr2/thumbnail/${width}x%3E/format/webp`;
}

/**
 * 由一批 mod 记录算出要预热的 URL。
 *
 * - 每条 mod 的**首图**（以及每个变体的首图，抽屉默认展示它们）按全部档位预热；
 * - 其余图片只预热 `thumbWidth`（缩略图条），用户点开后续图时由前端预取下一张兜住。
 *
 * @param {{images?:string[], variantImages?:object, variant_images?:object}[]} mods
 * @returns {string[]} 去重后的 URL
 */
export function buildWarmUrls(
  mods,
  { widths = IMAGE_VARIANT_WIDTHS, thumbWidth = 320, base = CDN_IMAGE_BASE_DEFAULT } = {},
) {
  const urls = new Set();
  const add = (url, width) => {
    const variant = buildImageVariantUrl(url, width, { base });
    if (variant) urls.add(variant);
  };

  for (const mod of mods ?? []) {
    const images = (mod?.images ?? []).filter(Boolean);
    const variants = mod?.variantImages ?? mod?.variant_images ?? {};

    // 首图档位：主封面 + 每个变体的第一张（抽屉打开时就是这个变体的第一张）
    const heroCandidates = [];
    for (const list of Object.values(variants ?? {})) {
      if (Array.isArray(list) && list[0]) heroCandidates.push(list[0]);
    }
    if (images[0]) heroCandidates.push(images[0]);
    for (const url of heroCandidates) {
      for (const width of widths) add(url, width);
    }

    // 缩略图条：每张都要 320
    for (const url of images) add(url, thumbWidth);
  }

  return [...urls];
}

/**
 * 分批提交预热任务（单批 100 条，API 上限）。
 * 域名是境外加速（`DescribeDomains` 的 Area=overseas），所以默认 Area=overseas。
 *
 * @returns {Promise<string[]>} TaskId 列表
 */
export async function warmUrls(
  urls,
  { credentials, area = process.env.CDN_WARM_AREA?.trim() || "overseas", batchSize = 100 } = {},
) {
  const taskIds = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const chunk = urls.slice(i, i + batchSize);
    const taskId = await pushUrlsCache(chunk, { credentials, area });
    if (taskId) taskIds.push(taskId);
  }
  return taskIds;
}

/** 查询预热任务进度（taskId 为空时按时间倒序取最近若干条） */
export async function describePushTasks({ credentials, taskId, startTime, endTime } = {}) {
  return callCdnApi({
    action: "DescribePushTasks",
    credentials,
    payload: {
      ...(taskId ? { TaskId: taskId } : {}),
      ...(startTime ? { StartTime: startTime } : {}),
      ...(endTime ? { EndTime: endTime } : {}),
    },
  });
}
