import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { extname, join } from "path";

/**
 * API 路由代理图片请求
 *
 * 用于处理包含中文和特殊字符的文件名，Next.js 静态资源服务
 * 无法正确处理这些文件名。
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