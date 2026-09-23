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

/**
 * CDN 缓存时长（秒）。
 *
 * 本路由是整站单次开销最大的公开读：`getPublicMods(undefined)` 会把全表
 * （当前 5285 行）整个 mapMod 一遍再算 totalMods / avgRating / characterCounts，
 * 外加 getFeaturedMods / getTopCreators / getAvailableCharacters / getDailyUpdates。
 * 此前没有 Cache-Control，于是每个访客滚到第二屏就触发一次全量重算 ——
 * 既烧 Fluid Active CPU，又让响应体全部从 origin 出（Fast Origin Transfer 额度仅 10 GB，
 * 2026-09-23 因此整站被暂停）。
 *
 * 返回值全是聚合量，与登录态无关，可以安全公开缓存。5 分钟滞后对「今日更新」「热门分类」
 * 这类内容完全够用；stale-while-revalidate 保证过期瞬间不排队。
 */
const CDN_CACHE_SECONDS = 300;

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

  return Response.json(
    {
      featuredMods,
      latestMods,
      todayMods,
      topCreators,
      characters,
      totalMods,
      avgRating,
      characterCounts,
    },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=3600`,
      },
    },
  );
}
