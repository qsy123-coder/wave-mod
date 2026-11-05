"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifyAdminCredentials } from "@/lib/admin/basic-auth";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
} from "@/lib/admin/session";

const ADMIN_LOGIN_PATH = "/admin/login";
const DEFAULT_ADMIN_PATH = "/admin/batch-upload";

export type AdminLoginState = { error: string };

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
  next: z.string().trim().optional(),
});

/**
 * 登录后的回跳地址只接受站内后台路径。
 * 挡掉 `//evil.com`、`https://...` 这类开放重定向。
 */
function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/admin")) return DEFAULT_ADMIN_PATH;
  if (value.startsWith("//")) return DEFAULT_ADMIN_PATH;
  return value;
}

export async function adminLoginAction(
  _previous: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请填写用户名和密码" };
  }

  const { username, password, next } = parsed.data;

  if (!(await verifyAdminCredentials(username, password))) {
    return { error: "用户名或密码不正确" };
  }

  const token = await createAdminSessionToken();
  if (!token) {
    return { error: "后台未配置管理员凭据，无法登录" };
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions());

  // redirect() 内部靠抛错完成跳转，必须放在 try/catch 之外
  redirect(safeNextPath(next));
}

export async function adminLogoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);

  redirect(ADMIN_LOGIN_PATH);
}
