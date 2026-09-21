import { NextRequest, NextResponse } from "next/server";

import { getModCommentsPage } from "@/lib/mods";
import { parseModCommentSort } from "@/lib/mods-domain/comments";
import { resolveCommentsHttpStatus } from "@/lib/mods-domain/comments-status";
import { getCurrentUser } from "@/lib/supabase/server";

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
  return NextResponse.json(result, { status: resolveCommentsHttpStatus(result) });
}
