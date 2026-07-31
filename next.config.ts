import type { NextConfig } from "next";

const aliyunOssEndpointHost = process.env.ALIYUN_OSS_ENDPOINT?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
const aliyunOssBucket = process.env.ALIYUN_OSS_BUCKET?.trim();
const aliyunOssBucketHost = aliyunOssEndpointHost && aliyunOssBucket ? `${aliyunOssBucket}.${aliyunOssEndpointHost}` : null;

// 从 SUPABASE_URL 提取 project ref hostname（如 xxxxxxxxxxxx.supabase.co），
// 用于 Next.js Image remotePatterns 白名单
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim() ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;
// 通配符模式匹配所有 Supabase 项目（Storage URL 格式：<ref>.supabase.co）
const supabaseStoragePatterns = supabaseHost
  ? [{ protocol: "https" as const, hostname: supabaseHost }]
  : [{ protocol: "https" as const, hostname: "**.supabase.co" }];

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
  async redirects() {
    return [
      {
        source: "/wuthering-waves/:path*",
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
  reactCompiler: true,
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
      ...supabaseStoragePatterns,
      ...ossRemotePatterns,
      // 腾讯云 COS 公开域名：https://{bucket}.cos.{region}.myqcloud.com
      {
        protocol: "https" as const,
        hostname: "**.cos.**.myqcloud.com",
      },
    ],
  },
};

export default nextConfig;
