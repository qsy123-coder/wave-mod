import { NextRequest, NextResponse } from "next/server";

import { getModCommentsPage } from "@/lib/mods";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

  const result = await getModCommentsPage(id, page, pageSize);
  return NextResponse.json(result);
}
