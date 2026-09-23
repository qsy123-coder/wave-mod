import { defaultGameKey } from "@/config/games";
import { getDailyUpdates } from "@/lib/mods";

// 每日更新页数据：按天分组最近 N 天的公开 mod。客户端/页面都从这里取数。
export const dynamic = "force-dynamic";

/**
 * CDN 缓存时长（秒）。
 *
 * 本路由是「每日更新」弹窗的热路径（DailyUpdateDialog 每次页面加载都拉 ?days=1），
 * 但返回的全是公开、与登录态无关的数据，且每天只被上传脚本改一次。此前没有
 * Cache-Control，于是每次弹窗都打回函数重跑一遍 getDailyUpdates（含跨洋 Supabase），
 * 累计的 Fast Origin Transfer 额度只有 10 GB，是最先被打穿的一条（2026-09-23 事故）。
 *
 * 加 s-maxage 后由 CDN 承担重复请求，origin 至多每 5 分钟重算一次。
 * stale-while-revalidate 让过期后的第一个请求立即返回旧值、后台回填，避免排队。
 *
 * 代价是管理后台改完数据后，本路由最多滞后 5 分钟。上传脚本的 revalidate ping
 * 清的是 Next 的 Data Cache，管不到 CDN 这一层，所以这个窗口是硬上限。
 */
const CDN_CACHE_SECONDS = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameKey = searchParams.get("game") ?? defaultGameKey;
  const rawDays = Number(searchParams.get("days") ?? 14);

  const result = await getDailyUpdates(Number.isFinite(rawDays) ? rawDays : 14, gameKey);

  return Response.json(result, {
    headers: {
      "Cache-Control": `public, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=3600`,
    },
  });
}
