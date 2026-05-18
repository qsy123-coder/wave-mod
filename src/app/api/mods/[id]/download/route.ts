import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "missing_admin_client" }, { status: 500 });
  }

  const { data: mod, error: readError } = await supabaseAdmin
    .from("mods")
    .select("id, download_url, downloads_count")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }

  if (!mod) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (!mod.download_url) {
    return NextResponse.json({ ok: false, error: "missing_download_url" }, { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("mods")
    .update({ downloads_count: (mod.downloads_count ?? 0) + 1 })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, downloadUrl: mod.download_url });
}
