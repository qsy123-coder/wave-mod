import type { EngagementAction, EngagementCounts, EngagementMine } from "./types";

/**
 * 计数器的**纯逻辑**：不碰文件系统、不依赖 Next 运行时，因此可以直接单测。
 * 落盘与并发控制在 ./store（带 `server-only`）。
 *
 * 设计要点 —— 计数分两层：
 *   1. **基线**（engagement-baseline.json）：上线时从 Supabase 只读导出的历史计数，
 *      此后不再变动。重跑导入脚本只是覆盖这个文件，天然幂等，不会叠加。
 *   2. **增量**（engagement.json）：上线之后的新互动。点赞靠 likedBy 里的设备号去重，
 *      浏览靠 viewDays 里「设备 + 日期」去重。
 * 对外展示的计数 = 基线 + 增量。
 */

/** 一个 MOD 的增量状态 */
export type StoredMod = {
  /** 点过赞的设备号（去重依据，长度即新增点赞数） */
  likedBy: string[];
  /** 收藏过的设备号（同上） */
  favoritedBy: string[];
  /** 设备号 → 收藏时间（ISO）。只用来给「我的收藏」排序与显示，不参与计数。 */
  favoritedAt: Record<string, string>;
  /** 累计新增浏览数（含已被 prune 掉的旧日期，所以必须单独存计数） */
  views: number;
  /** 近期浏览去重表：日期 → 当天浏览过的设备号 */
  viewDays: Record<string, string[]>;
};

export type EngagementState = {
  version: 1;
  mods: Record<string, StoredMod>;
};

/**
 * 基线：MOD id → 历史计数。
 * 用 Partial 是因为导入脚本可能只导了部分字段（例如 Supabase 里某列是 null）。
 */
export type EngagementBaseline = Record<string, Partial<EngagementCounts>>;

