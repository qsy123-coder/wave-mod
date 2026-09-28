import "server-only";

import { unstable_cache } from "next/cache";

import { buildCosPublicUrl } from "@/lib/cos/shared";
import { logger } from "@/lib/logger";
import { decodeSnapshotBase64, decodeSnapshotGzip } from "@/lib/snapshot/codec";

/**
 * 兜底快照的**通用读取层**：COS → 打包内文件 → 空数组。
 *
 * 背景：2026-09-21 Supabase 项目因 `exceed_egress_quota` 被 restriction，
 * REST 与 Auth 全部返回 402 Payment Required。封的是 HTTP 网关，直连 Postgres
 * （5432 pooler）不受影响，因此可以从完好的库里导出已发布行、随仓库发布，
 * 供前台读路径兜底 —— 保证网关被锁期间站点仍能浏览、搜索、翻页、打开详情页。
 *
 * 每份快照（`mods`、`gamebanana`）各是一个 `createSnapshotLoader()` 实例：
 * 对象键、打包内文件名、缓存键与 tag 都由调用方给，**模块级状态在闭包里**，
 * 两份快照的 memo / 冷却 / 告警 flag 互不干扰。
 *
 * ## 两条来源，远程优先
 *
 * 打包内那份（`data/<bundledFile>`）**只在构建时**进得来，所以锁定期内新内容想上线
 * 就必须重新部署 —— 2026-09-21「当天 16 条 mod 在站上没有迅雷按钮」就是这么来的。
 * 因此同一份快照还会被脚本发到腾讯 COS，这里优先读它：
 *
 *   远程（COS，带缓存 + 主动失效） → 打包内文件 → 空数组
 *
 * 这样运行中的部署也能读到新对象，配合脚本收尾 ping 的 /api/revalidate
 * （会清掉调用方给的 tag）上传完几秒内即可见，无需重新部署。
 * 对象是公开读的，取它不需要任何密钥，只需要 COS_BUCKET / COS_REGION。
 *
 * ## 一条不能破坏的不变量
 *
 * **只缓存「输入」（COS 上那份 payload），绝不缓存「输出」（解析后的行数组）。**
 *
 * 调用方的关键性质是「回退发生在 unstable_cache 外部，失败结果不进缓存，
 * 上游一恢复立刻回到实时数据」。这里给远程快照加缓存不能破坏它：
 * 缓存的是压缩态 base64 字符串，不是解析后的行数组 —— 解析后可能远超
 * Vercel Data Cache 单条 2MB 的上限，而 Next 超限时是**静默跳过写入**，
 * 那会退化成「每个请求都真拉一次」，比不缓存更糟。
 *
 * 为什么存 .gz：mods 那份未压缩 4.7MB，会被 outputFileTracingIncludes 复制进每个
 * serverless 函数；gzip 后仅 500KB（gamebanana 那份 266KB → 33KB）。
 * zlib 是 Node 内置，不引入新依赖。
 */

export type SnapshotRow = Record<string, unknown>;

export type SnapshotLoaderConfig = {
  /**
   * 快照在 COS 上的对象键。
   *
   * ⚠️ 真源有两份（src 侧 + scripts 侧）—— scripts 无法 import TS，
   * 与 scripts/*-snapshot.sql 的情况一样。改一处必须同步另一处，
   * `snapshot.test.ts` 有用例比对这两个字符串。
   */
  objectKey: string;
  /** 打包内那份快照在 `data/` 下的文件名 */
  bundledFile: string;
  /** `unstable_cache` 的键前缀（要与其它缓存键不同） */
  cacheKey: string;
  /** 远程快照缓存挂的失效 tag，由 /api/revalidate 清 */
  tag: string;
  /** 日志前缀，形如 `[mods]` / `[gamebanana]` */
  label: string;
  /** base64 字符数上限；默认见 MAX_REMOTE_PAYLOAD_CHARS */
  maxPayloadChars?: number;
};

const REMOTE_TIMEOUT_MS = 5_000;

/**
 * 刻意短于列表缓存的 TTL（各 domain 的 public.ts 里是 6 小时）：降级期的正常刷新
 * 手段是脚本发完新对象后 ping /api/revalidate，那是即时的；
 * 这个 TTL 只是「ping 没打通」时的兜底延迟。
 */
const REMOTE_CACHE_SECONDS = 3_600;

/**
 * 失败后的进程内冷却。COS 与上游同时挂掉时，若每个请求都去等满超时，
 * 降级就从「内容停更」变成「整站卡死」—— 冷却是为了把最坏情况限制在
 * 「每实例每 60 秒最多一次真拉」。
 */
const FAILURE_COOLDOWN_MS = 60_000;

/**
 * base64 字符数上限：Data Cache 单条 2MB，留够余量。
 * mods 那份当前约 68 万字符（4.7MB 原始），gamebanana 约 4.5 万字符
 * （266KB 原始，3057 行时约 48 万）。
 */
const MAX_REMOTE_PAYLOAD_CHARS = 1_800_000;

