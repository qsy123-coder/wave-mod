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
  missing_env: "Supabase 环境变量未加载成功，请确认重启开发服务并检查 .env.local。",
  missing_code: "登录回调缺少验证码授权码，请重新发送邮箱验证码。",
  exchange_failed: "登录会话创建失败，请重新尝试。",
  unauthorized: "当前账号不是管理员，无权进入后台。",
  wechat_not_configured: "微信登录尚未配置：请先准备微信开放平台网站应用、回调域名和认证桥接地址。",
};

async function LoginPageContent({ searchParams }: LoginPageProps) {
  const { next = "/admin/upload", error, mode = "admin" } = await searchParams;
  const pageError = error ? errorMessageMap[error] ?? "登录失败，请稍后再试。" : "";

  return <LoginForm next={next} pageError={pageError} mode={mode} />;
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
