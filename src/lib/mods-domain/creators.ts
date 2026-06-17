import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { logger } from "@/lib/logger";
import { mapMod, publicModColumns } from "@/lib/mods-domain/mappers";
import type { SiteMod } from "@/lib/mods-domain/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicReadClient } from "@/lib/supabase/server";

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

    // 查 profiles 获取展示名和头像（admin client 绕过 RLS）
    const supabaseAdmin = createAdminClient();
    const profileQuery = supabaseAdmin ?? supabase;
    const { data: profiles } = await profileQuery
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

/** 查询核心逻辑（无缓存），供需要实时数据的场景使用 */
async function fetchCreatorProfile(
  userId: string,
  gameKey: string,
): Promise<CreatorProfile | null> {
  // profiles 表有 RLS，public anon key 读不了 → 用 admin client
  const supabaseAdmin = createAdminClient();
  const supabase = createPublicReadClient();

  // mods 用 public client，profiles 用 admin client（绕过 RLS）
  const [profileRes, modsRes] = await Promise.all([
    supabaseAdmin
      ? supabaseAdmin
          .from("profiles")
          .select("id, display_name, avatar_url, bio, created_at")
          .eq("id", userId)
          .single()
      : supabase
          .from("profiles")
          .select("id, display_name, avatar_url, bio, created_at")
          .eq("id", userId)
          .single(),
    supabase
      .from("mods")
      .select(publicModColumns)
      .eq("created_by", userId)
      .eq("game_key", gameKey)
      .eq("is_published", true)
      .order("created_at", { ascending: false }),
  ]);

  if (profileRes.error || !profileRes.data) {
    logger.warn("[creators] fetchCreatorProfile profile not found", {
      userId,
      gameKey,
      error: profileRes.error ? JSON.stringify(profileRes.error) : "no data",
    });
    return null;
  }

  const profile = profileRes.data;
  const modRows = modsRes.data ?? [];
  const mods = modRows.map((row) => mapMod(row as Parameters<typeof mapMod>[0]));

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
  "use cache";
  cacheTag(`creator:profile:${userId}`);
  cacheTag(`creator:profile:${userId}:${gameKey}`);
  cacheLife("hours");

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
