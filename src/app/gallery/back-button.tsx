"use client";

import { useRouter } from "next/navigation";

/**
 * /gallery 全局返回按钮 — 返回进入图库前所在的页面。
 *
 * 固定左上角（右上角已是 GitHub 链接），刻意做小、只落一角，不影响图库交互。
 *
 * 直接跳回"进入图库前的页面"（同源 referrer；无则回站点首页 /），
 * 不走 history.back() 的逐步回退，这样即使图片处于放大态（点开图片用 pushState
 * 多了一层历史）也能点击一次就整页离开、图片随之卸载。
 */
export function GalleryBackButton() {
  const router = useRouter();

  const handleBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 阻止冒泡到图库的 window click handler（否则图片放大时点击会额外触发 dismiss1D）
    e.stopPropagation();

    // 同源 referrer → 直接跳回；否则回站点首页
    const ref = document.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        if (u.origin === window.location.origin) {
          router.push(u.pathname + u.search + u.hash);
          return;
        }
      } catch {
        /* 忽略非法 referrer */
      }
    }
    router.push("/");
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
        width: 24,
        height: 24,
        borderRadius: 6,
        color: "rgb(192, 198, 205)",
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        backdropFilter: "blur(8px)",
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        cursor: "pointer",
        transition:
          "transform 0.15s ease-out, background 0.15s ease-out, color 0.15s ease-out",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
      }}
    >
      {/* 左箭头 */}
      <svg
        width="14"
        height="14"
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
