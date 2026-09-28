import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { gamebananaCacheTags } from "@/lib/gamebanana-domain/cache";
import {
  mapGamebananaMod,
  mapGamebananaModDetail,
  publicGamebananaColumns,
} from "@/lib/gamebanana-domain/mappers";
import { getGamebananaSnapshotRows } from "@/lib/gamebanana-domain/snapshot";
import type { GamebananaMod, GamebananaModDetail } from "@/lib/gamebanana-domain/types";
import { logger } from "@/lib/logger";
import { createPublicReadClient } from "@/lib/supabase/server";

/**
 * 列表页下发的列。清单本体在 `mappers.ts`（`publicGamebananaColumns`），
 * 与 `GamebananaListRow` 摆在一起、并有单测当流量护栏 —— 那边的注释解释了
 * 为什么刻意不取 `images` / `description`。
 */
const LIST_COLUMNS = publicGamebananaColumns;

/** 与页面 `revalidate` 对齐。上游失败时**不进缓存的**是「失败」这件事本身，见下。 */
const CACHE_SECONDS = 21600;

/**
 * 走 anon 客户端 + RLS（策略是 `is_published = true` 才可读）的全量在架列表。
 *
 * 失败时**向上抛**而不是返回空数组：`unstable_cache` 不缓存抛出的异常，
 * 于是回退逻辑能留在缓存外面 —— 网关一恢复立刻回到实时数据，不必等 TTL。
 * （与 `mods-domain/public.ts` 的 getCachedModShard 同一条理由。）
 */
const getCachedGamebananaMods = unstable_cache(
  async (): Promise<GamebananaMod[]> => {
    const supabase = createPublicReadClient();
    const { data, error } = await supabase
      .from("gamebanana_mods")
      .select(LIST_COLUMNS)
      .eq("is_published", true)
      // 排序交给客户端（filter-params 的 applyGamebananaFilters），这里只固定一个稳定顺序，
      // 保证同一份数据每次查询的顺序一致 —— 否则预渲染的 HTML 与 hydration 后的
      // 客户端排序会闪一下。
      .order("like_count", { ascending: false });

    if (error) throw new Error(error.message);
    // `select()` 的返回类型是从字符串字面量推的，LIST_COLUMNS 是拼接出来的常量，
    // 推不出列集合，只能在这里断言一次。列清单的真身在上面那段注释里维护。
    return (data ?? []).map((row) => mapGamebananaMod(row as never));
  },
  ["gamebanana-mods"],
  { revalidate: CACHE_SECONDS, tags: [gamebananaCacheTags.list] },
);

/**
 * 全量在架列表，读不到就走兜底快照。
 *
 * 快照是**独立的一份**（`snapshots/gamebanana-snapshot.json.gz`），不是 `mods` 那份 ——
 * 详见 `src/lib/gamebanana-domain/snapshot.ts` 里为什么不并进共享快照。
 *
 * 回退刻意放在 `unstable_cache` **外面**（同 `mods-domain/public.ts` 的写法）：
 * 缓存的永远只是「Supabase 正常时的结果」，失败结果不进 Data Cache，
 * 网关一恢复下一个请求就回到实时数据。
 */
export async function getGamebananaMods(): Promise<GamebananaMod[]> {
  try {
    return await getCachedGamebananaMods();
  } catch (err) {
    logger.warn("[gamebanana] 读列表失败，回退到兜底快照", { error: err });

    const rows = await getGamebananaSnapshotRows();
    if (rows.length === 0) {
      // 两条来源都没货：这才是真正「像空库」的那种降级，值得留 error 级痕迹 ——
      // 否则前台的空列表与「快照机制本身没生效」在日志里长得一模一样。
      logger.error("[gamebanana] 兜底快照也为空，列表退化为空");
      return [];
    }

    // 快照里存的是原始行，走与正常路径同一个 mapGamebananaMod，
    // 保证两条路径产出的对象形状一致。
    return rows.map((row) => mapGamebananaMod(row as never));
  }
}

/**
 * Supabase 那一路的详情读（`select("*")`，含相册与长文本）。
 *
 * **`unstable_cache` 只包这一段**，理由与列表完全相同：缓存里只允许存「Supabase
 * 正常时的结果」，失败必须向上抛。包在外面的话，网关抖一下就会有一条 mod 被判成
 * 「不存在」并缓存 6 小时 —— 详情页 404、抽屉里显示「内容不存在」，而它其实只是
 * 那一次没读到。
 *
 * 为什么详情值得进持久缓存（而 `/mods` 那边是每请求现查）：这里的调用方多了一个
 * **抽屉的取数口**（`/api/gamebanana/[gb_id]`），用户点开一次抽屉就是一次查询。
 * 按 id 缓存后，同一件作品被反复点开只打一次库；tag 与列表共用
 * `gamebanana:snapshot`，同步脚本那一次 ping 就能把两个一起清掉。
 */
const getCachedGamebananaModById = unstable_cache(
  async (gbId: number): Promise<GamebananaModDetail | null> => {
    const supabase = createPublicReadClient();
    const { data, error } = await supabase
      .from("gamebanana_mods")
      .select("*")
      .eq("gb_id", gbId)
      .eq("is_published", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapGamebananaModDetail(data) : null;
  },
  ["gamebanana-mod-detail"],
  { revalidate: CACHE_SECONDS, tags: [gamebananaCacheTags.list] },
);

/**
 * 按 gb_id 取详情。
 *
 * 返回 `null` 表示没有这条（未发布或不存在），由页面与 API 路由转成 404。
 *
 * 外面套一层 React 的 `cache()`：详情页的 `generateMetadata` 与页面组件**各查一次**，
 * 同一个请求里这两次是完全相同的查询，去重后只打一次库。本站因为「每请求重复的库
 * 工作」被 Vercel 打穿过额度（memory: vercel-quota-paused-root-cause），
 * 这类重复不值得留。
 */
export const getGamebananaModById = cache(
  async (gbId: number): Promise<GamebananaModDetail | null> => {
    if (!Number.isInteger(gbId) || gbId <= 0) return null;

    try {
      return await getCachedGamebananaModById(gbId);
    } catch (err) {
      // 详情页同样要走快照兜底，否则网关被锁时列表有卡片、点进去却全是 404
      // （与 mods-domain 的 getPublicModBaseById 同一个理由）。
      // 抽屉是同一个口，所以这条路也一并覆盖了。
      logger.warn(`[gamebanana] 读详情 #${gbId} 失败，回退到兜底快照`, { error: err });

      const row = (await getGamebananaSnapshotRows()).find((r) => r.gb_id === gbId);
      return row ? mapGamebananaModDetail(row as never) : null;
    }
  },
);
