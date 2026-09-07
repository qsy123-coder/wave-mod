"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Bug, Clock3, Mail, MessageCircle, Send, Smartphone, Sparkles, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { sendPhoneOtp, signInWithMagicLink, signInWithWechat, verifyEmailOtp } from "@/actions/auth/auth-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = {
  debug: "",
  error: "",
  success: "",
};

const emailInitialState = {
  debug: "",
  email: "",
  error: "",
  success: "",
};

const phoneInitialState = {
  debug: "",
  error: "",
  phone: "",
  success: "",
};

const EMAIL_PROVIDER_LABELS = ["QQ 邮箱", "163", "126", "Outlook", "Gmail", "企业邮箱"] as const;
const RESEND_COOLDOWN_SECONDS = 60;

const DISPLAY_LATIN = "'Bungee', 'Segoe UI', 'Microsoft YaHei UI', sans-serif";
const DISPLAY_CN = "'ZCOOL KuaiLe', 'Segoe UI', 'Microsoft YaHei UI', sans-serif";

type LoginTab = "email" | "phone";

export function LoginForm({ next, pageError, mode }: { next: string; pageError: string; mode: "admin" | "user" }) {
  const [state, formAction, pending] = useActionState(signInWithMagicLink, emailInitialState);
  const [verifyEmailState, verifyEmailAction, verifyEmailPending] = useActionState(verifyEmailOtp, initialState);
  const [phoneState, phoneAction, phonePending] = useActionState(sendPhoneOtp, phoneInitialState);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [phoneCooldownSeconds, setPhoneCooldownSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState<LoginTab>("email");
  const isAdminMode = mode === "admin";

  const sendButtonLabel = useMemo(() => {
    if (pending) return "发送中...";
    if (cooldownSeconds > 0) return `${cooldownSeconds}s 后可重新发送`;
    return "发送邮箱验证码";
  }, [cooldownSeconds, pending]);
  const phoneButtonLabel = useMemo(() => {
    if (phonePending) return "发送中...";
    if (phoneCooldownSeconds > 0) return `${phoneCooldownSeconds}s 后可重新发送`;
    return "发送短信验证码";
  }, [phoneCooldownSeconds, phonePending]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      window.setTimeout(() => setCooldownSeconds(RESEND_COOLDOWN_SECONDS), 0);
    }
  }, [state.error, state.success]);

  useEffect(() => {
    if (verifyEmailState.error) toast.error(verifyEmailState.error);
    if (verifyEmailState.success) toast.success(verifyEmailState.success);
  }, [verifyEmailState.error, verifyEmailState.success]);

  useEffect(() => {
    if (phoneState.error) toast.error(phoneState.error);
    if (phoneState.success) {
      toast.success(phoneState.success);
      window.setTimeout(() => setPhoneCooldownSeconds(RESEND_COOLDOWN_SECONDS), 0);
    }
  }, [phoneState.error, phoneState.success]);

  useEffect(() => {
    if (pageError) toast.error(pageError);
  }, [pageError]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => setCooldownSeconds((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (phoneCooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => setPhoneCooldownSeconds((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phoneCooldownSeconds]);

  const tabButtonClass = (active: boolean) =>
    `inline-flex flex-1 items-center justify-center gap-2 rounded-none border-2 border-black px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
      active ? "bg-black text-white" : "bg-white text-black hover:bg-[#f3f3f3]"
    }`;

  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12 sm:px-6"
      style={{ background: "var(--neo-dark)" }}
    >
      {/* 暗色沉浸背景：点状网格 + 霓虹泛光 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,125,125,0.26), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[700px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(255,216,79,0.16), transparent 72%)" }}
      />

      <div className="relative w-full max-w-md space-y-7">
        {/* 品牌区：邮票 W 章 + logotype + 街机大标题 */}
        <MotionReveal delay={0.02} rotate={-1}>
          <header className="flex flex-col items-center gap-4 text-center">
            <div
              className="flex size-16 items-center justify-center border-[3px] border-black text-2xl font-black text-black shadow-[7px_7px_0px_0px_#ffd84f]"
              style={{ background: "var(--neo-accent)" }}
            >
              W
            </div>
            <p
              className="text-xs font-black uppercase tracking-[0.34em] text-white/70"
              style={{ fontFamily: DISPLAY_LATIN }}
            >
              WaveMod
            </p>
            <h1
              className="text-5xl leading-none tracking-[0.06em]"
              style={{ fontFamily: DISPLAY_CN, color: "var(--neo-secondary)" }}
            >
              {isAdminMode ? "管理员通道" : "入站投币"}
            </h1>
            <p className="text-sm font-bold leading-6 text-white/60">
              {isAdminMode
                ? "仅 ADMIN_EMAIL 指定的账号可进场。"
                : "留下邮箱或手机号，就能收藏、评论，还能随时回来同步。"}
            </p>
          </header>
        </MotionReveal>

        {/* 登录主卡：票根 + 贴纸 tab + 打孔底线 */}
        <MotionReveal delay={0.08} y={20} rotate={1}>
          <Card
            className="overflow-hidden border-4 border-black p-0 shadow-[10px_10px_0px_0px_#ffd84f]"
            style={{ background: "var(--neo-panel)" }}
          >
            <CardContent className="space-y-0 p-0 text-black">
              {/* 登录方式 tab（贴纸） */}
              <div className="flex gap-2 border-b-4 border-black bg-white p-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("email")}
                  aria-pressed={activeTab === "email"}
                  className={tabButtonClass(activeTab === "email")}
                >
                  <Mail className="size-4" />
                  邮箱登录
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("phone")}
                  aria-pressed={activeTab === "phone"}
                  className={tabButtonClass(activeTab === "phone")}
                >
                  <Smartphone className="size-4" />
                  手机号登录
                </button>
              </div>

              <div className="space-y-5 p-4">
                {/* ===================== 邮箱 ===================== */}
                {activeTab === "email" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-black/60">
                        推荐邮箱
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {EMAIL_PROVIDER_LABELS.map((provider) => (
                          <span
                            key={provider}
                            className="border-2 border-black bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[3px_3px_0px_0px_#000]"
                          >
                            {provider}
                          </span>
                        ))}
                      </div>
                    </div>

                    <form action={formAction} className="space-y-4">
                      <input type="hidden" name="next" value={next} />
                      <input type="hidden" name="mode" value={mode} />
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-black uppercase tracking-[0.14em]">
                          {isAdminMode ? "管理员邮箱" : "登录邮箱"}
                        </Label>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" />
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="例如：yourname@qq.com / 163.com"
                            autoComplete="email"
                            required
                            className="pl-9"
                          />
                        </div>
                        <p className="text-xs font-bold leading-5 text-black/60">
                          推荐 163、126、Outlook、Gmail、企业邮箱；QQ 邮箱请同时检查垃圾邮件箱。
                        </p>
                      </div>
                      <Button type="submit" className="w-full" disabled={pending || cooldownSeconds > 0}>
                        {cooldownSeconds > 0 ? <Clock3 className="size-4" /> : <Send className="size-4" />}
                        {sendButtonLabel}
                      </Button>
                    </form>

                    <form action={verifyEmailAction} className="space-y-3 border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_#000]">
                      <input type="hidden" name="next" value={next} />
                      <input type="hidden" name="mode" value={mode} />
                      <input type="hidden" name="email" value={state.email} />
                      <div className="space-y-2">
                        <Label htmlFor="email-token" className="text-xs font-black uppercase tracking-[0.14em]">
                          邮箱回执验证码
                        </Label>
                        <div className="relative">
                          <Input
                            id="email-token"
                            name="token"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="输入邮件里的 6 位验证码"
                            required
                            className="pr-9 text-center tracking-[0.4em]"
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={verifyEmailPending || !state.email}>
                        {verifyEmailPending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        验证邮箱并登录
                      </Button>
                    </form>

                    {state.success ? (
                      <div className="space-y-2 border-2 border-black bg-white px-4 py-3 text-xs font-bold leading-6 text-black shadow-[4px_4px_0px_0px_#000]">
                        <p className="font-black text-black">发送成功：{state.success}</p>
                        <ol className="list-decimal space-y-1 pl-4 text-black/80">
                          <li>前往邮箱查看最新登录邮件。</li>
                          <li>建议同一设备完成登录，成功后会自动回到当前页面。</li>
                          <li>若 1 分钟内未收到，请检查垃圾邮件箱或更换邮箱重试。</li>
                        </ol>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* ===================== 手机 ===================== */}
                {activeTab === "phone" ? (
                  <div className="space-y-4">
                    <form action={phoneAction} className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-sm font-black uppercase tracking-[0.14em]">
                          手机号
                        </Label>
                        <div className="relative">
                          <Smartphone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" />
                          <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            placeholder="输入 11 位手机号，例如 13800138000"
                            autoComplete="tel"
                            required
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={phonePending || phoneCooldownSeconds > 0}>
                        {phoneCooldownSeconds > 0 ? <Clock3 className="size-4" /> : <Send className="size-4" />}
                        {phoneButtonLabel}
                      </Button>
                      <input type="hidden" name="mode" value={mode} />
                    </form>

                    <form action="/auth/phone/verify" method="post" className="space-y-3 border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_#000]">
                      <input type="hidden" name="phone" value={phoneState.phone} />
                      <input type="hidden" name="mode" value={mode} />
                      <input type="hidden" name="next" value={next} />
                      <div className="space-y-2">
                        <Label htmlFor="phone-token" className="text-xs font-black uppercase tracking-[0.14em]">
                          短信验证码
                        </Label>
                        <Input
                          id="phone-token"
                          name="token"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6 位短信验证码"
                          required
                          className="text-center tracking-[0.4em]"
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={!phoneState.phone}>
                        验证并登录
                      </Button>
                    </form>

                    <p className="text-xs font-bold leading-5 text-black/60">
                      {isAdminMode
                        ? "管理员手机号加入白名单后，可用短信验证码直接进入后台。"
                        : "手机号登录已接入阿里云短信验证码，适合中国大陆用户快速登录。"}
                    </p>
                    {phoneState.error ? (
                      <p className="text-xs font-black leading-5 text-[#c1121f]">{phoneState.error}</p>
                    ) : null}
                    {phoneState.success ? (
                      <p className="text-xs font-black leading-5 text-black/80">{phoneState.success}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* 全局错误 / 调试 */}
              {pageError ? (
                <div className="border-t-4 border-black bg-[#ffb5c3] px-4 py-3 text-sm font-black text-black">
                  {pageError}
                </div>
              ) : null}
              {activeTab === "email" && state.error ? (
                <div className="border-t-4 border-black bg-[#ffb5c3] px-4 py-3 text-sm font-black text-black">
                  发送失败：{state.error}
                </div>
              ) : null}
              {activeTab === "email" && verifyEmailState.debug ? (
                <div className="border-t-4 border-black bg-white px-4 py-3 text-xs font-bold leading-6 text-black">
                  <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                    <Bug className="size-3.5" />
                    调试信息
                  </p>
                  <p className="break-all">{verifyEmailState.debug}</p>
                </div>
              ) : null}

              {/* 打孔票底线 */}
              <div
                aria-hidden
                className="h-2 w-full"
                style={{ backgroundImage: "repeating-linear-gradient(90deg, #000 0 7px, transparent 7px 14px)", opacity: 0.18 }}
              />
            </CardContent>
          </Card>
        </MotionReveal>

        {/* 票根窄条：建议 + 微信占位 */}
        <MotionReveal delay={0.12} y={12} rotate={-1}>
          <footer className="space-y-3 text-center">
            <p className="text-xs font-bold leading-6 text-white/70">
              {isAdminMode
                ? "• 仅 ADMIN_EMAIL 指定账号可进入后台 · 建议使用 163 / 126 / Outlook / Gmail / 企业邮箱"
                : "• 登录成功后会自动回到原页面，继续收藏、评论或同步个人内容"}
            </p>
            {!isAdminMode ? (
              <form action={signInWithWechat} className="inline-flex items-center justify-center gap-2 opacity-70">
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="mode" value={mode} />
                <Button type="submit" variant="outline" className="bg-white text-black hover:bg-white/80" disabled>
                  <MessageCircle className="size-4" />
                  微信快捷登录（未激活）
                </Button>
              </form>
            ) : null}
          </footer>
        </MotionReveal>
      </div>
    </div>
  );
}
