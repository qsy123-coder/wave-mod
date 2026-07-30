/**
 * Web Crypto 工具库
 *
 * 所有函数基于 Web Crypto API（globalThis.crypto.subtle / crypto.getRandomValues），
 * 同时兼容 Node.js 19+（Vercel Serverless）和 Cloudflare Workers。
 * 避免使用 `node:crypto` 和 `Buffer`，确保跨平台部署。
 */

/** 生成指定字节数的安全随机数，返回 base64url 编码字符串（无填充）。 */
export function generateSecureBase64Url(bytes = 24): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);

  // 将 Uint8Array 转为二进制字符串，再用 btoa 编码为标准 base64
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }

  // 标准 base64 → base64url（RFC 4648 §5）
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * HMAC-SHA1 签名，返回 base64 编码的签名结果。
 * 等价于：Node.js 中 crypto.createHmac("sha1", key).update(data).digest("base64")
 */
export async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key);
  const dataBytes = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBytes);

  // ArrayBuffer → Uint8Array → 二进制字符串 → base64
  const sigBytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < sigBytes.length; i++) {
    binary += String.fromCharCode(sigBytes[i]);
  }

  return btoa(binary);
}

/** 将 UTF-8 字符串编码为 base64。等价于：Buffer.from(str).toString("base64") */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
