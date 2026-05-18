import { NextRequest, NextResponse } from "next/server";

import { getPublicModsPage, parseCharacterFilter, parseModQuery, parseModSort } from "@/lib/mods";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "12");
  const character = parseCharacterFilter(searchParams.get("character") ?? undefined);
  const query = parseModQuery(searchParams.get("query") ?? undefined);
  const sort = parseModSort(searchParams.get("sort") ?? undefined);

  const result = await getPublicModsPage(page, pageSize, {
    character,
    query,
    sort,
  });

  return NextResponse.json(result);
}
