import { defaultGameKey } from "@/config/games";
import { getDailyUpdates } from "@/lib/mods";

// 每日更新页数据：按天分组最近 N 天的公开 mod。客户端/页面都从这里取数。
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameKey = searchParams.get("game") ?? defaultGameKey;
  const rawDays = Number(searchParams.get("days") ?? 14);

  const result = await getDailyUpdates(Number.isFinite(rawDays) ? rawDays : 14, gameKey);

  return Response.json(result);
}
