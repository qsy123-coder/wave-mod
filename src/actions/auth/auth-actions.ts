"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient, ensureProfile, isAdminUser } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getServerSupabaseEnv } from "@/lib/supabase/server-config";

type AuthActionState = {
  debug: string;
  error: string;
  success: string;
};

type SignInMode = "admin" | "user";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signInWithMagicLink(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/admin/upload");
  const mode = String(formData.get("mode") ?? "admin") as SignInMode;
  const env = getServerSupabaseEnv();

  if (!env) {
    logger.error("[auth] signInWithMagicLink missing env", {
      adminEmail: process.env.ADMIN_EMAIL,
      anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });

    return {
      debug: "missing_env",
      error: "Supabase 环境变量未配置完整，请先检查 .env.local。",
      success: "",
    };
  }

  if (!email) {
    return {
      debug: "missing_email",
      error: "请输入邮箱地址。",
      success: "",
    };
  }

  if (mode === "admin" && env.adminEmail && email !== env.adminEmail) {
    return {
      debug: `unauthorized_email:${email}`,
      error: "该邮箱未被授权为管理员。",
      success: "",
    };
  }

  const supabase = await createClient();
  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? getBaseUrl();
  const redirectTo = new URL("/auth/callback", origin);
  redirectTo.searchParams.set("next", next);
  redirectTo.searchParams.set("mode", mode);

  logger.info("[auth] signInWithMagicLink start", {
    adminEmail: env.adminEmail,
    email,
    mode,
    next,
    origin,
    redirectTo: redirectTo.toString(),
  });

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo.toString(),
    },
  });

  if (error) {
    logger.error("[auth] signInWithMagicLink failed", {
      code: error.code,
      message: error.message,
      name: error.name,
      status: error.status,
    });

    return {
      debug: `otp_error:${error.code ?? "unknown"}:${error.message}`,
      error: error.message,
      success: "",
    };
  }

  logger.info("[auth] signInWithMagicLink success", {
    email,
    hasSession: Boolean(data.session),
    hasUser: Boolean(data.user),
  });

  return {
    debug: `otp_success:${email}:${redirectTo.toString()}`,
    error: "",
    success: "邮箱验证码登录邮件已发送，请前往邮箱查收。",
  };
}

export async function signOutUser(next = "/") {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(next);
}

export async function signOutAdmin() {
  const env = getServerSupabaseEnv();

  if (!env) {
    redirect("/");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requireAuthUser(next = "/favorites") {
  const env = getServerSupabaseEnv();

  if (!env) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}&error=missing_env&mode=user`);
  }

  const user = await ensureProfile();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}&mode=user`);
  }

  return user;
}

export async function requireAdminUser(next = "/admin/upload") {
  const env = getServerSupabaseEnv();

  if (!env) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}&error=missing_env`);
  }

  const authed = await isAdminUser();

  if (!authed) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }
}
