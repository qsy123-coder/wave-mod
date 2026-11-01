import { NextResponse } from "next/server";

import { queryOne } from "@/lib/db/query";

function shouldCountView(request: Request) {
  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";

  return !userAgent.includes("bot") && !userAgent.includes("spider") && !userAgent.includes("crawler");
}

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  if (!shouldCountView(request)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { id } = await params;

  try {
    // 一条原子自增，避免「先读后写」在并发下丢计数。
    const row = await queryOne<{ id: string }>(
      `update public.mods
          set views = views + 1
        where id = $1
          and is_published = true
        returning id`,
      [id],
    );

    if (!row) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
