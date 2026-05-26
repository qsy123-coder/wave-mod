import type { NextConfig } from "next";

const aliyunOssEndpointHost = process.env.ALIYUN_OSS_ENDPOINT?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
const aliyunOssBucket = process.env.ALIYUN_OSS_BUCKET?.trim();
const aliyunOssBucketHost = aliyunOssEndpointHost && aliyunOssBucket ? `${aliyunOssBucket}.${aliyunOssEndpointHost}` : null;

const ossRemotePatterns = [
  aliyunOssBucketHost
    ? {
        protocol: "https" as const,
        hostname: aliyunOssBucketHost,
      }
    : null,
  {
    protocol: "https" as const,
    hostname: "**.aliyuncs.com",
  },
].filter((pattern): pattern is { protocol: "https"; hostname: string } => Boolean(pattern));

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  reactCompiler: true,
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "example.oss-cn-shanghai.aliyuncs.com",
      },
      ...ossRemotePatterns,
    ],
  },
};

export default nextConfig;