export function emptyState(): EngagementState {
  return { version: 1, mods: {} };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 宽容解析落盘内容：**宁可丢掉坏字段也不要整份清零**。
 * 文件被截断/手改坏时，能救回来的部分照常工作，调用方负责把异常记进日志。
 */
export function parseState(raw: unknown): EngagementState {
  const state = emptyState();
  if (!raw || typeof raw !== "object") return state;

  const mods = (raw as { mods?: unknown }).mods;
  if (!mods || typeof mods !== "object") return state;

  for (const [modId, value] of Object.entries(mods as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;

    const viewDays: Record<string, string[]> = {};
    if (entry.viewDays && typeof entry.viewDays === "object") {
      for (const [day, devices] of Object.entries(entry.viewDays as Record<string, unknown>)) {
        const list = toStringArray(devices);
        if (list.length > 0) viewDays[day] = list;
      }
    }

    const favoritedAt: Record<string, string> = {};
    if (entry.favoritedAt && typeof entry.favoritedAt === "object") {
      for (const [device, at] of Object.entries(entry.favoritedAt as Record<string, unknown>)) {
        if (typeof at === "string" && at.length > 0) favoritedAt[device] = at;
      }
    }

    state.mods[modId] = {
      likedBy: toStringArray(entry.likedBy),
      favoritedBy: toStringArray(entry.favoritedBy),
      favoritedAt,
      views: toCount(entry.views),
      viewDays,
    };
  }

  return state;
}

/** 宽容解析基线文件：只认三个非负整数 */
export function parseBaseline(raw: unknown): EngagementBaseline {
  const baseline: EngagementBaseline = {};
  if (!raw || typeof raw !== "object") return baseline;

  for (const [modId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const parsed: Partial<EngagementCounts> = {};

    if (entry.likes !== undefined) parsed.likes = toCount(entry.likes);
    if (entry.favorites !== undefined) parsed.favorites = toCount(entry.favorites);
    if (entry.views !== undefined) parsed.views = toCount(entry.views);

    if (Object.keys(parsed).length > 0) baseline[modId] = parsed;
  }

  return baseline;
}

/** 取（必要时创建）某个 MOD 的增量槽位 */
export function slot(state: EngagementState, modId: string): StoredMod {
  const existing = state.mods[modId];
  if (existing) return existing;

  const created: StoredMod = { likedBy: [], favoritedBy: [], favoritedAt: {}, views: 0, viewDays: {} };
  state.mods[modId] = created;
  return created;
}

export function computeCounts(state: EngagementState, baseline: EngagementBaseline, modId: string): EngagementCounts {
  const base = baseline[modId];
  const entry = state.mods[modId];

  return {
    likes: (base?.likes ?? 0) + (entry?.likedBy.length ?? 0),
    favorites: (base?.favorites ?? 0) + (entry?.favoritedBy.length ?? 0),
    views: (base?.views ?? 0) + (entry?.views ?? 0),
  };
}

export function computeMine(state: EngagementState, modId: string, deviceId: string): EngagementMine {
  const entry = state.mods[modId];
  if (!entry || !deviceId) return { liked: false, favorited: false };

  return {
    liked: entry.likedBy.includes(deviceId),
    favorited: entry.favoritedBy.includes(deviceId),
  };
}

function toggle(list: string[], deviceId: string): boolean {
  const index = list.indexOf(deviceId);
  if (index >= 0) {
    list.splice(index, 1);
    return false;
  }
  list.push(deviceId);
  return true;
}

/**
 * 应用一次互动。**就地修改** state（调用方持有单例），返回该 MOD 的最新状态。
 *
 * 去重语义：
 *   - like / favorite：同一设备重复触发 = 抵消（toggle），与用户直觉一致
 *   - view：同一设备同一天只算一次，重复上报是 no-op（不是 toggle）
 */
export function applyAction(
  state: EngagementState,
  action: EngagementAction,
  modId: string,
  deviceId: string,
  day: string,
  nowIso: string = new Date().toISOString()
): void {
  const entry = slot(state, modId);

  switch (action) {
    case "like":
      toggle(entry.likedBy, deviceId);
      break;
    case "unlike": {
      // 显式取消：设备号不在列表里时是 no-op（老用户在 Supabase 时代赞过，
      // 那条记录只体现在基线里，取消不应该把基线数字扣掉）
      const index = entry.likedBy.indexOf(deviceId);
      if (index >= 0) entry.likedBy.splice(index, 1);
      break;
    }
    case "favorite": {
      const active = toggle(entry.favoritedBy, deviceId);
      // 时间戳只给「我的收藏」排序用，取消时要一起清掉，否则会留下幽灵条目
      if (active) entry.favoritedAt[deviceId] = nowIso;
      else delete entry.favoritedAt[deviceId];
      break;
    }
    case "unfavorite": {
      const index = entry.favoritedBy.indexOf(deviceId);
      if (index >= 0) entry.favoritedBy.splice(index, 1);
      delete entry.favoritedAt[deviceId];
      break;
    }
    case "view": {
      const today = entry.viewDays[day] ?? (entry.viewDays[day] = []);
      if (today.includes(deviceId)) break;
      today.push(deviceId);
      entry.views += 1;
      break;
    }
    default:
      break;
  }
}

/**
 * 只保留最近 `keep` 天的浏览去重表。
 * `views` 计数是累计值，不受影响 —— 这也是它必须与 viewDays 分开存的原因。
 */
export function pruneViewDays(state: EngagementState, today: string, keep = 2): void {
  const cutoffDays = new Set<string>();
  const cursor = new Date(`${today}T00:00:00Z`);
  for (let offset = 0; offset < keep; offset += 1) {
    const d = new Date(cursor.getTime() - offset * 86_400_000);
    cutoffDays.add(d.toISOString().slice(0, 10));
  }

  for (const entry of Object.values(state.mods)) {
    for (const day of Object.keys(entry.viewDays)) {
      if (!cutoffDays.has(day)) delete entry.viewDays[day];
    }
  }
}

/**
 * 这台设备收藏过的 MOD id，**最近收藏的排在前面**。
 *
 * 这是一次 O(已记录的 mod 数) 的内存扫描：只服务「我的收藏」这一条低频路径，
 * 相比为它单独维护一份反向索引，扫描更好维护也更不容易写歪。
 */
export function listFavoritedIds(state: EngagementState, deviceId: string): string[] {
  if (!deviceId) return [];

  return Object.entries(state.mods)
    .filter(([, entry]) => entry.favoritedBy.includes(deviceId))
    .map(([modId, entry]) => ({ modId, at: entry.favoritedAt[deviceId] ?? "" }))
    .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1))
    .map((item) => item.modId);
}

/** 上海的「今天」，站点所有日期口径都以此为准（与上传脚本的 noonShanghaiISO 对齐） */
export function shanghaiDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
