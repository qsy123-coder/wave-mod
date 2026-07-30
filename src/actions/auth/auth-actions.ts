"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { generateSecureBase64Url } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { sendAliyunDypnsVerifyCode, verifyAliyunDypnsCode } from "@/lib/sms/aliyun-dypns";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, ensureProfile, isAdminUser } from "@/lib/supabase/server";
import { getServerSupabaseEnv, isAdminIdentity } from "@/lib/supabase/server-config";

type AuthActionState = {
  debug: string;
  error: string;
  success: string;
};

type EmailAuthActionState = AuthActionState & {
  email: string;
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

function getPhoneOtpSetupError() {
  if (!isPhoneOtpEnabled()) {
    return "手机号验证码登录尚未启用：请先开启 ENABLE_SUPABASE_PHONE_OTP，并配置阿里云号码认证短信。";
  }

  const missing: string[] = [];
  const hasAliyunAccessKey = Boolean(
    (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) ||
      (process.env.ALIYUN_OSS_ACCESS_KEY_ID && process.env.ALIYUN_OSS_ACCESS_KEY_SECRET),
  );

  if (!hasAliyunAccessKey) {
    missing.push("ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  }

  if (!(process.env.ALIYUN_DYPNS_SIGN_NAME)) {
    missing.push("ALIYUN_DYPNS_SIGN_NAME");
  }

  if (!(process.env.ALIYUN_DYPNS_TEMPLATE_CODE)) {
    missing.push("ALIYUN_DYPNS_TEMPLATE_CODE");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    return `手机号验证码登录配置未完整：缺少 ${missing.join("、")}。`;
  }

  return "";
}

function normalizeChinaPhone(rawPhone: string) {
  const compact = rawPhone.replace(/[\s-]/g, "").trim();

  if (/^1\d{10}$/.test(compact)) {
    return compact;
  }

  if (/^\+86(?:1\d{10})$/.test(compact)) {
    return compact.slice(3);
  }

  return "";
}

function toSupabasePhone(phone: string) {
  return `86${phone}`;
}

function getSupabasePhoneVariants(phone: string) {
  return new Set([phone, `86${phone}`, `+86${phone}`]);
}

function createTemporaryPhonePassword() {
  return `${generateSecureBase64Url(24)}Aa1!`;
}

async function findPhoneUser(phone: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法查询手机号登录用户。");
  }

  const phoneVariants = getSupabasePhoneVariants(phone);
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const users = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (users.error) {
      throw new Error(`查询手机号用户失败：${users.error.message}`);
    }

    const existingUser = users.data.users.find((user) => user.phone && phoneVariants.has(user.phone));

    if (existingUser) {
      return existingUser;
    }

    if (users.data.users.length < perPage) {
      break;
    }
  }

  return null;
}

async function updatePhoneUserForPasswordLogin(userId: string, phone: string, password: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法更新手机号登录用户。");
  }

  const updated = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
    phone_confirm: true,
    user_metadata: {
      display_name: `手机用户 ${phone.slice(0, 3)}****${phone.slice(-4)}`,
      phone_login_provider: "aliyun_dypns",
    },
  });

  if (updated.error || !updated.data.user) {
    throw new Error(updated.error?.message || "手机号用户密码刷新失败。");
  }

  return updated.data.user;
}

async function persistSupabaseSession(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies();
  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  cookieStore.getAll();
}

async function upsertPhoneUserForPasswordLogin(phone: string, password: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法创建手机号登录用户。");
  }

  const existingUser = await findPhoneUser(phone);

  if (existingUser) {
    return updatePhoneUserForPasswordLogin(existingUser.id, phone, password);
  }

  const supabasePhone = toSupabasePhone(phone);
  const created = await supabaseAdmin.auth.admin.createUser({
    phone: supabasePhone,
    password,
    phone_confirm: true,
    user_metadata: {
      display_name: `手机用户 ${phone.slice(0, 3)}****${phone.slice(-4)}`,
      phone_login_provider: "aliyun_dypns",
    },
  });

  if (!created.error && created.data.user) {
    return created.data.user;
  }

  const duplicatedUser = await findPhoneUser(phone);

  if (duplicatedUser) {
    return updatePhoneUserForPasswordLogin(duplicatedUser.id, phone, password);
  }

  throw new Error(created.error?.message || "手机号用户创建失败，且未找到已有用户。");
}

function getBaseUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  const deploymentUrl = process.env.VERCEL_URL?.trim() || process.env.CF_PAGES_URL?.trim();

  if (deploymentUrl) {
    return deploymentUrl.startsWith("http") ? deploymentUrl : `https://${deploymentUrl}`;
  }

  return "http://localhost:3000";
}

function getRequestOrigin() {
  return getBaseUrl();
}

export async function signInWithMagicLink(_prevState: EmailAuthActionState, formData: FormData): Promise<EmailAuthActionState> {
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
      email,
      error: "Supabase 环境变量未配置完整，请先检查 .env.local。",
      success: "",
    };
  }

  if (!email) {
    return {
      debug: "missing_email",
      email,
      error: "请输入邮箱地址。",
      success: "",
    };
  }

  if (mode === "admin" && !isAdminIdentity({ email }, env)) {
    return {
      debug: `unauthorized_email:${email}`,
      email,
      error: "该邮箱未被授权为管理员。",
      success: "",
    };
  }

  const supabase = await createClient();
  const origin = getRequestOrigin();
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
      email,
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
    email,
    error: "",
    success: "邮箱验证码登录邮件已发送，请前往邮箱查收。",
  };
}

