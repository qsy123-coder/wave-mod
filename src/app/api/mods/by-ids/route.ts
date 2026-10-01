import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPublicModsByIds } from "@/lib/mods";

/**
 * 按 id 批量取卡片数据，给「我的收藏」用（收藏页只拿到一串 id，要自己补齐内容）。
 *
 * 放在 `/api/mods/by-ids` 而不是 `/api/mods/[id]` 的某种变体：静态段优先于动态段，
 * 两者不会打架，而 `by-ids` 也不是合法 UUID，不会被误当成某个 mod 的 id。
 *
 * 响应里**没有任何 per-user 状态**（就是公开的 mod 数据），所以可以走公开缓存；
 * 这一点和 `/api/mods/[id]`（合并了当前用户的点赞/收藏态，必须 private）不同。
 */
export const dynamic = "force-dynamic";

const MAX_IDS = 60;

const idsSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
  .refine((ids) => ids.length > 0, "至少需要一个 MOD ID")
  .refine((ids) => ids.length <= MAX_IDS, `单次最多查询 ${MAX_IDS} 个 MOD ID`)
  .refine((ids) => ids.every((id) => z.uuid().safeParse(id).success), "存在无效的 MOD ID");

export async function GET(request: NextRequest) {
  const parsed = idsSchema.safeParse(request.nextUrl.searchParams.get("ids") ?? "");

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数无效。" },
      { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const mods = await getPublicModsByIds(parsed.data);

  return NextResponse.json(
    { mods },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
  );
}
