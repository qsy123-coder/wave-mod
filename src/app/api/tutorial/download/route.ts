import { NextResponse } from "next/server";

const GITHUB_ZIP_URL =
  "https://github.com/qsy123-coder/wave-mod/releases/download/v1.0/mod-tools.zip";

export async function GET() {
  try {
    const res = await fetch(GITHUB_ZIP_URL, {
      headers: { Accept: "application/octet-stream, application/zip" },
    });

    if (!res.ok || !res.body) {
      return NextResponse.json(
        { ok: false, error: "下载失败，请稍后重试" },
        { status: 502 },
      );
    }

    // 强制浏览器下载文件名为 教程.zip
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename*=UTF-8''%E6%95%99%E7%A8%8B.zip",
        "Content-Length": res.headers.get("Content-Length") ?? "",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "下载失败，请稍后重试" },
      { status: 502 },
    );
  }
}
