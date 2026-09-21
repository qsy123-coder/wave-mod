/**
 * 「前台兜底快照是否真的镜像了库里的已发布集合」的纯判定。
 *
 * 为什么需要它：backup-to-github.mjs 原有的校验全是「防写坏」—— 截断比例
 * （SNAPSHOT_MIN_RATIO）、gzip 回读、原子替换 —— 防不住「写进去一份合法的旧数据」。
 * 而且那个比例检查是**相对**的：只跟上一份快照比，快照连续多日原地不动时，
 * 它每天都是 100%，永远不会报警。这里改用库内实时统计做**绝对**基准。
 *
 * 为什么抽成不碰 IO 的纯函数：真正会出错的那几种场景（导出被 psql 静默截断、
 * 查询少读、某天之后再没被写进去）在 CI 上几乎无法复现，全都只表现为
 * 「一份合法但过期的文件 + 退出码 0」。把判定与 psql / 文件读写分开才测得到。
 */

/**
 * 允许的行数漂移比例。
 *
 * 快照查询与计数查询是两次独立往返，中间存在并发写入窗口：刚发布的 mod
 * 可能只落在其中一个结果里。1% 覆盖这个窗口，同时远小于任何真实的
 * 「快照冻结」缺口（冻结一天就是十几条起步）。
 */
export const SNAPSHOT_COUNT_DRIFT_RATIO = 0.01;

/** 允许的最新时间戳漂移：同上，新 mod 可能正好落在两次查询之间 */
export const SNAPSHOT_TIME_DRIFT_MS = 60 * 60 * 1000;

/**
 * @param {{ count: number, maxCreatedAt: number | null }} snapshot
 *        本地快照（data/mods-snapshot.json.gz 解出来的内容），maxCreatedAt 为 epoch 毫秒
 * @param {{ count: number, maxCreatedAt: number | null }} db
 *        库里 is_published = true 的实时统计，同一口径
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkSnapshotFreshness(snapshot, db) {
  // 基准本身不可信时不能判「通过」：库里一条已发布的都没有，说明要么查错了库，
  // 要么站点真的空了，两种情况都必须让人看见（快照侧为空时导出早就抛了）。
  if (db.count === 0) {
    return { ok: false, reason: "库里已发布 mod 为 0 条，判定基准不可信" };
  }

  const tolerance = Math.max(1, Math.ceil(db.count * SNAPSHOT_COUNT_DRIFT_RATIO));
  const countDrift = Math.abs(snapshot.count - db.count);
  if (countDrift > tolerance) {
    return {
      ok: false,
      reason: `行数对不上：快照 ${snapshot.count} 条 / 库内已发布 ${db.count} 条（差 ${countDrift}，容忍 ${tolerance}）`,
    };
  }

  if (snapshot.maxCreatedAt === null || db.maxCreatedAt === null) {
    return {
      ok: false,
      reason: `无法比对最新时间戳（快照 ${snapshot.maxCreatedAt} / 库 ${db.maxCreatedAt}）`,
    };
  }

  const timeDrift = Math.abs(db.maxCreatedAt - snapshot.maxCreatedAt);
  if (timeDrift > SNAPSHOT_TIME_DRIFT_MS) {
    return {
      ok: false,
      reason:
        `最新记录比库内旧 ${(timeDrift / 3600000).toFixed(1)} 小时` +
        `（快照 ${new Date(snapshot.maxCreatedAt).toISOString()} / 库 ${new Date(db.maxCreatedAt).toISOString()}）`,
    };
  }

  return { ok: true };
}

/**
 * 从快照行数组里算出判定所需的 { count, maxCreatedAt }。
 *
 * created_at 缺失或不可解析的行直接跳过而不是当成 0：让 maxCreatedAt 保持
 * 由可解析的行决定，避免一行坏数据把整体判定带偏。
 */
export function snapshotStats(rows) {
  let maxCreatedAt = null;
  for (const row of rows) {
    const t = Date.parse(row?.created_at);
    if (Number.isNaN(t)) continue;
    if (maxCreatedAt === null || t > maxCreatedAt) maxCreatedAt = t;
  }
  return { count: rows.length, maxCreatedAt };
}
