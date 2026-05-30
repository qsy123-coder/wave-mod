import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServerSupabaseEnv, isAdminIdentity } from "@/lib/supabase/server-config";
import type { Database } from "@/types/supabase";

export function getSafeAuthNextPath(value: string | null, fallback = "/admin/upload") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export async function upsertProfileForAuthUser(user: User) {
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

export function createRouteSupabaseClient(request: NextRequest) {
  const env = getServerSupabaseEnv();
  const cookiesToSet: Parameters<NextResponse["cookies"]["set"]>[] = [];

  if (!env) {
    return {
      cookiesToSet,
      env: null,
      supabase: null,
    };
  }

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

  return {
    cookiesToSet,
    env,
    supabase,
  };
}

export function applyAuthCookies(response: NextResponse, cookiesToSet: Parameters<NextResponse["cookies"]["set"]>[]) {
  cookiesToSet.forEach((cookie) => response.cookies.set(...cookie));
  return response;
}
