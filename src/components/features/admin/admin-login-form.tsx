"use client";

import { useActionState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";

import { adminLoginAction, type AdminLoginState } from "@/actions/admin/auth-actions";

const initialState: AdminLoginState = { error: "" };

export function AdminLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(adminLoginAction, initialState);

  return (
    <form
      action={formAction}
      className="space-y-4 border-4 border-black bg-white p-6 text-black shadow-[8px_8px_0px_0px_#000]"
    >
      <input type="hidden" name="next" value={next ?? ""} />

      <label className="block space-y-1">
        <span className="text-xs font-black uppercase tracking-[0.14em]">用户名</span>
        <input
          name="username"
          autoComplete="username"
          required
          autoFocus
          className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-black uppercase tracking-[0.14em]">密码</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black"
        />
      </label>

      {state.error ? (
        <p className="border-4 border-black bg-[#ffb5c3] px-3 py-2 text-sm font-black text-[#7a0b1a]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="neo-button-primary inline-flex w-full items-center justify-center gap-2 px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {pending ? "登录中…" : "登录"}
      </button>

      <p className="text-[11px] font-bold leading-5 text-black/55">
        凭据与服务器的 Basic Auth 相同（`ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD`）。
        登录状态存在签名 Cookie 里，30 天后过期。
      </p>
    </form>
  );
}
