import { NextRequest, NextResponse } from "next/server";

import { getPublicModBaseById } from "@/lib/mods";

/**
 * 详情抽屉的数据源。
 *
 * 这里**只返回公开数据**，不合并 per-user 状态：
 *   - 点赞入口已下线；
 *   - 收藏按钮在 `favorite-button.tsx` 里改走互动 store（设备号去重），
 *     `isFavorited` / `isLoggedIn` 两个 prop 已是 @deprecated 的摆设。
 * 所以这份响应可以安全地被共享缓存存放，也是详情页首开慢的解法之一：
 * 香港反代对 `/api/mods/<uuid>` 缓存 5 分钟，绝大多数打开不再打到 Vercel 函数。
 *
 * 2026-10-24 之前这里调的是 `getPublicModById`（多查一次 favorites/ratings/likes），
 * 且声明 `private, no-store` —— 每次打开详情都要走一次冷启动 + 3 条 Supabase 查询。
 *
 * 显式写 `dynamic` 只是保留「不预渲染」的语义；缓存由响应头与反代决定。
 */
export const dynamic = "force-dynamic";

const PUBLIC_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";
const NO_STORE = "private, no-store, max-age=0";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const mod = await getPublicModBaseById(id);

  if (!mod) {
    // 404 也带 no-store：网关抖动时可能短暂回 not_found，被缓存住会让这个 mod
    // 在缓存 TTL 内一直「不存在」。
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": NO_STORE } });
  }

  return NextResponse.json(mod, { headers: { "Cache-Control": PUBLIC_CACHE } });
}
