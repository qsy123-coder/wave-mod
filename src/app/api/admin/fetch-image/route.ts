import { NextResponse } from "next/server";

import { isCosStorageUrl } from "@/lib/cos/shared";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * 后台打码用：同源代理拉取 COS 原图，避免浏览器端直接 fetch 远程图片时的 CORS 限制。
 * 只允许腾讯云 COS 域名，防止被当成任意 URL 代理。
 */
export async function GET(request: Request) {
  const rawUrl = new URL(request.url).searchParams.get("url")?.trim();

  if (!rawUrl) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }

  let target: URL;

  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "url 不合法" }, { status: 400 });
  }

  if (
    target.protocol !== "https:" ||
    !target.hostname.endsWith(".myqcloud.com") ||
    !target.hostname.includes(".cos.") ||
    !isCosStorageUrl(rawUrl)
  ) {
    return NextResponse.json({ error: "只允许腾讯云 COS 图片" }, { status: 400 });
  }

  try {
    const response = await fetch(target, { cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json({ error: `COS 返回 ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "image/webp";

    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "目标不是图片" }, { status: 415 });
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "图片超过 20MB" }, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "读取图片失败" }, { status: 502 });
  }
}
