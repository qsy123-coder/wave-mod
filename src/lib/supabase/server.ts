import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getServerSupabaseEnv, isAdminIdentity } from "@/lib/supabase/server-config";
import type { Database } from "@/types/supabase";

export function createPublicReadClient() {
  const env = getServerSupabaseEnv();

  if (!env) {
    throw new Error("Supabase 环境变量未配置完整，请检查 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。");
  }

  return createSupabaseClient<Database>(env.url, env.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function createClient() {
  const env = getServerSupabaseEnv();

  if (!env) {
    throw new Error("Supabase 环境变量未配置完整，请检查 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components 中读取场景允许跳过写 cookie。
        }
      },
    },
  });
}

export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user;
  } catch (error) {
    logger.warn("[auth] getCurrentUser fallback to null", { error: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}

export async function ensureProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法自动补齐 profiles 记录。");
  }

  const email = user.email?.trim().toLowerCase() ?? null;
  const phone = user.phone?.trim() || null;
  const env = getServerSupabaseEnv();
  const role = isAdminIdentity(user, env) ? "admin" : "user";
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

  return user;
}

export async function isAdminUser() {
  const user = await getCurrentUser();

  return isAdminIdentity(user);
}
