"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Bug, Clock3, Mail, Send, ShieldEllipsis, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { signInWithMagicLink } from "@/actions/auth/auth-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = {
  debug: "",
  error: "",
  success: "",
};

const EMAIL_PROVIDER_LABELS = ["QQ 邮箱", "163", "126", "Outlook", "Gmail", "企业邮箱"] as const;
const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm({ next, pageError, mode }: { next: string; pageError: string; mode: "admin" | "user" }) {
  const [state, formAction, pending] = useActionState(signInWithMagicLink, initialState);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isAdminMode = mode === "admin";
  const sendButtonLabel = useMemo(() => {
    if (pending) {
      return "发送中...";
    }

    if (cooldownSeconds > 0) {
      return `${cooldownSeconds}s 后可重新发送`;
    }

    return "发送邮箱验证码";
  }, [cooldownSeconds, pending]);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }

    if (state.success) {
      toast.success(state.success);
      window.setTimeout(() => {
        setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      }, 0);
    }
  }, [state.error, state.success]);

  useEffect(() => {
    if (pageError) {
      toast.error(pageError);
    }
  }, [pageError]);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <MotionReveal delay={0.04} rotate={-1}>
          <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: isAdminMode ? "var(--neo-accent)" : "var(--neo-secondary)" }}>
            <p className="neo-label text-black/60">Email OTP Login</p>
            <h1 className="mt-2 text-4xl font-black text-black">{isAdminMode ? "管理员邮箱验证码登录" : "邮箱验证码登录后即可收藏 MOD"}</h1>
          </section>
        </MotionReveal>

        <MotionReveal delay={0.1} y={24} rotate={1}>
          <Card className="neo-card-lg p-6" style={{ background: "var(--neo-panel)" }}>
            <CardContent className="space-y-6 p-0 text-black">
              <div className="flex size-18 items-center justify-center border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000]">
                <Mail className="size-8" />
              </div>
              <div className="space-y-2">
                <p className="text-3xl font-black">{isAdminMode ? "输入邮箱后，去邮箱完成验证码登录" : "输入邮箱后，去邮箱完成验证码登录"}</p>
                <p className="text-sm font-bold leading-7 text-black/75">
                  {isAdminMode
                    ? "本阶段继续使用 Supabase 邮箱登录链路，但页面体验已调整为更符合中国用户习惯的邮箱验证码登录表达。推荐优先使用 163、126、Outlook、Gmail、企业邮箱；如果使用 QQ 邮箱，请同时检查垃圾邮件箱。"
                    : "登录后可继续收藏、评论和同步个人内容。推荐优先使用 163、126、Outlook、Gmail、企业邮箱；如果使用 QQ 邮箱，请同时检查垃圾邮件箱。"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {EMAIL_PROVIDER_LABELS.map((provider) => (
                  <Badge key={provider} className="neo-sticker bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-black hover:bg-white">
                    {provider}
                  </Badge>
                ))}
              </div>

              {pageError ? (
                <div className="border-4 border-black bg-[#ffb5c3] px-4 py-3 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]">
                  {pageError}
                </div>
              ) : null}

              {state.error ? (
                <div className="border-4 border-black bg-[#ffb5c3] px-4 py-3 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]">
                  发送失败：{state.error}
                </div>
              ) : null}

              {state.success ? (
                <div className="space-y-3 border-4 border-black px-4 py-4 text-sm font-black text-black shadow-[6px_6px_0px_0px_#000]" style={{ background: "var(--neo-secondary)" }}>
                  <p>发送成功：{state.success}</p>
                  <div className="space-y-2 text-xs font-bold leading-6 text-black/80">
                    <p>1. 前往你的邮箱，查看最新登录邮件。</p>
                    <p>2. 优先在同一设备完成登录，成功后会自动回到当前页面。</p>
                    <p>3. 若 1 分钟内未收到，请检查垃圾邮件箱，或更换 163 / 126 / Outlook / Gmail / 企业邮箱重试。</p>
                  </div>
                </div>
              ) : null}

              {state.debug ? (
                <div className="border-4 border-black bg-white px-4 py-3 text-xs font-bold leading-6 text-black shadow-[6px_6px_0px_0px_#000]">
                  <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                    <Bug className="size-3.5" />
                    调试信息
                  </p>
                  <p className="break-all">{state.debug}</p>
                </div>
              ) : null}

              <form action={formAction} className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="mode" value={mode} />
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-black uppercase tracking-[0.14em] text-black">
                    {isAdminMode ? "管理员邮箱" : "登录邮箱"}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="例如：yourname@qq.com / 163.com / outlook.com"
                    autoComplete="email"
                    required
                  />
                  <p className="text-xs font-black leading-5 text-black/65">
                    推荐顺序：163、126、Outlook、Gmail、企业邮箱；若使用 QQ 邮箱，请同时检查垃圾邮件箱。
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={pending || cooldownSeconds > 0}>
                  {cooldownSeconds > 0 ? <Clock3 className="size-4" /> : <Send className="size-4" />}
                  {sendButtonLabel}
                </Button>
              </form>
            </CardContent>
          </Card>
        </MotionReveal>

        <MotionReveal delay={0.16} y={24} rotate={-1}>
          <Card className="neo-card-lg p-6" style={{ background: "var(--neo-secondary)" }}>
            <CardContent className="space-y-4 p-0 text-black">
              <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]">
                <ShieldEllipsis className="size-4" />
                {isAdminMode ? "登录建议" : "使用建议"}
              </p>
              <ul className="space-y-3 text-sm font-bold leading-7 text-black/80">
                {isAdminMode ? (
                  <>
                    <li>• 仅 `ADMIN_EMAIL` 指定账号可进入后台。</li>
                    <li>• 管理员建议优先使用 163、126、Outlook、Gmail 或企业邮箱，稳定性通常高于 QQ 邮箱。</li>
                    <li>• 若连续收不到邮件，请检查垃圾邮件箱，或更换邮箱后重试。</li>
                  </>
                ) : (
                  <>
                    <li>• 登录成功后会自动回到原页面，继续收藏、评论或同步个人内容。</li>
                    <li>• 中国用户建议优先使用 163、126、Outlook、Gmail 或企业邮箱。</li>
                    <li>• 若使用 QQ 邮箱，请同时检查垃圾邮件箱，必要时等待 1 分钟后重新发送。</li>
                  </>
                )}
              </ul>
            </CardContent>
          </Card>
        </MotionReveal>

        <MotionReveal delay={0.2} y={24} rotate={1}>
          <Card className="neo-card-lg p-6" style={{ background: "var(--neo-muted)" }}>
            <CardContent className="space-y-4 p-0 text-black">
              <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]">
                <Sparkles className="size-4" />
                下一步
              </p>
              <p className="text-sm font-bold leading-7 text-black/80">
                {isAdminMode
                  ? "本阶段先完成邮箱验证码登录体验优化；下一阶段会接入微信登录，作为中国用户主登录入口。"
                  : "本阶段先完成邮箱验证码登录体验优化；下一阶段会接入微信登录，作为中国用户主登录入口。"}
              </p>
            </CardContent>
          </Card>
        </MotionReveal>
      </div>
    </div>
  );
}
