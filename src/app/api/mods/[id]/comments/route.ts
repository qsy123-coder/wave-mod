import { NextRequest, NextResponse } from "next/server";

import { getModCommentsPage } from "@/lib/mods";
import { parseModCommentSort } from "@/lib/mods-domain/comments";
import { resolveCommentsHttpStatus } from "@/lib/mods-domain/comments-status";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * ⚠️ 与 `/api/mods/[id]` 同理：这里 `getCurrentUser()` 读认证 cookie，并把 `user?.id`
 * 传给 `getModCommentsPage`（决定每条评论的「我点过赞吗」）。所以是 per-user 响应，
 * 必须 `private, no-store`，绝不能带 `s-maxage`。
 */
export const dynamic = "force-dynamic";

const NO_STORE = "private, no-store, max-age=0";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("limit") ?? searchParams.get("pageSize") ?? "10");
  const sort = parseModCommentSort(searchParams.get("sort"));
  const user = await getCurrentUser();

  const result = await getModCommentsPage(id, page, pageSize, sort, user?.id ?? null);
  // 取不到数据时回 503。回 200 + 空数组会让前端把「服务不可用」当成「没有评论」。
  // 503 也带 no-store：否则一次网关抖动会被缓存住，评论区要等 TTL 才恢复。
  return NextResponse.json(result, {
    status: resolveCommentsHttpStatus(result),
    headers: { "Cache-Control": NO_STORE },
  });
}
