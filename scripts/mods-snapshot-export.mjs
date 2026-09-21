/**
 * 兜底快照的发布与缓存通知（脚本侧共享模块）。
 *
 * 为什么需要它：Supabase 网关被锁（exceed_egress_quota，REST/Auth 一律 402）时，
 * 前台读的是兜底快照，而快照的**本地那份只能在构建时打进部署**。所以同一份快照
 * 还会被发到腾讯 COS 一份，运行中的部署优先读 COS，配合收尾 ping 的
 * /api/revalidate 即可「上传完几秒内可见」，不用重新部署。
 * 读侧实现在 src/lib/mods-domain/snapshot.ts。
 *
 * 本模块刻意不读 argv、不读 FLAGS、import 时无副作用、也不自建 COS 实例
 * （由调用方注入）—— 这样它既能被 CLI 用，也能在 vitest 里直接 import 来测纯逻辑。
 */

/** 打包内那份快照在仓库里的相对路径（backup-to-github.mjs 提交的就是它） */
export const SNAPSHOT_REL_PATH = "data/mods-snapshot.json.gz";

/**
 * 快照在 COS 上的对象键。
 *
 * ⚠️ 真源有两份（本文件 + src/lib/mods-domain/snapshot.ts）—— scripts 无法 import TS，
 * 与 scripts/mods-snapshot.sql 的情况一样。改一处必须同步另一处，
 * src/lib/mods-domain/snapshot.test.ts 有用例比对这两个字符串。
 */
export const SNAPSHOT_OBJECT_KEY = "snapshots/mods-snapshot.json.gz";

/**
 * 只设 ContentType，**绝不设 ContentEncoding**。
 * 设成 gzip 会让平台的 fetch 自动解压，前台拿到明文却按 gzip 解 —— 结果是
 * 「上传明明成功了，前台永远读不到」，且只会静默回退到打包内那份。
 */
export const SNAPSHOT_CONTENT_TYPE = "application/gzip";

/** 行数低于旧快照这个比例就拒绝写出（残缺导出比崩溃更难发现） */
export const SNAPSHOT_MIN_RATIO = 0.9;

/** 与 upload-daily-by-date.mjs 的 buildCosUrl 同构；scripts 无法复用 src/lib/cos/shared.ts */
export function buildSnapshotCosUrl({ bucket, region, objectKey = SNAPSHOT_OBJECT_KEY }) {
  return `https://${bucket.trim()}.cos.${region.trim()}.myqcloud.com/${objectKey}`;
}

/**
 * 覆盖写 COS 上的快照对象。putObject 是原子的：读到的要么是旧的一整份、要么是新的一整份。
 *
 * @returns {Promise<{objectKey: string, url: string}>}
 */
export function putSnapshotToCos({
  cos,
  bucket,
  region,
  body,
  objectKey = SNAPSHOT_OBJECT_KEY,
  log = console.log,
}) {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: objectKey,
        Body: body,
        ContentType: SNAPSHOT_CONTENT_TYPE,
      },
      (err) => {
        if (err) {
          reject(new Error(`COS 快照上传失败: ${err.message}`));
          return;
        }

        const url = buildSnapshotCosUrl({ bucket, region, objectKey });
        log(`☁️  兜底快照已上传: ${url} (${(body.length / 1024).toFixed(0)}KB)`);
        resolve({ objectKey, url });
      },
    );
  });
}

/**
 * 通知线上清掉公开读缓存（含远程兜底快照那条 tag），让刚写入的内容立刻可见。
 *
 * ⚠️ 调用顺序：**必须先上传 COS、再调这个**。ping 会清掉快照缓存条目，
 * 若先 ping 后上传，ping 之后第一个走到回退的请求会把 COS 上的**旧对象**
 * 重新拉下来缓存一整个 TTL，新内容反而比不 ping 更晚可见。
 *
 * 只告警不抛错：缓存没刷成不该让一次成功的写库看起来像失败了。
 * @returns {Promise<boolean>} 是否成功通知
 */
export async function notifyRevalidate({
  siteUrl,
  secret,
  fetchImpl = fetch,
  log = console.log,
  warn = console.warn,
}) {
  if (!secret) {
    warn("⚠️  未配置 REVALIDATE_SECRET，跳过缓存失效通知");
    warn("   新内容最多要等一个 TTL 才出现在前台。");
    return false;
  }

  try {
    const res = await fetchImpl(`${siteUrl}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
    });

    if (res.ok) {
      log("🔔 已通知前台刷新缓存，新内容立即可见");
      return true;
    }

    // 把响应体截断打印：接口错误时会带上原因，但别把整页 HTML 刷进终端
    const body = (await res.text()).slice(0, 200);
    warn(`⚠️  缓存失效通知被拒: HTTP ${res.status} ${body}`);
    if (res.status === 401 || res.status === 503) {
      warn("   本地 .env.local 的 REVALIDATE_SECRET 与 Vercel 环境变量必须一致。");
    }
    return false;
  } catch (err) {
    warn(`⚠️  缓存失效通知失败: ${err.message}`);
    warn("   数据已写入，只是前台要等 TTL 到期才刷新。");
    return false;
  }
}
