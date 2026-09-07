"use client";

import { useRouter } from "next/navigation";

import { LOGIN_BACK_KEY } from "@/lib/constants/auth-nav";

/**
 * /auth/login 登录页返回按钮。
 *
 * 登录页是无 header/footer、无站点导航的全屏沉浸路由，需要一个返回上一页的入口。
 * 按优先级解析返回目标（保证永远有响应，绝不静默停住）：
 * 1. 点击登录入口时记录的同源来源页（sessionStorage，覆盖 header <Link> 客户端软导航，
 *    此时 document.referrer 为空，只能靠这里拿到来源）；
 * 2. 同源 document.referrer（覆盖页内 <a> 硬导航 / 带来源直访）；
 * 3. 兜底回到首页 /（直接输入 URL 进入登录页时也能安全离开）。
 */
export function LoginBackButton() {
  const router = useRouter();

  const resolveTarget = (): string => {
    // 1) 入口记录的同源来源页
    try {
      const stored = sessionStorage.getItem(LOGIN_BACK_KEY);
      if (stored) {
        const u = new URL(stored, window.location.origin);
        if (u.origin === window.location.origin) return stored;
      }
    } catch {
      /* 忽略非法/不可用的 sessionStorage */
    }
    // 2) 同源 referrer
    try {
      const ref = document.referrer;
      if (ref) {
        const u = new URL(ref);
        if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
      }
    } catch {
      /* 忽略非法 referrer */
    }
    // 3) 兜底
    return "/";
  };

  const handleBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    router.push(resolveTarget());
  };

  return (
    <button
      type="button"
      aria-label="返回上一页"
      onClick={handleBack}
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 9999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 6,
        color: "rgb(192,198,205)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(8px)",
        cursor: "pointer",
        transition: "transform 0.15s ease-out, background 0.15s ease-out",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.background = "rgba(255,255,255,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
