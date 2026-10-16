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
  // 构建产物目录可被环境变量顶掉，只为自托管部署服务（scripts/deploy-update.sh）。
  //
  // 为什么需要：自托管下 `.next` 是持久目录，线上进程直接从它读 chunk。于是
  //   - 先 build 再停：`next build` 会**就地改写**正在服务的 `.next`，跑着的进程
  //     会引用到已被替换掉的 chunk（表现为整页变回无样式纯 HTML / MODULE_NOT_FOUND）；
  //   - 先停再 build：整个 build（约 100 秒）后端都没人听 3000，nginx 又没配
  //     upstream 兜底 → 每次部署稳定 502 一百秒（2026-10-17 实测，见 memory）。
  // 所以改成「先构建到 .next-staging（线上照常服务），构建完才 stop/rm/mv/start」，
  // 把停机从整个 build 压到切换的那几秒。
  //
  // 默认值仍是 `.next`，本地 dev / build / CI 完全不受影响。
  // 注意：`.next-staging` 里的 cache 是部署脚本从 `.next/cache` 拷进去的（不是软链，
  // 软链会在 `mv .next-staging .next` 之后自指）。
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
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
      // 全站去索引的**响应头**兜底，与根 layout 的 metadata.robots 是双保险。
      //
      // 为什么不只靠 nginx：仓库里的 nginx.conf.example / deploy-hk.sh / setup-alt-entry.sh
      // 仍是反代版旧模板，一旦被照着重放，线上由 nginx 加的 `add_header ... always` 会丢，
      // 站点会在没人察觉的情况下重新被收录。写在代码里，部署到哪都跟着走。
      //
      // 值里**不能**写 `always` —— 那是 nginx `add_header` 的关键字，不是 header 值。
      // 「对非 2xx 也生效」这件事只能在 nginx 那层做。
      //
      // 会顺带命中 /_next/static/*、/api/* 等：多余但无害（它们本来也不该被收录）。
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
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
