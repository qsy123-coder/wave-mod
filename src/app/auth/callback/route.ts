import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSupabaseEnv, isAdminIdentity } from "@/lib/supabase/server-config";
import type { Database } from "@/types/supabase";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin/upload";
  }

  return value;
}

async function upsertProfileForUser(user: User) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法自动补齐 profiles 记录。");
  }

  const email = user.email?.trim().toLowerCase() ?? null;
  const phone = user.phone?.trim() || null;
  const role = isAdminIdentity(user) ? "admin" : "user";
  const displayName =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    (email ? email.split("@")[0] : null);
  const avatarUrl = user.user_metadata?.avatar_url ?? null;

  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      id: user.id,
      email,
      phone,
      role,
      display_name: displayName,
      avatar_url: avatarUrl,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`自动补齐 profiles 记录失败：${error.message}`);
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const mode = requestUrl.searchParams.get("mode") === "user" ? "user" : "admin";
  const loginUrl = new URL("/auth/login", requestUrl.origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("mode", mode);
  const env = getServerSupabaseEnv();

  if (!env) {
    loginUrl.searchParams.set("error", "missing_env");
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    logger.warn("[auth] callback missing code", {
      next,
      mode,
      search: requestUrl.search,
    });

    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const cookiesToSet: Parameters<NextResponse["cookies"]["set"]>[] = [];
  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(newCookies) {
        newCookies.forEach(({ name, value, options }) => {
          cookiesToSet.push([name, value, options]);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn("[auth] callback exchange failed", {
      code: error.code,
      message: error.message,
      name: error.name,
      status: error.status,
    });

    loginUrl.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    logger.warn("[auth] callback get user failed", {
      message: userError?.message,
      mode,
      next,
    });

    loginUrl.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  try {
    await upsertProfileForUser(user);
  } catch (profileError) {
    logger.warn("[auth] callback profile upsert failed", {
      message: profileError instanceof Error ? profileError.message : String(profileError),
      userId: user.id,
    });
  }

  if (mode === "admin" && !isAdminIdentity(user, env)) {
    await supabase.auth.signOut();
    loginUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  cookiesToSet.forEach((cookie) => response.cookies.set(...cookie));

  return response;
}

