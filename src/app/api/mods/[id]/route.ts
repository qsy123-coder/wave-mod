import { NextRequest, NextResponse } from "next/server";

import { getPublicModById } from "@/lib/mods";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const mod = await getPublicModById(id);

  if (!mod) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(mod);
}
