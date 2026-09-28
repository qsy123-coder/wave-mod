/**
 * `gamebanana_mods` 兜底快照的发布（脚本侧共享模块）。
 *
 * 这是**第二份**快照，与 `mods` 那份完全独立（对象键、打包内文件、SQL 都不同）。
 * 为什么不合并成一份、以及读取侧在哪，见 src/lib/gamebanana-domain/snapshot.ts。
 *
 * 导出/上传的全部「手艺」都复用 scripts/mods-snapshot-export.mjs ——
 * 那里有行数骤降拒绝写出、与旧快照逐字节比对、原子替换、回读校验、失败重试，
 * 以及「绝不设 ContentEncoding」这种踩过的坑。本模块只是把**这一份快照的身份**
 * （SQL 路径、对象键、打包内路径）固定下来，避免每个调用点各写一遍常量。
 *
 * 与那个模块一样：不读 argv、import 时无副作用、不自建 COS 实例（由调用方注入或
 * 由下面的 best-effort 包一层），这样 vitest 能直接 import 它来测纯逻辑。
 *
 * ⚠️ `GAMEBANANA_SNAPSHOT_OBJECT_KEY` 的真源有两份（本文件 +
 * src/lib/gamebanana-domain/snapshot.ts），scripts 无法 import TS。
 * src/lib/gamebanana-domain/snapshot.test.ts 有用例比对这两个字符串。
 */

import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import COS from "cos-nodejs-sdk-v5";

import {
  SNAPSHOT_EXPORT_ATTEMPTS,
  SNAPSHOT_EXPORT_TIMEOUT_MS,
  exportModsSnapshot,
  putSnapshotToCos,
} from "./mods-snapshot-export.mjs";

/** 打包内那份快照在仓库里的相对路径 */
export const GAMEBANANA_SNAPSHOT_REL_PATH = "data/gamebanana-snapshot.json.gz";

/** 快照在 COS 上的对象键（与 mods 那份分属不同对象，互不覆盖） */
export const GAMEBANANA_SNAPSHOT_OBJECT_KEY = "snapshots/gamebanana-snapshot.json.gz";

/** 导出 SQL 的相对路径 */
export const GAMEBANANA_SNAPSHOT_SQL_REL_PATH = "scripts/gamebanana-snapshot.sql";

/**
 * 导出 `gamebanana_mods` 的已发布行 → outPath（.gz，原子替换）。
 *
 * 走 psql 直连 5432 而不是 supabase-js：网关正是可能被锁的那一层，
 * 且绕开它也就不消耗 Supabase 的出口流量配额（配额超限正是网关被锁的起因）。
 *
 * @param {object} input 见 mods-snapshot-export.mjs 的 exportModsSnapshot，sqlPath 有默认值
 */
export async function exportGamebananaSnapshot({ sqlPath, ...input }) {
  return exportModsSnapshot({
    ...input,
    sqlPath: sqlPath ?? resolve(process.cwd(), GAMEBANANA_SNAPSHOT_SQL_REL_PATH),
  });
}

/**
 * 导出 → 上传 COS。**刻意不含 ping**：顺序必须由调用方保证（导出 → 传 COS → ping），
 * 理由见 mods-snapshot-export.mjs 的 notifyRevalidate 注释。
 */
export async function publishGamebananaSnapshot({ cos, bucket, region, sqlPath, ...input }) {
  if (!bucket?.trim() || !region?.trim()) {
    throw new Error("publishGamebananaSnapshot 需要 COS bucket / region（COS_BUCKET / COS_REGION）");
  }

  const result = await exportGamebananaSnapshot({ ...input, sqlPath });
  const { url } = await putSnapshotToCos({
    cos,
    bucket,
    region,
    body: result.body,
    objectKey: GAMEBANANA_SNAPSHOT_OBJECT_KEY,
    log: input.log ?? console.log,
  });

  return { ...result, url };
}

/**
 * 「导出 → 传 COS」的**尽力而为**版本：读环境变量、任何失败都只告警。
 *
 * 给写库脚本（scripts/sync-gamebanana.mjs）在收尾时用。只告警不翻红：数据已经入库了，
 * 一次成功的写库不该因为快照没发出去而显示成失败 —— 但这个失效是最难发现的那种
 * （终端全绿、内容静默停更），所以告警写足两行。
 *
 * COS 环境变量在这里**惰性**读，不在启动时校验：同步脚本的常态用途是「只连库写几条」，
 * 不该因为缺 COS 四件套就跑不起来。
 *
 * @returns {Promise<boolean>} 是否真的发出去了（调用方据此决定要不要继续 ping）
 */
export async function publishGamebananaSnapshotBestEffort({
  databaseUrl = process.env.DATABASE_URL?.trim(),
  log = console.log,
  warn = console.warn,
} = {}) {
  const bucket = process.env.COS_BUCKET?.trim();
  const region = process.env.COS_REGION?.trim();
  const secretId = process.env.COS_SECRET_ID?.trim();
  const secretKey = process.env.COS_SECRET_KEY?.trim();

  if (!bucket || !region || !secretId || !secretKey) {
    warn("⚠️  缺少 COS 环境变量，跳过 GameBanana 兜底快照发布");
    warn("   库内数据已就绪；但若 Supabase 网关被锁，/gamebanana 仍会显示旧快照内容。");
    return false;
  }

  try {
    await publishGamebananaSnapshot({
      cos: new COS({ SecretId: secretId, SecretKey: secretKey }),
      bucket,
      region,
      databaseUrl,
      outPath: resolve(process.cwd(), GAMEBANANA_SNAPSHOT_REL_PATH),
      rawPath: join(tmpdir(), "wavemod-gamebanana-snapshot-raw.json"),
      timeoutMs: SNAPSHOT_EXPORT_TIMEOUT_MS,
      attempts: SNAPSHOT_EXPORT_ATTEMPTS,
      log,
    });
    return true;
  } catch (err) {
    warn(`⚠️  GameBanana 兜底快照发布失败: ${err.message}`);
    warn("   库内数据已就绪；但若 Supabase 网关被锁，/gamebanana 仍会显示旧快照内容。");
    return false;
  }
}
