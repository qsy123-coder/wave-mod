import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { getServerSupabaseEnv } from "@/lib/supabase/server-config";

function isAllowedAdmin(email: string | undefined, adminEmail: string | null) {
  return Boolean(email && adminEmail && email === adminEmail);
}

export async function proxy(request: NextRequest) {
  const env = getServerSupabaseEnv();

  if (!env) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    loginUrl.searchParams.set("error", "missing_env");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedAdmin(user?.email, env.adminEmail)) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
