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

// COS 域名：{bucket}.cos.{region}.myqcloud.com
const cosBucket = process.env.COS_BUCKET?.trim();
const cosRegion = process.env.COS_REGION?.trim();
const cosBucketHost = cosBucket && cosRegion ? `${cosBucket}.cos.${cosRegion}.myqcloud.com` : null;
const cosRemotePatterns = [
  cosBucketHost
    ? {
        protocol: "https" as const,
        hostname: cosBucketHost,
      }
    : null,
].filter((pattern): pattern is { protocol: "https"; hostname: string } => Boolean(pattern));

const nextConfig: NextConfig = {
  // 兜底快照由运行时 fs 读取（src/lib/mods-domain/snapshot.ts），不是 import，
  // 因此必须显式告诉 output tracing 把它复制进 serverless 函数包，否则线上读不到。
  // 体积 500KB（gzip），对所有路由生效 —— 快照被 /api/mods、/mods、首页、详情页共用。
  outputFileTracingIncludes: {
    "/*": ["./data/mods-snapshot.json.gz"],
  },
  async redirects() {
    return [
      {
        source: "/wuthering-waves/:path*",
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
  // 角色头像（public/character-imgs/）默认由 Next 的静态文件处理发出去，带的是
  // `Cache-Control: public, max-age=0`，且这里实测对 If-None-Match / If-Modified-Since
  // 一律回 200 + 完整 body（不回 304）—— 等于每次进 /mods 都要把这 60 多个头像重下一遍。
  // 头像总共约 0.5MB，重下就是纯浪费，所以显式给一段缓存。
  //
  // 不用 immutable / max-age=1y：文件名没有内容哈希，换图是**原地覆盖**同名文件
  // （见 public/character-imgs 的历次压缩），永久缓存会让换掉的图再也刷不出来。
  // 一周 + 一天 stale-while-revalidate：正常浏览完全命中缓存，换图一周内自然过期。
  async headers() {
    return [
      {
        source: "/character-imgs/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  reactCompiler: true,
  images: {
    unoptimized: true,
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
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
      ...cosRemotePatterns,
    ],
  },
};

export default nextConfig;
