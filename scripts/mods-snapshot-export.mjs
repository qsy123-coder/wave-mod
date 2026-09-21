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

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { psqlToFile } from "./psql-db.mjs";

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

/**
 * 单次导出的墙钟上限与重试次数。
 *
 * 全量快照是**一个** 5MB 上下的 JSON 值、由 psql 一次性落盘，所以在慢链路上
 * 「慢」与「挂死」在外部看起来一模一样（都是几十分钟没输出）。这里给一次上限，
 * 超时就当失败重试（只读 select，重来一遍没有副作用），总预算 2×15min 有界，
 * 比「无限期挂着、谁也说不清卡在哪」强。
 *
 * 上限取 15 分钟而不是几分钟：2026-09-21 在本机实测，这条到 Supabase pooler 的
 * 链路差的时候只有 ~11KB/s（265KB 的查询要 24s），5MB 导出要 7 分钟以上 ——
 * 而本地每日上传脚本走的就是这条路径，导出失败就意味着「网关被锁期间新内容看不见」，
 * 正是这套兜底快照机制存在的理由。CI（GitHub runner）链路快得多，且 job 上限 120 分钟。
 */
export const SNAPSHOT_EXPORT_TIMEOUT_MS = 900_000;
export const SNAPSHOT_EXPORT_ATTEMPTS = 2;

/**
 * 归一化 psql 原始输出的**行尾**：`\r\n` → `\n`（只处理结尾那一处）。
 *
 * Windows 的 psql 用文本模式写 `-o` 文件，会把结尾的 `\n` 落成 `\r\n`；Linux（CI）
 * 则是 `\n`。不归一化的话，同一份库内容在两边产出的字节不同 ⇒ `unchanged` 判定
 * 在本地永远失败，每次都白重写一个 500KB 二进制（git 历史也跟着涨）。
 *
 * 只动结尾这一处：JSON 字符串里的换行由 `row_to_json` 转义成 `\r`/`\n` 两个字符，
 * 不会以裸字节形式出现在 payload 里，所以正文中不存在需要保留的换行。
 */
export function normalizeRawSnapshot(rawBuf) {
  const text = rawBuf.toString("utf8");
  const normalized = /\r\n$/.test(text) ? `${text.slice(0, -2)}\n` : text;
  return normalized === text ? rawBuf : Buffer.from(normalized, "utf8");
}

/**
 * 这份新导出该不该覆盖磁盘上那份快照。**纯函数**：只看入参，不碰文件系统。
 *
 * @param {{ rows: unknown[], rawBuf: Buffer, prevBuf: Buffer|null, minRatio?: number }} input
 *   rows    新导出的行数组（已解析）
 *   rawBuf  新导出的**原始字节**（psql -o 写出来的那份）
 *   prevBuf 上一份快照**解压后**的字节；没有旧快照时传 null
 * @returns {{ action: "write"|"unchanged"|"reject", prevCount: number|null, reason?: string }}
 *
 * 比对的是**解压后**的内容而不是 gzip 字节：不同 gzip 实现（CI 的 zlib / 本机脚本的
 * .NET GZipStream）对同一份输入产出的字节不同，按 gzip 字节比的话，500KB 二进制
 * 会每天进一次 git 历史。
 *
 * 旧快照损坏 / 读不出来时**照常写出**：否则快照会永远卡在那个坏文件上。
 * 这也是为什么「解析旧快照」的失败必须和「行数下限」的判定分开 —— 两者混在一个
 * try 里的话，下限判定抛出的异常会被那句 catch 当成「旧快照损坏」吞掉，
 * 然后一路走到覆盖写出，把一次失败洗成成功。
 */
export function decideSnapshotWrite({ rows, rawBuf, prevBuf, minRatio = SNAPSHOT_MIN_RATIO }) {
  let prevCount = null;
  let unchanged = false;

  if (prevBuf) {
    try {
      const parsedPrev = JSON.parse(prevBuf.toString("utf8"));
      if (Array.isArray(parsedPrev)) {
        prevCount = parsedPrev.length;
        unchanged = prevBuf.equals(rawBuf);
      }
    } catch {
      // 旧快照损坏/不是 JSON：当作没有旧快照，继续走覆盖写出
    }
  }

  if (unchanged) {
    return { action: "unchanged", prevCount };
  }

  // 上游查询被截断时 psql 依然可能退出 0，只留下一份「合法但少了几千行」的 JSON。
  // 兜底快照是网关被锁时唯一的数据源，写进残缺版本比不更新危险得多，故设下限。
  if (prevCount !== null && rows.length < prevCount * minRatio) {
    return {
      action: "reject",
      prevCount,
      reason: `新快照仅 ${rows.length} 条，旧快照 ${prevCount} 条（${((rows.length / prevCount) * 100).toFixed(1)}%），判为异常，保留旧快照`,
    };
  }

  return { action: "write", prevCount };
}

/** 读上一份快照并解压；不存在或损坏时返回 null（调用方按「没有旧快照」处理） */
function readPrevSnapshot(outPath) {
  if (!existsSync(outPath)) return null;
  try {
    return gunzipSync(readFileSync(outPath));
  } catch {
    return null;
  }
}