export async function verifyEmailOtp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "").trim();
  const next = String(formData.get("next") ?? "/favorites");
  const mode = String(formData.get("mode") ?? "user") as SignInMode;
  const env = getServerSupabaseEnv();

  if (!env) {
    return {
      debug: "missing_env",
      error: "Supabase 环境变量未配置完整，请先检查 .env.local。",
      success: "",
    };
  }

  if (!email) {
    return {
      debug: "missing_email",
      error: "请先输入邮箱地址并发送邮箱验证码。",
      success: "",
    };
  }

  if (!/^\d{6}$/.test(token)) {
    return {
      debug: "invalid_email_token",
      error: "请输入邮件中的 6 位邮箱验证码。",
      success: "",
    };
  }

  if (mode === "admin" && !isAdminIdentity({ email }, env)) {
    return {
      debug: `unauthorized_email:${email}`,
      error: "该邮箱未被授权为管理员。",
      success: "",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    logger.error("[auth] verifyEmailOtp failed", {
      code: error.code,
      email,
      message: error.message,
      name: error.name,
      status: error.status,
    });

    return {
      debug: `email_verify_error:${error.code ?? "unknown"}:${error.message}`,
      error: error.message,
      success: "",
    };
  }

  if (mode === "admin") {
    const admin = await isAdminUser();

    if (!admin) {
      await supabase.auth.signOut();
      return {
        debug: "unauthorized_admin",
        error: "该邮箱未被授权为管理员。",
        success: "",
      };
    }
  } else {
    await ensureProfile();
  }

  redirect(next);
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

  const phoneOtpSetupError = getPhoneOtpSetupError();

  if (phoneOtpSetupError) {
    return {
      debug: isPhoneOtpEnabled() ? "phone_otp_config_missing" : "phone_otp_disabled",
      error: phoneOtpSetupError,
      phone,
      success: "",
    };
  }

  try {
    const result = await sendAliyunDypnsVerifyCode(phone);

    logger.info("[auth] sendPhoneOtp via Aliyun Dypns success", {
      phone: toSupabasePhone(phone),
      bizId: result.bizId,
      requestId: result.requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "阿里云短信验证码发送失败。";

    logger.error("[auth] sendPhoneOtp via Aliyun Dypns failed", {
      message,
      phone: toSupabasePhone(phone),
    });

    return {
      debug: `phone_dypns_error:${message}`,
      error: message,
      phone,
      success: "",
    };
  }

  return {
    debug: `phone_dypns_success:${toSupabasePhone(phone)}`,
    error: "",
    phone,
    success: "短信验证码已发送，请在 60 秒内查看手机短信。",
  };
}

export async function verifyPhoneOtp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const phone = normalizeChinaPhone(String(formData.get("phone") ?? ""));
  const token = String(formData.get("token") ?? "").replace(/\s/g, "").trim();
  const mode = String(formData.get("mode") ?? "user") as SignInMode;
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

  if (!/^\d{4,8}$/.test(token)) {
    return {
      debug: "invalid_phone_token",
      error: "请输入短信验证码。",
      success: "",
    };
  }

  const phoneOtpSetupError = getPhoneOtpSetupError();

  if (phoneOtpSetupError) {
    return {
      debug: isPhoneOtpEnabled() ? "phone_otp_config_missing" : "phone_otp_disabled",
      error: phoneOtpSetupError,
      success: "",
    };
  }

  try {
    await verifyAliyunDypnsCode(phone, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "短信验证码校验失败。";

    logger.error("[auth] verifyPhoneOtp via Aliyun Dypns failed", {
      message,
      phone: toSupabasePhone(phone),
    });

    return {
      debug: `phone_dypns_verify_error:${message}`,
      error: message,
      success: "",
    };
  }

  const password = createTemporaryPhonePassword();

  try {
    await upsertPhoneUserForPasswordLogin(phone, password);

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      phone: toSupabasePhone(phone),
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.session?.access_token || !data.session.refresh_token) {
      throw new Error("手机号用户登录成功但未返回会话。请检查 Supabase Phone Auth 配置。");
    }

    await persistSupabaseSession(data.session.access_token, data.session.refresh_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "手机号用户登录会话创建失败。";

    logger.error("[auth] create Supabase phone session failed", {
      message,
      phone: toSupabasePhone(phone),
    });

    return {
      debug: `phone_session_error:${message}`,
      error: message,
      success: "",
    };
  }

  await ensureProfile();

  if (mode === "admin") {
    if (isAdminIdentity({ phone }, env) || await isAdminUser()) {
      redirect("/admin/upload");
    }

    return {
      debug: "unauthorized_admin_phone",
      error: "该手机号未被授权为管理员。",
      success: "",
    };
  }

  if (await isAdminUser()) {
    redirect("/admin/upload");
  }

  redirect("/favorites");
}

export async function signInWithWechat(formData: FormData) {
  const next = String(formData.get("next") ?? "/favorites");
  const mode = String(formData.get("mode") ?? "user") as SignInMode;
  const bridgeUrl = getWechatAuthBridgeUrl();

  if (!bridgeUrl) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}&mode=${mode}&error=wechat_not_configured`);
  }

  const origin = getRequestOrigin();
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
    redirect(`/auth/login?next=${encodeURIComponent(next)}&error=missing_env&mode=admin`);
  }

  const authed = await isAdminUser();

  if (!authed) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}&mode=admin`);
  }
}
