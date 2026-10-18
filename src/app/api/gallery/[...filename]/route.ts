import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { extname, join } from "path";

/**
 * 图库图片下载 / 兼容旧链接。
 *
 * 2026-10-18 起图片本体在 COS（见 scripts/upload-gallery-to-cos.mjs）：
 * 配了 COS 就 302 过去，让 COS 直接出图 —— 应用服务器（以及将来的 Vercel 函数）
 * 不再搬这几 MB 的字节。
 *
 * 下载按钮仍指向这里而不是 COS 直链，是为了保留 `download` 属性与中文文件名；
 * 浏览器跟随 302 后取最后一段路径作为文件名。
 *
 * 没配 COS（纯本地开发）时退回读 `public/gallery`。
 *
 * 使用方式：/api/gallery/<url-encoded-filename>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string[] }> },
) {
  const { filename } = await params;

  // 将路径片段合并并解码
  const encodedFilename = filename.join("/");
  const decodedFilename = decodeURIComponent(encodedFilename);

  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();
  if (bucket && region) {
    const target = `https://${bucket}.cos.${region}.myqcloud.com/gallery/${encodeURIComponent(decodedFilename)}`;
    // 302 而不是 308：路径将来若调整，不能让浏览器永久记住旧跳转
    return NextResponse.redirect(target, 302);
  }

  const filePath = join(process.cwd(), "public", "gallery", decodedFilename);

  // 检查文件是否存在
  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "Image not found", path: decodedFilename },
      { status: 404 },
    );
  }

  // 读取文件
  try {
    const fileBuffer = readFileSync(filePath);
    const ext = extname(decodedFilename).toLowerCase();

    // 根据扩展名设置 MIME 类型
    const mimeType = ext === ".png"
      ? "image/png"
      : ext === ".gif"
      ? "image/gif"
      : ext === ".webp"
      ? "image/webp"
      : "image/jpeg";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read image", cause: String(error) },
      { status: 500 },
    );
  }
}