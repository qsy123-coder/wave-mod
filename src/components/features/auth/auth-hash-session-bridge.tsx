"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

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
      void createClient()
        .auth.exchangeCodeForSession(code)
        .then(({ error: sessionError }) => {
          if (sessionError) {
            toast.error(`登录会话创建失败：${sessionError.message}`);
            removeAuthParamsFromCurrentUrl();
            return;
          }

          window.location.replace(next);
        });
      return;
    }

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      return;
    }

    void createClient()
      .auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          toast.error(`登录会话创建失败：${sessionError.message}`);
          removeAuthParamsFromCurrentUrl();
          return;
        }

        window.location.replace(next);
      });
  }, []);

  return null;
}
