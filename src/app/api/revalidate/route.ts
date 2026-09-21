import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { revalidatePublicModCaches } from "@/lib/mod-cache";

/**
 * 按需失效公开读缓存的接口。给**脚本**用，不是给浏览器用的。
 *
 * 为什么需要它：管理后台的写操作走 Server Action，内部会调
 * revalidatePublicModCaches()，写完立即失效。但每日批量上传走的是
 * scripts/upload-daily-by-date.mjs —— 它用 psql 直连 Postgres 写库，
 * 完全绕开了 Next 的运行时，没有任何办法通知前台缓存失效。
 *
 * 从前这不要紧，因为 TTL 只有 1 小时，最多等一小时新 mod 就自己冒出来了。
 * 但 TTL 为压出口配额涨到 6 小时之后，等它自然到期就意味着当天上午上传的批次
 * 可能晚上才出现在站上 —— 所以补上这个接口，让脚本入库后主动敲一下。
 *
 * 失效范围就是 revalidatePublicModCaches() 本身，与管理后台写入完全一致。
 * 不读数据库：网关被锁（超配额 402）时它照样返回 200，只是那时前台也读不到
 * 数据，真正让新内容露出来的是「刷新快照 + 重新部署」那条路。
 */

/** 与 scripts/upload-daily-by-date.mjs 里的同名常量必须保持一致 */
const SECRET_HEADER = "x-revalidate-secret";
const SECRET_ENV = "REVALIDATE_SECRET";

/** 短于此长度直接视为「未配置」：防止有人填个 "123" 就当鉴权用了 */
const MIN_SECRET_LENGTH = 16;

/**
 * 读出配置的密钥；未配置或短得不像密钥时返回 null。
 * 每次调用都现读 process.env（而非模块加载时读一次），这样测试里改环境变量能生效，
 * 也避免构建期被固化成 undefined。
 */
function readConfiguredSecret(): string | null {
  const value = process.env[SECRET_ENV]?.trim() ?? "";
  return value.length >= MIN_SECRET_LENGTH ? value : null;
}

/**
 * 定时安全比较。
 * 用 === 比较密钥会因为提前返回而泄漏「前几位猜对了」的时序信息，故用
 * timingSafeEqual；它要求两侧等长，长度不等时直接判否（长度本身不算秘密）。
 */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const expected = readConfiguredSecret();

  if (!expected) {
    // fail closed：宁可让脚本报警，也不能因为「忘了配密钥」而变成一个谁都能调的开接口。
    // 这个接口被滥用的代价是每个请求都触发一次全表重扫（约 4.6MB 出口），
    // 正是导致 2026-09-21 那次超配额事故的同一件事。
    console.error(`[revalidate] 未配置 ${SECRET_ENV}（或长度不足 ${MIN_SECRET_LENGTH} 位），拒绝服务`);
    return NextResponse.json({ ok: false, error: "revalidate_not_configured" }, { status: 503 });
  }

  const provided = request.headers.get(SECRET_HEADER)?.trim() ?? "";

  if (!provided || !secretsMatch(provided, expected)) {
    // 不区分「没带」和「带错了」，避免给探测者额外信息
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  revalidatePublicModCaches();

  return NextResponse.json({ ok: true, revalidatedAt: new Date().toISOString() });
}
