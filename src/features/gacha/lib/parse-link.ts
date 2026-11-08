/**
 * 解析官方唤取记录链接。
 *
 * 只从用户输入里**取参数**，绝不请求用户给的域名 —— 出站地址由服务端固定，
 * 从根上避免 SSRF。链接形态有两种：
 *   1. PC / 云鸣潮：参数在顶层 query
 *   2. 页面内跳转：参数在 `#/record?` 后面
 * 两者同时存在时 hash 优先（与源项目 fetcher.rs 一致）。
 */

import type { ServerRegion } from "./types";

export type ParsedGachaLink = {
  playerId: string;
  recordId: string;
  resourcesId: string;
  serverId: string;
  lang: string;
  region: ServerRegion;
};

export type ParseGachaLinkResult =
  | { ok: true; value: ParsedGachaLink }
  | { ok: false; error: string };

const PLAYER_ID_PATTERN = /^\d{1,20}$/;
/** record_id 是十六进制串，实际 32 位；放宽到 16–64 位以兼容不同版本 */
const RECORD_ID_PATTERN = /^[0-9a-fA-F]{16,64}$/;

function collectParams(url: URL): Map<string, string> {
  const params = new Map<string, string>();

  for (const [key, value] of url.searchParams) {
    params.set(key, value);
  }

  // url.hash 形如 "#/record?player_id=..."，取问号后面的部分覆盖顶层同名参数
  const hash = url.hash.replace(/^#/, "");
  const queryIndex = hash.indexOf("?");
  if (queryIndex >= 0) {
    const hashParams = new URLSearchParams(hash.slice(queryIndex + 1));
    for (const [key, value] of hashParams) {
      params.set(key, value);
    }
  }

  return params;
}

export function parseGachaLink(input: string): ParseGachaLinkResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: "请先粘贴唤取记录链接" };
  }

  let url: URL;
  try {
    // 也接受直接粘贴的 query 串，省得用户自己拼 domain
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://placeholder.invalid/?${raw}`);
  } catch {
    return { ok: false, error: "这不是有效的链接" };
  }

  const params = collectParams(url);
  const playerId = params.get("player_id") ?? "";
  const recordId = params.get("record_id") ?? "";

  if (!playerId || !recordId) {
    return {
      ok: false,
      error: "链接里缺少 player_id 或 record_id，请重新从游戏内「唤取记录」复制完整链接",
    };
  }

  if (!PLAYER_ID_PATTERN.test(playerId)) {
    return { ok: false, error: "player_id 格式不正确" };
  }

  if (!RECORD_ID_PATTERN.test(recordId)) {
    return { ok: false, error: "record_id 格式不正确" };
  }

  return {
    ok: true,
    value: {
      playerId,
      recordId,
      resourcesId: params.get("resources_id") ?? "",
      serverId: params.get("svr_id") ?? "",
      // 接口字段名必须是 languageCode；缺省按简中处理
      lang: params.get("lang") || "zh-Hans",
      // 国服 UID 以 1 开头，其余走国际服域名（与源项目一致）
      region: playerId.startsWith("1") ? "cn" : "global",
    },
  };
}
