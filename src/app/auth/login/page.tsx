import { Suspense } from "react";

import { LoginForm } from "@/components/features/auth/login-form";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    mode?: "admin" | "user";
  }>;
};

const errorMessageMap: Record<string, string> = {
  login_required: "请先登录管理员账号。",
  missing_env: "Supabase 环境变量未加载成功，请确认重启开发服务并检查 .env.local。",
  missing_code: "登录回调缺少验证码授权码，请重新发送邮箱验证码。",
  exchange_failed: "登录会话创建失败，请重新尝试。",
  unauthorized: "当前账号不是管理员，无权进入后台。",
  invalid_phone: "请输入正确的中国大陆手机号。",
  invalid_phone_token: "请输入正确的短信验证码。",
  phone_verify_failed: "短信验证码校验失败，请重新输入或重新发送。",
  phone_session_failed: "手机号登录会话创建失败，请稍后重试。",
  wechat_not_configured: "微信登录尚未配置：请先准备微信开放平台网站应用、回调域名和认证桥接地址。",
};

async function LoginPageContent({ searchParams }: LoginPageProps) {
  const { next = "/admin/upload", error, mode } = await searchParams;
  const resolvedMode = next.startsWith("/admin") ? "admin" : mode ?? "admin";
  const pageError = error ? errorMessageMap[error] ?? "登录失败，请稍后再试。" : "";

  return <LoginForm next={next} pageError={pageError} mode={resolvedMode} />;
}

function LoginFormSkeleton() {
  return <div className="neo-card-lg h-[360px] w-full max-w-md animate-pulse bg-[var(--neo-panel)]" />;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}