/**
 * 从库里导出兜底快照 → outPath（.gz，原子替换）。
 *
 * SQL 走 psql 直连 5432 而不是 supabase-js：网关正是可能被锁的那一层，
 * 且绕开它也就不消耗 Supabase 的出口流量配额（配额超限正是网关被锁的起因）。
 *
 * @param {object} input
 * @param {string} input.databaseUrl Supabase 直连串
 * @param {string} input.sqlPath     导出 SQL（scripts/mods-snapshot.sql）
 * @param {string} input.outPath     目标 .gz 路径
 * @param {string} input.rawPath     中间产物（psql 原始输出）落盘位置，**必须是独立于 outPath 的临时路径**
 * @param {string} [input.psqlPath]  覆盖 psql 可执行文件路径
 * @param {number} [input.minRatio]
 * @param {number} [input.timeoutMs] 单次导出的墙钟上限（见 SNAPSHOT_EXPORT_TIMEOUT_MS）
 * @param {number} [input.attempts]  失败重试次数（含首次）
 * @param {(rows: unknown[]) => Promise<void>} [input.validate] 写出后的一致性校验（如 assertSnapshotMirrorsDb）
 * @returns {Promise<{count: number, changed: boolean, gzipBytes: number, body: Buffer, rows: unknown[]}>}
 *   body 就是**该发到 COS 的那份字节**（changed=false 时即磁盘上已有的那份），调用方无需回读文件。
 */
export async function exportModsSnapshot({
  databaseUrl,
  sqlPath,
  outPath,
  rawPath,
  psqlPath,
  minRatio = SNAPSHOT_MIN_RATIO,
  timeoutMs = SNAPSHOT_EXPORT_TIMEOUT_MS,
  attempts = SNAPSHOT_EXPORT_ATTEMPTS,
  validate,
  log = console.log,
}) {
  if (!existsSync(sqlPath)) {
    throw new Error(`找不到 ${sqlPath}`);
  }

  // rawPath 与 outPath 必须不同：psqlToFile 调用前会先删掉输出文件，
  // 若两者是同一个路径，上一份快照就没得比了（new/unchanged 判定全部失效）。
  if (rawPath === outPath) {
    throw new Error("exportModsSnapshot 的 rawPath 必须是独立于 outPath 的临时路径");
  }

  // 失败重试：慢链路下单次导出随时可能被截断/黑洞掉，而这只是一次只读 select，
  // 重来一遍没有任何副作用（psqlToFile 每次都会先删掉 rawPath，不会留下半截文件）。
  let lastError;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      await psqlToFile({ databaseUrl, outPath: rawPath, sqlPath, psqlPath, timeoutMs });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        log(`⚠️  第 ${attempt}/${attempts} 次导出失败：${err.message}，重试 ...`);
      }
    }
  }
  if (lastError) {
    throw new Error(`导出快照连续失败 ${attempts} 次，最后一次：${lastError.message}`);
  }

  // 归一化行尾后再比对与 gzip：本地（Windows psql 文本模式 → \r\n）与 CI（\n）
  // 必须产出同一份字节，否则 unchanged 判定在本地永远不成立。
  const rawBuf = normalizeRawSnapshot(readFileSync(rawPath));
  const text = rawBuf.toString("utf8");

  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error(`psql 输出不是合法 JSON（前 200 字符）：${text.slice(0, 200)}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("快照为空，拒绝写出");
  }

  const decision = decideSnapshotWrite({ rows, rawBuf, prevBuf: readPrevSnapshot(outPath), minRatio });

  if (decision.action === "reject") {
    rmSync(rawPath, { force: true });
    throw new Error(decision.reason);
  }

  if (decision.action === "unchanged") {
    rmSync(rawPath, { force: true });
    const body = readFileSync(outPath);
    log(`✅ 快照无变化（${rows.length} 条已发布），跳过写出`);
    // 内容与这次的新导出逐字节相同 ⇒ 磁盘上这份就是最新的。但仍要核对库内统计：
    // 万一这次的新导出本身就少读了几行，上面那条比对是发现不了的。
    if (validate) await validate(rows);
    return { count: rows.length, changed: false, gzipBytes: body.length, body, rows };
  }

  const gz = gzipSync(rawBuf, { level: 9 });
  // 回读校验：写坏了会被前台当成「网关正常但没数据」，比不写更糟
  const roundTrip = JSON.parse(gunzipSync(gz).toString("utf8"));
  if (roundTrip.length !== rows.length) {
    throw new Error(`快照回读校验失败：${roundTrip.length} != ${rows.length}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const tmpGz = `${outPath}.tmp`;
  writeFileSync(tmpGz, gz);
  renameSync(tmpGz, outPath); // 原子替换，避免半截文件被读走/被 git 提交
  rmSync(rawPath, { force: true });

  // 写完再验一次。上面所有校验都只证明「文件没写坏」，这一条才证明「内容是当前库」。
  if (validate) await validate(rows);

  const featured = rows.filter((r) => r.is_featured === true).length;
  log(`✅ 快照已写出：${rows.length} 条已发布（推荐位 ${featured}）  ${(gz.length / 1024).toFixed(0)}KB`);
  return { count: rows.length, changed: true, gzipBytes: gz.length, body: gz, rows };
}

/**
 * 导出 → 上传 COS。**刻意不含 ping**：顺序必须由调用方保证（导出 → 传 COS → ping），
 * 理由见 notifyRevalidate 的注释。
 *
 * 任何一步失败都抛（是否只告警由调用方决定）。
 */
export async function publishSnapshotToCos({ cos, bucket, region, objectKey, ...exportInput }) {
  if (!bucket?.trim() || !region?.trim()) {
    throw new Error("publishSnapshotToCos 需要 COS bucket / region（COS_BUCKET / COS_REGION）");
  }

  const result = await exportModsSnapshot(exportInput);
  const { url } = await putSnapshotToCos({
    cos,
    bucket,
    region,
    body: result.body,
    objectKey,
    log: exportInput.log ?? console.log,
  });

  return { ...result, url };
}

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
