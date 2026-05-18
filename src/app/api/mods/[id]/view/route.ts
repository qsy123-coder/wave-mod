import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

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
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "missing_admin_client" }, { status: 500 });
  }

  const { data: mod, error: readError } = await supabaseAdmin
    .from("mods")
    .select("id, views")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }

  if (!mod) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("mods")
    .update({ views: (mod.views ?? 0) + 1 })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
