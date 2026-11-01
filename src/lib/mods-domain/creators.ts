import "server-only";

import { queryOne, queryRows } from "@/lib/db/query";
import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { ModRow, SiteMod } from "@/lib/mods-domain/types";

export type TopCreator = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  modCount: number;
  totalDownloads: number;
};

export type CreatorProfile = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  stats: {
    modCount: number;
    totalDownloads: number;
    totalFavorites: number;
    totalLikes: number;
  };
  mods: SiteMod[];
};

/** 按总下载量排名聚合创作者，缓存数小时 */
export async function getTopCreators(
  limit: number,
  gameKey: string,
): Promise<TopCreator[]> {
  try {
    // 聚合、排序、取 Top N 都交给 SQL：原实现是「全量拉两份 → 内存聚合 → 再查一次 profiles」，
    // 现在一次 JOIN 完成。`limit` 放在 SQL 里，避免把全部创作者都传回应用再 slice。
    const rows = await queryRows<{
      user_id: string;
      mod_count: number;
      total_downloads: number;
      display_name: string | null;
      avatar_url: string | null;
    }>(
      `select m.created_by as user_id,
              count(*)::int as mod_count,
              coalesce(sum(m.downloads_count), 0)::int as total_downloads,
              p.display_name,
              p.avatar_url
         from public.mods m
         left join public.profiles p on p.id = m.created_by
        where m.is_published = true
          and m.game_key = $1
          and m.created_by is not null
        group by m.created_by, p.display_name, p.avatar_url
        order by total_downloads desc, m.created_by
        limit $2`,
      [gameKey, limit],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name?.trim() || "匿名创作者",
      avatarUrl: row.avatar_url ?? null,
      modCount: row.mod_count,
      totalDownloads: row.total_downloads,
    }));
  } catch (error) {
    logger.warn("[creators] getTopCreators failed, fallback to empty", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

/** 查询核心逻辑（无缓存），供需要实时数据的场景使用 */
async function fetchCreatorProfile(
  userId: string,
  gameKey: string,
): Promise<CreatorProfile | null> {
  // 自建库只有应用自己的连接角色，没有 RLS，也没有 anon/admin 之分。
  const [profile, modRows] = await Promise.all([
    queryOne<{
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      bio: string | null;
      created_at: string;
    }>(
      `select id, display_name, avatar_url, bio, created_at
         from public.profiles
        where id = $1`,
      [userId],
    ),
    queryRows<ModRow>(
      `select ${publicModColumns}
         from public.mods
        where created_by = $1
          and game_key = $2
          and is_published = true
        order by created_at desc`,
      [userId, gameKey],
    ),
  ]);

  if (!profile) {
    logger.warn("[creators] fetchCreatorProfile profile not found", { userId, gameKey });
    return null;
  }

  const mods = modRows.map(mapMod);

  // 聚合统计
  const stats = {
    modCount: mods.length,
    totalDownloads: mods.reduce((sum, m) => sum + m.downloads, 0),
    totalFavorites: mods.reduce((sum, m) => sum + m.favorites, 0),
    totalLikes: mods.reduce((sum, m) => sum + m.likes, 0),
  };

  return {
    userId: profile.id,
    displayName: profile.display_name?.trim() || "匿名创作者",
    avatarUrl: profile.avatar_url ?? null,
    bio: profile.bio?.trim() || null,
    createdAt: profile.created_at,
    stats,
    mods,
  };
}

/** 获取单个创作者的 Profile 页数据（缓存数小时，供公开访问使用） */
export async function getCreatorProfile(
  userId: string,
  gameKey: string,
): Promise<CreatorProfile | null> {
  try {
    return await fetchCreatorProfile(userId, gameKey);
  } catch (error) {
    logger.warn("[creators] getCreatorProfile failed", {
      userId,
      gameKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/** 获取创作者 Profile（无缓存），用于用户查看自己个人中心时保证数据实时 */
export async function getCreatorProfileUncached(
  userId: string,
  gameKey: string,
): Promise<CreatorProfile | null> {
  try {
    return await fetchCreatorProfile(userId, gameKey);
  } catch (error) {
    logger.warn("[creators] getCreatorProfileUncached failed", {
      userId,
      gameKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
