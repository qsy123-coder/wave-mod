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
