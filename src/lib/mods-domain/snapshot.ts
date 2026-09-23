import "server-only";

import { unstable_cache } from "next/cache";

import { buildCosPublicUrl } from "@/lib/cos/shared";
import { logger } from "@/lib/logger";
import { modCacheTags } from "@/lib/mod-cache";
import { decodeSnapshotBase64, decodeSnapshotGzip } from "@/lib/mods-domain/snapshot-codec";

/**
 * Supabase 网关不可用时的兜底快照。
 *
 * 背景：2026-09-21 Supabase 项目因 `exceed_egress_quota` 被 restriction，
 * REST 与 Auth 全部返回 402 Payment Required：
 *
 *   "Service for this project is restricted due to the following violations:
 *    exceed_egress_quota."
 *
 * 封的是 HTTP 网关，直连 Postgres（5432 pooler）不受影响，因此可以用
 * scripts/export-mods-snapshot.ps1 从完好的库里导出已发布行，随仓库发布，
 * 供 public.ts 的读路径兜底 —— 保证网关被锁期间前台仍能浏览、搜索、翻页。
 *
 * 快照是**只读快照**，不承担写入：后台编辑、收藏、评论仍需 Supabase 恢复后才可用。
 *
 * ## 两条来源，远程优先
 *
 * 打包内那份（data/mods-snapshot.json.gz）**只在构建时**进得来，所以锁定期内
 * 新内容想上线就必须重新部署 —— 2026-09-21「当天 16 条 mod 在站上没有迅雷按钮」
 * 就是这么来的。因此同一份快照还会被脚本发到腾讯 COS，这里优先读它：
 *
 *   远程（COS，带缓存 + 主动失效） → 打包内文件 → 空数组
 *
 * 这样运行中的部署也能读到新对象，配合脚本收尾 ping 的 /api/revalidate
 * （会清掉 modCacheTags.snapshot）上传完几秒内即可见，无需重新部署。
 * 对象是公开读的，取它不需要任何密钥，只需要 COS_BUCKET / COS_REGION。
 *
 * ## 一条不能破坏的不变量
 *
 * **只缓存「输入」（COS 上那份 payload），绝不缓存「输出」（某个 gameKey 的行）。**
 *
 * public.ts 的关键性质是「回退发生在 unstable_cache 外部，失败结果不进缓存，
 * 网关一恢复立刻回到实时数据」。这里给远程快照加缓存不能破坏它：
 * 缓存的是压缩态 base64 字符串（约 684KB），不是解析后的行数组 ——
 * 解析后约 4.7MB，超过 Vercel Data Cache 单条 2MB 的上限，而 Next 超限时是
 * **静默跳过写入**，那会退化成「每个请求都真拉一次 513KB」，比不缓存更糟。
 *
 * 为什么存 .gz：未压缩 4.7MB，会被 outputFileTracingIncludes 复制进每个
 * serverless 函数；gzip 后仅 500KB。zlib 是 Node 内置，不引入新依赖。
 *
 * 为什么不含 xxmi_install_guide：该列全库只有 2 个近似取值（就是
 * install-guide.ts 里的静态文本，只差一个换行），却占 payload 约 24%
 * （实测每次整表扫省 1,384,698 字节 ≈ 1.32 MiB）。
 * 导出时不带该列，由 mapMod 统一回填默认常量 —— 与线上列表路径的口径一致，
 * 所以这里不需要再单独补该列。
 *
 * 代价：网关被锁期间，若某条 mod 的安装说明被后台自定义过，详情页会显示默认文本
 * （快照里没有该列的值）。全库当前没有这种行，且属于降级期可接受的损失。
 */

type SnapshotRow = Record<string, unknown>;

/**
 * 快照在 COS 上的对象键。
 *
 * ⚠️ 真源有两份（本文件 + scripts/mods-snapshot-export.mjs）—— scripts 无法 import TS，
 * 与 scripts/mods-snapshot.sql 的情况一样。改一处必须同步另一处，
 * snapshot.test.ts 有用例比对这两个字符串。
 */
export const SNAPSHOT_OBJECT_KEY = "snapshots/mods-snapshot.json.gz";

