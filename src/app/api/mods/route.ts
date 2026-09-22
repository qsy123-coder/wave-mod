import { NextRequest, NextResponse } from "next/server";

import { getPublicModsPage, parseCharacterFilter, parseModFlag, parseModQuery, parseModSort } from "@/lib/mods";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "12");
  const character = parseCharacterFilter(searchParams.get("character") ?? undefined);
  // 无限滚动翻页必须带上这两个开关，否则第二页会把筛选丢回「全部」
  const direct = parseModFlag(searchParams.get("direct") ?? undefined);
  const preview = parseModFlag(searchParams.get("preview") ?? undefined);
  const gameKey = searchParams.get("gameKey") ?? undefined;
  const query = parseModQuery(searchParams.get("query") ?? undefined);
  const sort = parseModSort(searchParams.get("sort") ?? undefined);

  const result = await getPublicModsPage(page, pageSize, {
    character,
    direct,
    gameKey,
    preview,
    query,
    sort,
  });

  return NextResponse.json(result);
}
