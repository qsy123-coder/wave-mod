import "server-only";

export type ServerCosEnv = {
  /** 腾讯云 SecretId */
  secretId: string;
  /** 腾讯云 SecretKey */
  secretKey: string;
  /** COS Bucket 名称（如 my-bucket-1234567890） */
  bucket: string;
  /** COS 地域（如 ap-guangzhou、ap-shanghai） */
  region: string;
};

export function getServerCosEnv(): ServerCosEnv | null {
  const secretId = process.env.COS_SECRET_ID?.trim();
  const secretKey = process.env.COS_SECRET_KEY?.trim();
  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();

  if (!secretId || !secretKey || !bucket || !region) {
    return null;
  }

  return { secretId, secretKey, bucket, region };
}

/**
 * COS 公开访问域名（不带协议），如 `bucket-123.cos.ap-guangzhou.myqcloud.com`。
 *
 * 用于服务端渲染 `<link rel="preconnect">`：把到 COS 的 DNS + TLS 握手提前到用户点击播放之前，
 * 这样点击后的首个视频字节不用再等一次握手。取不到就返回 null（本地未配环境变量时不该让页面崩）。
 *
 * 只读 bucket/region，不需要密钥 —— 与 next.config.ts 里推导 remotePatterns 的口径一致，
 * 两边用的是同一组环境变量，改一处不会漂。
 *
 * ⚠️ 必须留在这个 `server-only` 模块里：`src/lib/cos/shared.ts` 会进客户端 bundle，
 * 在浏览器里 `process.env.COS_BUCKET` 是 undefined，放那边会静默返回 null。
 */
export function getCosPublicHost(): string | null {
  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();
  if (!bucket || !region) return null;
  return `${bucket}.cos.${region}.myqcloud.com`;
}
