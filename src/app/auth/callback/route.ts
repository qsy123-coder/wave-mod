import { NextResponse } from "next/server";

import { getServerSupabaseEnv } from "@/lib/supabase/server-config";
import { createClient, ensureProfile, isAdminUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/admin/upload";
  const mode = requestUrl.searchParams.get("mode") === "user" ? "user" : "admin";
  const loginUrl = new URL("/auth/login", requestUrl.origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("mode", mode);

  if (!getServerSupabaseEnv()) {
    loginUrl.searchParams.set("error", "missing_env");
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    loginUrl.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  if (mode === "admin") {
    const admin = await isAdminUser();

    if (!admin) {
      await supabase.auth.signOut();
      loginUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(loginUrl);
    }
  } else {
    const user = await ensureProfile();

    if (!user) {
      await supabase.auth.signOut();
      loginUrl.searchParams.set("error", "exchange_failed");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
