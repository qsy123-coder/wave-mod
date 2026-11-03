import { NextRequest, NextResponse } from "next/server";

import { getPublicModsPage, parseCharacterFilter, parseModFlag, parseModQuery, parseModSort } from "@/lib/mods";
import { MODS_MAX_PAGE_SIZE } from "@/lib/mods-domain/filter-params";

/**
 * 列表分页接口。匿名可访问，因此每个入参都必须当成**敌意输入**看待。
 *
 * `dynamic` 显式写出来：这个路由读的是请求上的 query string，本来就不可能静态化，
 * 写出来是为了防止以后有人在上面加 `revalidate` 之类的配置时静默改变语义。
 */
export const dynamic = "force-dynamic";

/**
 * 把 query string 上的整数钳到合法范围。
 *
 * 不能只靠 `Number()`：`?page=abc` 会得到 NaN（切片变成空数组，前端以为「翻到底了」），
 * 而 `?pageSize=999999` 更糟 —— 它会把整表（约 6MB）渲染一遍吐给调用方，等于给匿名
 * 访客开了一个免费的整站导出接口。Vercel 的 Fast Origin Transfer 额度就是这么被
 * 打穿的，所以上限在这里和 paginateMods 里各钳一次。
 *
 * ⚠️ 必须先挡掉 null / 空串，不能直接丢给 `Number()`：`Number(null)` 和 `Number("")`
 * 都是 **0（有限数，不是 NaN）**，会被当成「用户要 0 条」而钳成 1 —— 参数缺省时
 * 接口就只回 1 条了。改写成 `?? "12"` 时代的等价语义：缺省/空 → fallback。
 */
function clampInt(raw: string | null, fallback: number, max: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = clampInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInt(searchParams.get("pageSize"), 12, MODS_MAX_PAGE_SIZE);
  const character = parseCharacterFilter(searchParams.get("character") ?? undefined);
  // 无限滚动翻页必须带上这两个开关，否则第二页会把筛选丢回「全部」
  const direct = parseModFlag(searchParams.get("direct") ?? undefined);
  const preview = parseModFlag(searchParams.get("preview") ?? undefined);
  const gameKey = searchParams.get("gameKey") ?? undefined;
  const query = parseModQuery(searchParams.get("query") ?? undefined);
  const sort = parseModSort(searchParams.get("sort") ?? undefined);

  const result = await getPublicModsPage(
    page,
    pageSize,
    {
      character,
      direct,
      gameKey,
      preview,
      query,
      sort,
    },
    // 多关键词严格取交集一个都没中时，放宽成「命中任一关键词」并按命中数排序。
    //
    // 只有这条路径打开：/mods 的无限网格会读响应里的 `relaxed` 渲染「没有精确匹配」
    // 的提示条，所以放宽是**可见**的。分站、ZZZ、后台走各自的服务端渲染，一律保持
    // 严格 AND —— 结果悄悄变多却没人解释，比搜不到更让人困惑。
    { relaxQuery: true },
  );

  /**
   * 分级 CDN 缓存。
   *
   * 这份响应里**没有任何 per-user 状态**（就是公开的 mod 列表与计数），所以可以 public。
   * 这也正是它和 `/api/mods/[id]`（会合并当前用户的收藏/点赞状态，必须 private,
   * no-store）的区别 —— 两者不要互相抄。
   *
   * 带 `query=` 的请求给更短的 TTL：搜索词是长尾且随机的，让它跟浏览型请求共用
   * 30 分钟会把缓存撑爆，而且搜索结果变化的敏感度更高。
   *
   * 浏览型 300 → 1800（2026-11-03）：真正扛流量的是香港反代那一层
   * （deploy/hk-proxy/nginx/wavemod-proxy.conf.template 的 `location = /api/mods`，
   * 已经缓存 6 小时），这里只是**绕过反代直连 Vercel** 时的兜底。放到 30 分钟
   * 不会让计数更旧 —— 应用层的结果缓存（public.ts 的 CACHE_REVALIDATE_SECONDS）
   * 本来就是 6 小时，这一层之前反而比它短得多。
   *
   * 站点跑在灰云域名上，浏览器不认 `s-maxage`（那是给共享缓存看的），
   * 所以这里只影响中间缓存，不影响任何访客看到的数据新鲜度。
   */
  const maxAge = query ? 60 : 1800;
  const cacheControl = `public, s-maxage=${maxAge}, stale-while-revalidate=3600`;

  return NextResponse.json(result, {
    headers: { "Cache-Control": cacheControl },
  });
}
