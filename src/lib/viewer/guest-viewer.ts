"use client";

/**
 * 站内登录已下线（2026-11 数据库迁移）：所有访客都是游客。
 *
 * 保留一个与旧 `useSession()` 同形状的 hook，是为了让消费方不必大改：
 * 组件里「未登录」的分支会自然生效，而登录/个人中心入口会在后续清理中删除。
 */
export type GuestViewerUser = {
  id: string;
  email: string | null;
  /** SessionProvider 原先从 user_metadata 里拼出的展示名 */
  displayName?: string | null;
  user_metadata: {
    avatar_url?: string;
    display_name?: string;
    full_name?: string;
  };
};

export type GuestViewer = {
  isLoggedIn: boolean;
  isAdmin: boolean;
  user: GuestViewerUser | null;
};

const guestViewer: GuestViewer = {
  isLoggedIn: false,
  isAdmin: false,
  user: null,
};

export function useGuestViewer(): GuestViewer {
  return guestViewer;
}
