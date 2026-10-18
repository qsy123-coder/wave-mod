import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";

/**
 * 临时诊断接口（验完即删）：Vercel 函数到 COS 的连通性。
 * 只返回耗时/状态码/DNS 结果，不返回任何密钥。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const bucket = process.env.COS_BUCKET?.trim() ?? "";
  const region = process.env.COS_REGION?.trim() ?? "";
  const host = bucket && region ? `${bucket}.cos.${region}.myqcloud.com` : "";
  const url = host ? `https://${host}/gallery/11.jpg` : "";

  let dns: unknown = null;
  try {
    dns = await lookup(host, { all: true });
  } catch (error) {
    dns = { error: error instanceof Error ? error.message : String(error) };
  }

  const started = Date.now();
  let fetchResult: unknown = null;
  if (url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      fetchResult = { status: res.status, ms: Date.now() - started };
    } catch (error) {
      fetchResult = { error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
    }
  }

  // 直接试一次 SDK：fetch 通而 SDK 超时的话，就能确认问题在 SDK 而不是网络
  const sdkStarted = Date.now();
  let sdkResult: unknown = null;
  if (host) {
    try {
      const { default: COS } = await import("cos-nodejs-sdk-v5");
      const cos = new COS({
        SecretId: process.env.COS_SECRET_ID?.trim(),
        SecretKey: process.env.COS_SECRET_KEY?.trim(),
        Timeout: 6000,
      });
      sdkResult = await new Promise((resolve) => {
        cos.headObject({ Bucket: bucket, Region: region, Key: "gallery/11.jpg" }, (error, data) => {
          resolve(error ? { error: error.message, code: error.code, ms: Date.now() - sdkStarted } : { status: data?.statusCode, ms: Date.now() - sdkStarted });
        });
      });
    } catch (error) {
      sdkResult = { error: error instanceof Error ? error.message : String(error), ms: Date.now() - sdkStarted };
    }
  }

  return NextResponse.json(
    {
      env: {
        hasBucket: Boolean(bucket),
        region,
        hasSecretId: Boolean(process.env.COS_SECRET_ID?.trim()),
        hasSecretKey: Boolean(process.env.COS_SECRET_KEY?.trim()),
      },
      host,
      dns,
      fetchResult,
      sdkResult,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
