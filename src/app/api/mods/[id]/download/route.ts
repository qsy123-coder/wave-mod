import { NextResponse } from "next/server";

import { execute, queryOne } from "@/lib/db/query";

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  const { id } = await params;

  try {
    const mod = await queryOne<{ id: string; download_url: string | null }>(
      `select id, download_url
         from public.mods
        where id = $1
          and is_published = true`,
      [id],
    );

    if (!mod) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    if (!mod.download_url) {
      return NextResponse.json({ ok: false, error: "missing_download_url" }, { status: 400 });
    }

    await execute("update public.mods set downloads_count = downloads_count + 1 where id = $1", [id]);

    return NextResponse.json({ ok: true, downloadUrl: mod.download_url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
