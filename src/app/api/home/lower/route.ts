import { getDefaultGame } from "@/config/games";
import {
  getAvailableCharacters,
  getDailyUpdates,
  getFeaturedMods,
  getLatestMods,
  getPublicMods,
  getTopCreators,
} from "@/lib/mods";

// 首页第二屏数据：不进首屏 SSR，改为滚动到该屏时由客户端拉取，加快首屏加载。
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameKey = searchParams.get("game") ?? getDefaultGame().key;

  const [featuredMods, latestMods, topCreators, characters, allMods, today] = await Promise.all([
    getFeaturedMods(6, gameKey),
    getLatestMods(4, gameKey),
    getTopCreators(6, gameKey),
    getAvailableCharacters(gameKey),
    getPublicMods(undefined, { gameKey }),
    getDailyUpdates(1, gameKey),
  ]);

  // 今日更新的 mod（首页第二屏"今日更新的 mod"卡片用）
  const todayMods = today.days?.[0]?.mods ?? [];

  const totalMods = allMods.length;
  const avgRating =
    totalMods > 0
      ? (allMods.reduce((s, m) => s + m.ratingAverage, 0) / totalMods).toFixed(1)
      : "0.0";

  // 按角色计数（供热门分类卡片显示），避免把全量 mod 列表下发给客户端
  const characterCounts: Record<string, number> = {};
  for (const m of allMods) {
    const c = m.character;
    if (c) characterCounts[c] = (characterCounts[c] ?? 0) + 1;
  }

  return Response.json({
    featuredMods,
    latestMods,
    todayMods,
    topCreators,
    characters,
    totalMods,
    avgRating,
    characterCounts,
  });
}
