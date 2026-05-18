import "server-only";

import { normalizeOssEndpoint } from "@/lib/oss/shared";

export type ServerOssEnv = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  region: string;
};

export function getServerOssEnv(): ServerOssEnv | null {
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT?.trim();
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();

  if (!region || !bucket || !endpoint || !accessKeyId || !accessKeySecret) {
    return null;
  }

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint: normalizeOssEndpoint(endpoint),
    region,
  };
}