export function createSnapshotLoader(config: SnapshotLoaderConfig) {
  const {
    objectKey,
    bundledFile,
    cacheKey,
    tag,
    label,
    maxPayloadChars = MAX_REMOTE_PAYLOAD_CHARS,
  } = config;

  let remoteMemo: { payload: string; rows: SnapshotRow[] } | null = null;
  let remoteCooldownUntil = 0;
  let remoteConfigWarned = false;

  let bundledRows: SnapshotRow[] | null = null;
  let bundledCooldownUntil = 0;

  /**
   * 拉 COS 上那份快照，返回 base64 字符串（不是行数组，见文件头的不变量）。
   *
   * 失败必须 **throw**，不能返回空值：返回空值会被缓存一整个 TTL，
   * 变成「COS 恢复了也不生效」—— 与调用方「失败结果不进 Data Cache」同构。
   */
  async function fetchRemoteSnapshotPayload(url: string): Promise<string> {
    const response = await fetch(
      // ?t= 与 no-cache 只为击穿 COS 边缘可能残留的旧副本，不影响本缓存的键
      // （键是函数名 + 参数 url）。cache:"no-store" 是刻意的：这次 fetch 完全绕开
      // Next 自己的 Data Cache/RSC fetch cache，缓存语义只由外面这层 unstable_cache 负责，
      // 两套缓存不会互相盖住对方的结果。
      `${url}?t=${Date.now()}`,
      {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw new Error(`COS 快照 HTTP ${response.status}`);
    }

    const gz = Buffer.from(await response.arrayBuffer());

    const payload = gz.toString("base64");
    if (payload.length > maxPayloadChars) {
      throw new Error(`COS 快照 ${payload.length} 字符，超过 Data Cache 单条上限的安全余量`);
    }

    // 进缓存前先解一遍。坏对象（半截上传、传成别的东西、误加 Content-Encoding: gzip
    // 被 undici 自动解压）绝不能进 Data Cache —— 否则一次坏上传会被固化一整个 TTL。
    // 解出来的行丢掉，只借它做校验。
    decodeSnapshotGzip(gz);

    return payload;
  }

  const getCachedRemoteSnapshotPayload = unstable_cache(
    fetchRemoteSnapshotPayload,
    [`${cacheKey}-remote`],
    { revalidate: REMOTE_CACHE_SECONDS, tags: [tag] },
  );

  async function loadRemoteRows(): Promise<SnapshotRow[] | null> {
    const bucket = process.env.COS_BUCKET?.trim();
    const region = process.env.COS_REGION?.trim();

    if (!bucket || !region) {
      // 只告警一次，不每请求刷屏（与下面几条日志的策略一致）
      if (!remoteConfigWarned) {
        remoteConfigWarned = true;
        logger.warn(
          `${label} 未配置 COS_BUCKET / COS_REGION，远程兜底快照不可用（只用打包内那份）`,
        );
      }
      return null;
    }

    if (Date.now() < remoteCooldownUntil) {
      return null;
    }

    try {
      const payload = await getCachedRemoteSnapshotPayload(
        buildCosPublicUrl({ bucket, region, objectKey }),
      );

      // memo 抵掉每请求的 gunzip + JSON.parse（mods 那份 4.7MB，几十毫秒）。用 === 而不是哈希：
      // base64 是扁平字符串，V8 先比长度再 memcmp（约 50µs），比哈希更便宜；
      // 而且 key 是内容本身，对象一换自动失效，revalidateTag 之后不需要额外清理。
      if (remoteMemo?.payload === payload) {
        return remoteMemo.rows;
      }

      const rows = decodeSnapshotBase64(payload);
      remoteMemo = { payload, rows };

      // 用 warn 而不是 info：logger.info 在生产被静音（src/lib/logger.ts:27-31），
      // 而这一行是排查「锁定期前台的数据到底哪来的」唯一要看的东西。
      // 只在 memo 未命中时打，一个实例一份 payload 一行，不会刷屏。
      logger.warn(`${label} 已从远程快照（COS）载入`, { rows: rows.length });

      return rows;
    } catch (error) {
      remoteCooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
      logger.warn(`${label} 远程快照不可用，回退到打包内快照`, {
        error: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  async function loadBundledRows(): Promise<SnapshotRow[] | null> {
    if (bundledRows) {
      return bundledRows;
    }

    if (Date.now() < bundledCooldownUntil) {
      return null;
    }

    try {
      // 动态 import，与 features/gallery/config.ts 一致，避免被客户端打包
      const [{ readFile }, path] = await Promise.all([
        import("node:fs/promises"),
        import("node:path"),
      ]);

      const filePath = path.join(process.cwd(), "data", bundledFile);
      bundledRows = decodeSnapshotGzip(await readFile(filePath));

      logger.info(`${label} 本地兜底快照已载入`, { rows: bundledRows.length });
      return bundledRows;
    } catch (error) {
      // 不再把 [] 永久缓存：那会让「第一次读失败」变成整个实例生命周期内不可自愈。
      // 改成冷却 —— 既止住每请求刷日志，又能自己恢复。
      bundledCooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
      logger.warn(`${label} 本地兜底快照载入失败`, {
        error: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  /**
   * 取快照中的**原始行**（形状 = 导出 SQL 里那些列，snake_case）。
   *
   * 注意：返回的不是领域对象。调用方必须自己交给对应的 mapper 处理，
   * 不能直接塞给筛选/排序函数。
   */
  async function loadRows(): Promise<SnapshotRow[]> {
    return (await loadRemoteRows()) ?? (await loadBundledRows()) ?? [];
  }

  return { loadRows };
}
