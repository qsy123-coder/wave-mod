import { getDeviceId } from "./device";
import { ENGAGEMENT_MAX_IDS, type EngagementCounts, type EngagementMine } from "./types";

/**
 * 前端互动状态：模块级单例 + 按需批量拉取 + 乐观更新。
 *
 * 为什么不做成「每个卡片各拉各的」：一页 24 张卡就是 24 个请求。
 * 这里把所有订阅者的 id 收进 pending 集合，去抖一次合并成一个批量 GET。
 *
 * 三条硬规则：
 *   1. 拉取失败**静默降级** —— 保留服务端渲染时快照里的旧值，不白屏不报错。
 *   2. 点击**立即生效** —— 先改本地再发请求，失败回滚。
 *   3. 本地有未完成的改动时，**不让拉取结果覆盖**（靠 mutationSeq 判断）。
 */

export const EMPTY_COUNTS: EngagementCounts = { likes: 0, favorites: 0, views: 0 };
export const EMPTY_MINE: EngagementMine = { liked: false, favorited: false };

export type EngagementEntry = {
  counts: EngagementCounts;
  mine: EngagementMine;
  /** 是否已拿到服务端值；false 时展示的是服务端渲染快照里的旧值 */
  hydrated: boolean;
};

export type EngagementKind = "like" | "favorite";

const entries = new Map<string, EngagementEntry>();
const listeners = new Map<string, Set<(entry: EngagementEntry) => void>>();
const pending = new Set<string>();
/** 本会话已经上报过浏览的 mod，避免路由切换/重挂载时反复上报 */
const viewReported = new Set<string>();
/** 每个 id 的本地改动序号，用来丢弃「发出请求后用户又点了一下」的过期响应 */
const mutationSeq = new Map<string, number>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;

const BATCH_DEBOUNCE_MS = 60;

function bumpSeq(id: string): number {
  const next = (mutationSeq.get(id) ?? 0) + 1;
  mutationSeq.set(id, next);
  return next;
}

function seqOf(id: string): number {
  return mutationSeq.get(id) ?? 0;
}

function notify(id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  for (const listener of listeners.get(id) ?? []) listener(entry);
}

function put(id: string, next: EngagementEntry) {
  const prev = entries.get(id);
  if (
    prev &&
    prev.counts === next.counts &&
    prev.mine === next.mine &&
    prev.hydrated === next.hydrated
  ) {
    return;
  }
  entries.set(id, next);
  notify(id);
}

export function subscribe(id: string, listener: (entry: EngagementEntry) => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(id);
  };
}

export function getEntry(id: string): EngagementEntry | undefined {
  return entries.get(id);
}

/** 用服务端渲染快照打底。已经有更权威的值时不覆盖。 */
export function seed(id: string, initialCounts: EngagementCounts): void {
  if (entries.has(id)) return;
  entries.set(id, { counts: initialCounts, mine: EMPTY_MINE, hydrated: false });
}

/** 登记一个待拉取的 id 并触发去抖合并 */
export function request(id: string): void {
  pending.add(id);
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, BATCH_DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  const ids = [...pending];
  pending.clear();

  const targets = ids.filter((id) => {
    const entry = entries.get(id);
    return entry ? !entry.hydrated : false;
  });
  if (targets.length === 0) return;

  for (let offset = 0; offset < targets.length; offset += ENGAGEMENT_MAX_IDS) {
    const chunk = targets.slice(offset, offset + ENGAGEMENT_MAX_IDS);
    const seqAtRequest = new Map(chunk.map((id) => [id, seqOf(id)]));

    try {
      const response = await fetch(`/api/engagement?ids=${encodeURIComponent(chunk.join(","))}`, {
        headers: { "x-device-id": getDeviceId() },
        cache: "no-store",
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        counts?: Record<string, EngagementCounts>;
        mine?: Record<string, EngagementMine>;
      };

      for (const id of chunk) {
        const counts = data.counts?.[id];
        if (!counts) continue;
        // 用户在请求飞行途中又点了一下 → 丢弃这次响应，别把他的操作盖回去
        if (seqOf(id) !== seqAtRequest.get(id)) continue;

        const prev = entries.get(id);
        put(id, { counts, mine: data.mine?.[id] ?? prev?.mine ?? EMPTY_MINE, hydrated: true });
      }
    } catch {
      // 静默降级：保留快照值。hydrated 仍为 false，下次导航会再试。
    }
  }
}

/**
 * 切换点赞 / 收藏。返回是否成功，失败时调用方负责提示（并已自动回滚）。
 */
export async function toggle(id: string, kind: EngagementKind): Promise<boolean> {
  const entry = entries.get(id);
  if (!entry) return false;

  const previous = entry;
  const key = kind === "like" ? "liked" : "favorited";
  const nextActive = !previous.mine[key];

  const nextCounts: EngagementCounts = { ...previous.counts };
  if (kind === "like") {
    nextCounts.likes = Math.max(0, nextCounts.likes + (nextActive ? 1 : -1));
  } else {
    nextCounts.favorites = Math.max(0, nextCounts.favorites + (nextActive ? 1 : -1));
  }

  const mySeq = bumpSeq(id);
  put(id, {
    counts: nextCounts,
    mine: { ...previous.mine, [key]: nextActive },
    hydrated: previous.hydrated,
  });

  const action = kind === "like" ? (nextActive ? "like" : "unlike") : nextActive ? "favorite" : "unfavorite";

  try {
    const response = await fetch("/api/engagement", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify({ modId: id, action }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as {
      counts?: Record<string, EngagementCounts>;
      mine?: Record<string, EngagementMine>;
    };

    // 只有「没人抢在我后面又点一下」时才采纳服务端结果
    if (seqOf(id) === mySeq) {
      const counts = data.counts?.[id];
      if (counts) {
        put(id, { counts, mine: data.mine?.[id] ?? { ...previous.mine, [key]: nextActive }, hydrated: true });
      }
    }

    return true;
  } catch {
    if (seqOf(id) === mySeq) put(id, previous);
    return false;
  }
}

/** 上报一次浏览。同一会话内同一个 mod 只报一次，失败静默。 */
export function reportView(id: string): void {
  if (typeof window === "undefined") return;
  if (viewReported.has(id)) return;
  viewReported.add(id);

  const seqAtRequest = seqOf(id);

  void fetch("/api/engagement", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": getDeviceId() },
    body: JSON.stringify({ modId: id, action: "view" }),
    keepalive: true,
  })
    .then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as { counts?: Record<string, EngagementCounts> };
      const counts = data.counts?.[id];
      const prev = entries.get(id);
      if (!counts || !prev) return;
      if (seqOf(id) !== seqAtRequest) return;
      put(id, { ...prev, counts, hydrated: true });
    })
    .catch(() => {
      // 静默：浏览数不是关键路径
    });
}

/** 当前设备对某个 mod 的收藏态（给「本机收藏清单」用） */
export function isFavoritedLocally(id: string): boolean {
  return entries.get(id)?.mine.favorited ?? false;
}
