import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { logger } from "@/lib/logger";
import { createPublicReadClient } from "@/lib/supabase/server";

export type TopCreator = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  modCount: number;
  totalDownloads: number;
};

/** 按总下载量排名聚合创作者，缓存数小时 */
export async function getTopCreators(
  limit: number,
  gameKey: string,
): Promise<TopCreator[]> {
  "use cache";
  cacheTag("creators:ranking");
  cacheTag(`creators:ranking:${gameKey}`);
  cacheLife("hours");

  try {
    const supabase = createPublicReadClient();

    // 获取该游戏所有已发布 MOD 的 creator 和下载量
    const { data: mods, error } = await supabase
      .from("mods")
      .select("created_by, downloads_count")
      .eq("is_published", true)
      .eq("game_key", gameKey)
      .not("created_by", "is", null);

    if (error || !mods?.length) {
      if (error) {
        logger.warn("[creators] getTopCreators mods query failed", {
          error: error.message,
        });
      }
      return [];
    }

    // 按 created_by 聚合：MOD 数量 + 总下载量
    const creatorMap = new Map<
      string,
      { modCount: number; totalDownloads: number }
    >();
    for (const mod of mods) {
      const userId = mod.created_by;
      if (!userId) continue;
      const existing = creatorMap.get(userId) ?? {
        modCount: 0,
        totalDownloads: 0,
      };
      existing.modCount++;
      existing.totalDownloads += mod.downloads_count ?? 0;
      creatorMap.set(userId, existing);
    }

    // 按总下载量降序，取 Top N
    const topCreatorIds = [...creatorMap.entries()]
      .sort((a, b) => b[1].totalDownloads - a[1].totalDownloads)
      .slice(0, limit)
      .map(([id]) => id);

    if (topCreatorIds.length === 0) return [];

    // 查 profiles 获取展示名和头像
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", topCreatorIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

    // 按排名顺序组装结果
    return topCreatorIds.map((id) => {
      const stats = creatorMap.get(id)!;
      const profile = profileMap.get(id);
      return {
        userId: id,
        displayName: profile?.display_name?.trim() || "匿名创作者",
        avatarUrl: profile?.avatar_url ?? null,
        modCount: stats.modCount,
        totalDownloads: stats.totalDownloads,
      };
    });
  } catch (error) {
    logger.warn("[creators] getTopCreators failed, fallback to empty", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}
