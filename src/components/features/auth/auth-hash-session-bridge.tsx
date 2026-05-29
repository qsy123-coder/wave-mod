"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  if (value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function AuthHashSessionBridge() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";

    if (!hash) {
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const error = params.get("error_description") || params.get("error");

    if (error) {
      toast.error(`登录失败：${decodeURIComponent(error)}`);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      return;
    }

    if (!accessToken || !refreshToken) {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const next = getSafeNextPath(searchParams.get("next"));

    void createClient()
      .auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          toast.error(`登录会话创建失败：${sessionError.message}`);
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          return;
        }

        window.location.replace(next);
      });
  }, []);

  return null;
}
