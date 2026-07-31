import { NextRequest, NextResponse } from "next/server";

/**
 * 调试端点：测试 Worker 从 COS 抓取图片的能力
 *
 * GET /api/debug/image-test?url=<encoded-url>
 *
 * 返回 JSON 诊断信息，可在手机浏览器直接访问查看。
 */
export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get("url");

  if (!imageUrl) {
    // 没有传 url 参数，返回内置测试：用站点自身 /_next/image 测试
    return NextResponse.json({
      hint: "请提供 ?url=<encoded-image-url> 参数测试指定图片",
      example: `/api/debug/image-test?url=${encodeURIComponent("https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/test/test.webp")}`,
    });
  }

  const result: Record<string, unknown> = {
    requestedUrl: imageUrl,
    timestamp: new Date().toISOString(),
  };

  try {
    const start = Date.now();
    const response = await fetch(imageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "WaveMod-Debug/1.0",
      },
    });
    const elapsed = Date.now() - start;

    const bodySize = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");
    const cacheControl = response.headers.get("cache-control");

    result.fetchOk = response.ok;
    result.status = response.status;
    result.statusText = response.statusText;
    result.contentType = contentType;
    result.contentLength = bodySize;
    result.cacheControl = cacheControl;
    result.elapsedMs = elapsed;

    // 检查关键响应头
    if (contentType) {
      result.isImage = contentType.startsWith("image/");
    }
    if (cacheControl) {
      result.hasNoCache = cacheControl.includes("no-cache") || cacheControl.includes("no-store");
      result.hasImmutable = cacheControl.includes("immutable");
    }

    // 尝试读取前几个字节验证数据完整
    try {
      const clone = response.clone();
      const chunk = await clone.text();
      result.bodySize = chunk.length;
      result.bodyPreview = chunk.slice(0, 100);
    } catch {
      result.bodyError = "无法读取响应体";
    }
  } catch (err) {
    result.fetchOk = false;
    result.error = err instanceof Error ? err.message : String(err);
    result.errorName = err instanceof Error ? err.name : "Unknown";
  }

  return NextResponse.json(result);
}
