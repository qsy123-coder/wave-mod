/**
 * 香港机上的**边缘接口进程**：把 `/api/engagement` 与 `/api/visits` 从 Vercel 接过来。
 *
 * 为什么要有它（2026-10-29）：这两条路由占了 Vercel 函数调用的 65%、活动 CPU 的 29%，
 * 而它们天生不可缓存 —— `mine` 是 per-device，打点是 POST，任何共享缓存都会串号。
 * 但它们的逻辑根本不依赖 Next：协议层在各自的 `web-api` 模块，落点在 `remote-store`，
 * 而对端 `service.py` 就在这台机器的 127.0.0.1:8791 上。
 * 所以让 nginx 把这两个 location 直接打到这里，Vercel 完全不用醒。
 *
 * 只注入 remote 落点：这台机器本来就是 remote 的对端，把 supabase / COS 那几套
 * 打进包里没有意义，还会在缺环境变量时于 import 期炸掉。
 *
 * 与 Next 路由的差异只有一处，且是有意的：这里不做 Origin/CORS 处理 ——
 * 它只监听 127.0.0.1，前面必须有 nginx（浏览器从不直连）。
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { remoteReadEngagement, remoteWriteEngagement } from "@/lib/engagement/remote-store";
import { handleEngagementGet, handleEngagementPost, type ApiResult } from "@/lib/engagement/web-api";
import { shanghaiDayKey } from "@/lib/engagement/store-core";
import { remoteRecordVisit } from "@/lib/visits/remote-store";
import { handleVisitPost } from "@/lib/visits/web-api";

const HOST = process.env.EDGE_API_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.EDGE_API_PORT?.trim() || 8792);

/** 与 Next 路由一字不差：这两个接口的响应任何共享缓存都不许存 */
const NO_STORE = "private, no-store, max-age=0";

/** engagement 的写请求体只有 {modId, action}；64KB 已经远远够用 */
const MAX_BODY_BYTES = 64 * 1024;

const store = { read: remoteReadEngagement, write: remoteWriteEngagement };

function send(res: ServerResponse, result: ApiResult) {
  if (result.json === null) {
    res.writeHead(result.status, { "cache-control": NO_STORE });
    res.end();
    return;
  }

  const body = JSON.stringify(result.json);
  res.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": NO_STORE,
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

/** 只取用得到的头，别把整个 IncomingMessage 漏进协议层 */
function header(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://edge.local");

  try {
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, store: "remote-http", uptime: process.uptime() }));
      return;
    }

    if (url.pathname === "/api/engagement" && req.method === "GET") {
      send(
        res,
        await handleEngagementGet(store, url.searchParams.get("ids"), header(req, "x-device-id")),
      );
      return;
    }

    if (url.pathname === "/api/engagement" && req.method === "POST") {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch {
        send(res, { status: 400, json: { error: "请求体不是合法 JSON。" } });
        return;
      }
      send(
        res,
        await handleEngagementPost(store, body, header(req, "x-device-id"), header(req, "user-agent")),
      );
      return;
    }

    if (url.pathname === "/api/visits" && req.method === "POST") {
      const today = shanghaiDayKey();
      send(
        res,
        await handleVisitPost(
          (deviceId) => remoteRecordVisit(deviceId, today),
          header(req, "x-device-id"),
          header(req, "user-agent"),
        ),
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (error) {
    // 不把内部细节回给访客；日志里有完整堆栈供 systemd journal 收集
    console.error(`[edge-api] ${req.method} ${url.pathname} failed`, error);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[edge-api] listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
