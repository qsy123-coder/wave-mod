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

type PhoneAuthActionState = AuthActionState & {
  phone: string;
};

type SignInMode = "admin" | "user";

function getWechatAuthBridgeUrl() {
  return process.env.WECHAT_AUTH_BRIDGE_URL?.trim() || "";
}

function isPhoneOtpEnabled() {
  return process.env.ENABLE_SUPABASE_PHONE_OTP === "true";
}

function normalizeChinaPhone(rawPhone: string) {
  const compact = rawPhone.replace(/[\s-]/g, "").trim();

  if (/^1\d{10}$/.test(compact)) {
    return `+86${compact}`;
  }

  if (/^\+86(?:1\d{10})$/.test(compact)) {
    return compact;
  }

  return "";
}

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

export async function sendPhoneOtp(_prevState: PhoneAuthActionState, formData: FormData): Promise<PhoneAuthActionState> {
  const phone = normalizeChinaPhone(String(formData.get("phone") ?? ""));
  const env = getServerSupabaseEnv();

  if (!env) {
    logger.error("[auth] sendPhoneOtp missing env", {
      anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });

    return {
      debug: "missing_env",
      error: "Supabase 环境变量未配置完整，请先检查 .env.local。",
      phone: "",
      success: "",
    };
  }

  if (!phone) {
    return {
      debug: "invalid_phone",
      error: "请输入中国大陆手机号，支持 11 位手机号或 +86 格式。",
      phone: "",
      success: "",
    };
  }

  if (!isPhoneOtpEnabled()) {
    return {
      debug: "phone_otp_disabled",
      error: "手机号验证码登录尚未启用：请先配置 Supabase Phone OTP、短信服务商、短信模板和防刷策略。",
      phone,
      success: "",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    logger.error("[auth] sendPhoneOtp failed", {
      code: error.code,
      message: error.message,
      name: error.name,
      status: error.status,
    });

    return {
      debug: `phone_otp_error:${error.code ?? "unknown"}:${error.message}`,
      error: error.message,
      phone,
      success: "",
    };
  }

  logger.info("[auth] sendPhoneOtp success", { phone });

  return {
    debug: `phone_otp_success:${phone}`,
    error: "",
    phone,
    success: "短信验证码已发送，请在 60 秒内查看手机短信。",
  };
}

export async function verifyPhoneOtp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const phone = normalizeChinaPhone(String(formData.get("phone") ?? ""));
  const token = String(formData.get("token") ?? "").replace(/\s/g, "").trim();
  const env = getServerSupabaseEnv();

  if (!env) {
    return {
      debug: "missing_env",
      error: "Supabase 环境变量未配置完整，请先检查 .env.local。",
      success: "",
    };
  }

  if (!phone) {
    return {
      debug: "invalid_phone",
      error: "请输入中国大陆手机号，支持 11 位手机号或 +86 格式。",
      success: "",
    };
  }

  if (!/^\d{6}$/.test(token)) {
    return {
      debug: "invalid_phone_token",
      error: "请输入 6 位短信验证码。",
      success: "",
    };
  }

  if (!isPhoneOtpEnabled()) {
    return {
      debug: "phone_otp_disabled",
      error: "手机号验证码登录尚未启用：请先配置 Supabase Phone OTP、短信服务商、短信模板和防刷策略。",
      success: "",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (error) {
    logger.error("[auth] verifyPhoneOtp failed", {
      code: error.code,
      message: error.message,
      name: error.name,
      status: error.status,
    });

    return {
      debug: `phone_verify_error:${error.code ?? "unknown"}:${error.message}`,
      error: error.message,
      success: "",
    };
  }

  await ensureProfile();
  redirect("/favorites");
}

export async function signInWithWechat(formData: FormData) {
  const next = String(formData.get("next") ?? "/favorites");
  const mode = String(formData.get("mode") ?? "user") as SignInMode;
  const bridgeUrl = getWechatAuthBridgeUrl();

  if (!bridgeUrl) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}&mode=${mode}&error=wechat_not_configured`);
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? getBaseUrl();
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", next);
  callbackUrl.searchParams.set("mode", mode);

  const authUrl = new URL(bridgeUrl);
  authUrl.searchParams.set("next", next);
  authUrl.searchParams.set("mode", mode);
  authUrl.searchParams.set("callback_url", callbackUrl.toString());

  logger.info("[auth] signInWithWechat bridge redirect", {
    mode,
    next,
    bridgeOrigin: authUrl.origin,
    hasBridgeUrl: Boolean(bridgeUrl),
  });

  redirect(authUrl.toString());
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
