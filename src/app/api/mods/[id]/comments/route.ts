import { NextRequest, NextResponse } from "next/server";

import { getModCommentsPage } from "@/lib/mods";
import { parseModCommentSort } from "@/lib/mods-domain/comments";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("limit") ?? searchParams.get("pageSize") ?? "10");
  const sort = parseModCommentSort(searchParams.get("sort"));

  const result = await getModCommentsPage(id, page, pageSize, sort);
  return NextResponse.json(result);
}
