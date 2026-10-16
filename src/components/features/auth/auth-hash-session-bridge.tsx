"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Supabase 客户端**刻意不静态引入**。
 *
 * 它压缩后约 59 KB，而本组件挂载后的绝大多数时间**什么都不做** —— 只有 URL 上
 * 带着登录回调的 `code` / `access_token` 时才会用到它。静态 import 会把这 59 KB
 * 塞进每个页面的首屏包（本组件挂在根 layout 的 ClientProviders 里），和首屏图
 * 抢同一条链路：2026-10-16 实测（本地生产构建 + CDP 模拟 150ms RTT / 4Mbps），
 * 首屏 JS 占 65%、LCP 9.9 秒。
 *
 * 改成动态 import 之后它自成一个 chunk，正常浏览根本不会下载。
 */

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/admin/upload";
  }

  if (value.startsWith("//")) {
    return "/admin/upload";
  }

  return value;
}

function removeAuthParamsFromCurrentUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");

  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function getAuthError(searchParams: URLSearchParams, hashParams: URLSearchParams) {
  return (
    searchParams.get("error_description") ||
    searchParams.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error")
  );
}

/**
 * 登录成功的收尾：跳目标页。
 * 两条路径（PKCE code / 隐式 hash token）共用。
 * 和目标页是同一次整页导航，回调参数不用手动清。
 */
function finishLogin(next: string) {
  window.location.replace(next);
}

/** PKCE 流程：把 URL 上的 code 换成会话。 */
async function exchangeCode(code: string, next: string) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().auth.exchangeCodeForSession(code);

    if (error) {
      toast.error(`登录会话创建失败：${error.message}`);
      removeAuthParamsFromCurrentUrl();
      return;
    }

    finishLogin(next);
  } catch {
    // 动态 import 失败（离线 / chunk 取不到）或环境变量缺失。
    // 不抛：这个组件只是登录链路的收尾，让它静默失败比炸掉整页合理。
    toast.error("登录会话创建失败：无法加载登录模块");
    removeAuthParamsFromCurrentUrl();
  }
}

/** 隐式流程：把 hash 里的 token 写进会话。 */
async function adoptHashSession(accessToken: string, refreshToken: string, next: string) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      toast.error(`登录会话创建失败：${error.message}`);
      removeAuthParamsFromCurrentUrl();
      return;
    }

    finishLogin(next);
  } catch {
    toast.error("登录会话创建失败：无法加载登录模块");
    removeAuthParamsFromCurrentUrl();
  }
}

export function AuthHashSessionBridge() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);
    const error = getAuthError(searchParams, hashParams);

    if (error) {
      toast.error(`登录失败：${decodeURIComponent(error)}`);
      removeAuthParamsFromCurrentUrl();
      return;
    }

    const next = getSafeNextPath(searchParams.get("next"));
    const code = searchParams.get("code");

    if (code) {
      void exchangeCode(code, next);
      return;
    }

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      return;
    }

    void adoptHashSession(accessToken, refreshToken, next);
  }, []);

  return null;
}
