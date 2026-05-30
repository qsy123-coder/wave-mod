import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { verifyAliyunDypnsCode } from "@/lib/sms/aliyun-dypns";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyAuthCookies, createRouteSupabaseClient, getSafeAuthNextPath, upsertProfileForAuthUser } from "@/lib/supabase/route-auth";
import { isAdminIdentity } from "@/lib/supabase/server-config";

function normalizeChinaPhone(rawPhone: string) {
  const compact = rawPhone.replace(/[\s-]/g, "").trim();

  if (/^1\d{10}$/.test(compact)) {
    return compact;
  }

  if (/^\+86(?:1\d{10})$/.test(compact)) {
    return compact.slice(3);
  }

  if (/^86(?:1\d{10})$/.test(compact)) {
    return compact.slice(2);
  }

  return "";
}

function toSupabasePhone(phone: string) {
  return `86${phone}`;
}

function createTemporaryPhonePassword() {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

async function upsertPhoneUserForPasswordLogin(phone: string, password: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法创建手机号登录用户。");
  }

  const supabasePhone = toSupabasePhone(phone);
  const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (users.error) {
    throw new Error(`查询手机号用户失败：${users.error.message}`);
  }

  const existingUser = users.data.users.find((user) => user.phone === supabasePhone || user.phone === phone || user.phone === `+86${phone}`);

  if (existingUser) {
    const updated = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
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

  const created = await supabaseAdmin.auth.admin.createUser({
    phone: supabasePhone,
    password,
    phone_confirm: true,
    user_metadata: {
      display_name: `手机用户 ${phone.slice(0, 3)}****${phone.slice(-4)}`,
      phone_login_provider: "aliyun_dypns",
    },
  });

  if (created.error || !created.data.user) {
    throw new Error(created.error?.message || "手机号用户创建失败。");
  }

  return created.data.user;
}

function buildLoginUrl(request: NextRequest, next: string, mode: "admin" | "user", error: string) {
  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("mode", mode);
  loginUrl.searchParams.set("error", error);
  return loginUrl;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const phone = normalizeChinaPhone(String(formData.get("phone") ?? ""));
  const token = String(formData.get("token") ?? "").replace(/\s/g, "").trim();
  const mode = String(formData.get("mode") ?? "user") === "admin" ? "admin" : "user";
  const next = getSafeAuthNextPath(String(formData.get("next") ?? ""), mode === "admin" ? "/admin/upload" : "/favorites");

  if (!phone) {
    return NextResponse.redirect(buildLoginUrl(request, next, mode, "invalid_phone"));
  }

  if (!/^\d{4,8}$/.test(token)) {
    return NextResponse.redirect(buildLoginUrl(request, next, mode, "invalid_phone_token"));
  }

  const { cookiesToSet, env, supabase } = createRouteSupabaseClient(request);

  if (!env || !supabase) {
    return NextResponse.redirect(buildLoginUrl(request, next, mode, "missing_env"));
  }

  try {
    await verifyAliyunDypnsCode(phone, token);
  } catch (error) {
    logger.warn("[auth] phone route dypns verify failed", {
      message: error instanceof Error ? error.message : String(error),
      phone: toSupabasePhone(phone),
    });

    return NextResponse.redirect(buildLoginUrl(request, next, mode, "phone_verify_failed"));
  }

  const password = createTemporaryPhonePassword();
  let sessionUserId = "";

  try {
    const phoneUser = await upsertPhoneUserForPasswordLogin(phone, password);
    sessionUserId = phoneUser.id;
  } catch (error) {
    logger.warn("[auth] phone route upsert user failed", {
      message: error instanceof Error ? error.message : String(error),
      phone: toSupabasePhone(phone),
    });

    return NextResponse.redirect(buildLoginUrl(request, next, mode, "phone_session_failed"));
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    phone: toSupabasePhone(phone),
    password,
  });

  if (error) {
    logger.warn("[auth] phone route create Supabase password session failed", {
      code: error.code,
      message: error.message,
      phone: toSupabasePhone(phone),
      status: error.status,
    });

    return NextResponse.redirect(buildLoginUrl(request, next, mode, "phone_session_failed"));
  }

  if (!data.user) {
    return NextResponse.redirect(buildLoginUrl(request, next, mode, "phone_session_failed"));
  }

  try {
    await upsertProfileForAuthUser(data.user);
  } catch (profileError) {
    logger.warn("[auth] phone route profile upsert failed", {
      message: profileError instanceof Error ? profileError.message : String(profileError),
      userId: data.user.id || sessionUserId,
    });
  }

  if (mode === "admin" && !isAdminIdentity(data.user, env) && !isAdminIdentity({ phone }, env)) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(buildLoginUrl(request, next, mode, "unauthorized"));
    return applyAuthCookies(response, cookiesToSet);
  }

  const response = NextResponse.redirect(new URL(mode === "admin" ? "/admin/upload" : next, request.url));
  return applyAuthCookies(response, cookiesToSet);
}