const BUNDLED_SNAPSHOT_FILE = "mods-snapshot.json.gz";

const REMOTE_TIMEOUT_MS = 5_000;

/**
 * 刻意短于列表缓存的 TTL（public.ts 里是 6 小时）：降级期的正常刷新手段是脚本
 * 发完新对象后 ping /api/revalidate，那是即时的；这个 TTL 只是「ping 没打通」时的兜底延迟。
 */
const REMOTE_CACHE_SECONDS = 3_600;

/**
 * 失败后的进程内冷却。COS 与 Supabase 同时挂掉时，若每个请求都去等满超时，
 * 降级就从「内容停更」变成「整站卡死」—— 冷却是为了把最坏情况限制在
 * 「每实例每 60 秒最多一次真拉」。
 */
const FAILURE_COOLDOWN_MS = 60_000;

/** base64 字符数上限：Data Cache 单条 2MB，留够余量（当前约 68 万字符，约 1.5 万行才触顶） */
const MAX_REMOTE_PAYLOAD_CHARS = 1_800_000;

let remoteMemo: { payload: string; rows: SnapshotRow[] } | null = null;
let remoteCooldownUntil = 0;
let remoteConfigWarned = false;

let bundledRows: SnapshotRow[] | null = null;
let bundledCooldownUntil = 0;

/**
 * 拉 COS 上那份快照，返回 base64 字符串（不是行数组，见文件头的不变量）。
 *
 * 失败必须 **throw**，不能返回空值：返回空值会被缓存一整个 TTL，
 * 变成「COS 恢复了也不生效」—— 与 public.ts 里「失败结果不进 Data Cache」同构。
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
  if (payload.length > MAX_REMOTE_PAYLOAD_CHARS) {
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
  ["mods-snapshot-remote"],
  { revalidate: REMOTE_CACHE_SECONDS, tags: [modCacheTags.snapshot] },
);

async function loadRemoteRows(): Promise<SnapshotRow[] | null> {
  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();

  if (!bucket || !region) {
    // 只告警一次，不每请求刷屏（与下面几条日志的策略一致）
    if (!remoteConfigWarned) {
      remoteConfigWarned = true;
      logger.warn("[mods] 未配置 COS_BUCKET / COS_REGION，远程兜底快照不可用（只用打包内那份）");
    }
    return null;
  }

  if (Date.now() < remoteCooldownUntil) {
    return null;
  }

  try {
    const payload = await getCachedRemoteSnapshotPayload(
      buildCosPublicUrl({ bucket, region, objectKey: SNAPSHOT_OBJECT_KEY }),
    );

    // memo 抵掉每请求的 gunzip + JSON.parse（4.7MB，几十毫秒）。用 === 而不是哈希：
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
    logger.warn("[mods] 已从远程快照（COS）载入", { rows: rows.length });

    return rows;
  } catch (error) {
    remoteCooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
    logger.warn("[mods] 远程快照不可用，回退到打包内快照", {
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

    const filePath = path.join(process.cwd(), "data", BUNDLED_SNAPSHOT_FILE);
    bundledRows = decodeSnapshotGzip(await readFile(filePath));

    logger.info("[mods] 本地兜底快照已载入", { rows: bundledRows.length });
    return bundledRows;
  } catch (error) {
    // 不再把 [] 永久缓存：那会让「第一次读失败」变成整个实例生命周期内不可自愈。
    // 改成冷却 —— 既止住每请求刷日志，又能自己恢复。
    bundledCooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
    logger.warn("[mods] 本地兜底快照载入失败", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * 取快照中某游戏的已发布**原始行**（形状 = Supabase 按 publicModColumns 返回的那种）。
 *
 * 注意：返回的不是领域对象。`getCachedModShard` 缓存的是 mapMod **之后**的结果，
 * 这里是它的输入形状而不是输出形状 —— 调用方必须自己交给 mapMod 处理，
 * 不能直接塞给 applyModQueryFilters。
 */
export async function getSnapshotRows(gameKey: string): Promise<Record<string, unknown>[]> {
  const rows = (await loadRemoteRows()) ?? (await loadBundledRows()) ?? [];
  return rows.filter((row) => row.game_key === gameKey);
}
