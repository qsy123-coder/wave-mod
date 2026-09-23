"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  isAdminLookupNeeded,
  resolveIsAdmin,
  toSessionUser,
  type AdminLookup,
  type SessionStatus,
  type SessionUser,
} from "@/lib/auth/session-state";
import { createClient } from "@/lib/supabase/client";

/**
 * 把「当前是谁」从服务端搬到客户端。
 *
 * 起因：`getCurrentUser()` 内部 `await cookies()`，任何路由只要在顶层调它就无法被
 * 静态化 —— 2026-09-23 Vercel 因额度打穿整站暂停（Fast Origin Transfer 300%）时，
 * 全站几乎没有任何东西走缓存（ISR Reads 只占 0.6%）。更糟的是它每次调用都打一次
 * Supabase Auth 的网络 `getUser()` 且**没有 memo**，mod 详情页一次渲染要串 3–5 次。
 *
 * 现在页面可以在构建期预渲染，会话态由这里在浏览器里补齐。写入路径
 * （Server Action / Route Handler）本来就不会被缓存，不受影响。
 *
 * 安全边界不变：这里只决定**渲染哪些入口链接**，`/admin/*` 的准入仍由
 * `proxy.ts` 与 `admin/layout.tsx` 的服务端守卫把关。
 */

const SESSION_IDENTITY_KEY = ["session", "identity"] as const;

type SessionContextValue = {
  status: SessionStatus;
  user: SessionUser | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
};

/**
 * 默认值 = 已 ready 且未登录。
 *
 * 万一有组件在 provider 之外调用 `useSession()`（例如某个独立 layout 忘了包），
 * 拿到的是「未登录」而不是「永远 loading」—— 后者会把登录入口永久藏起来，
 * 是更难排查的故障。宁可少两个链接，也不要整块 UI 消失。
 */
const SessionContext = createContext<SessionContextValue>({
  status: "ready",
  user: null,
  isLoggedIn: false,
  isAdmin: false,
});

export function useSession() {
  return useContext(SessionContext);
}

/**
 * 订阅登录 / 登出 / 换人，把结果直接写进 React Query 缓存。
 *
 * 写缓存而不是写组件 state：会话身份本身就是 `SESSION_IDENTITY_KEY` 这条查询的数据，
 * 两边共用一个真相来源，头部因此不必等下一次导航就能跟着变。
 *
 * 订阅回调里**只**碰缓存，不再调用 supabase —— 在 onAuthStateChange 回调里调 auth
 * 方法有死锁风险。
 *
 * 返回取消订阅；拿不到客户端时是空操作（不会抛）。
 */
function subscribeToAuthChanges(queryClient: QueryClient) {
  try {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(SESSION_IDENTITY_KEY, toSessionUser(session?.user ?? null));
    });

    return () => data.subscription.unsubscribe();
  } catch {
    // Supabase 环境变量缺失（某些构建 / 预览环境）：没有客户端可订阅。
    // 不抛错 —— 会话态就停在查询的初值「未登录」，页面上其余部分照常可用。
    return () => {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // 会话来源是**本地 cookie，零网络**：`getSession()` 只解密本地存的 token，
  // 不发请求；`getUser()` 才发（而它正是打穿额度时的主要浪费来源）。
  //
  // 用查询而不是 useState + effect 有两个好处：不必在 effect 里同步 setState
  // （那会触发级联渲染，eslint 的 react-hooks/set-state-in-effect 也会报错），
  // 而且失败路径天然 fail closed —— 读不到会话时 data 是 undefined，等同于未登录。
  const sessionQuery = useQuery<SessionUser | null>({
    queryKey: SESSION_IDENTITY_KEY,
    queryFn: async () => {
      const { data } = await createClient().auth.getSession();
      return toSessionUser(data.session?.user ?? null);
    },
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => subscribeToAuthChanges(queryClient), [queryClient]);

  const user = sessionQuery.data ?? null;

  // 失败（isPending 变 false、data 仍是 undefined）也算 ready：那时确实「知道」了
  // ——就是未登录。卡在 loading 会让调用方以为还没确定。
  const status: SessionStatus = sessionQuery.isPending ? "loading" : "ready";

  const userId = user?.id ?? null;

  // isAdmin 只能问服务端：判定要比较 ADMIN_EMAIL / ADMIN_PHONES，那两个变量绝不能
  // 进前端包。匿名访客与爬虫连这个请求都不会发（enabled: false）。
  const adminQuery = useQuery<AdminLookup>({
    queryKey: ["session", "is-admin", userId],
    enabled: isAdminLookupNeeded(user),
    queryFn: async () => {
      if (!userId) {
        throw new Error("is-admin 查询在未登录状态下被触发");
      }

      const response = await fetch("/api/auth/is-admin", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`is-admin 查询失败：HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { isAdmin?: unknown };

      // 连同「这是替谁查的」一起返回：响应回来时用户可能已经登出或换人，
      // resolveIsAdmin 靠 userId 把那种结果判为不算数。
      return { userId, isAdmin: payload?.isAdmin === true };
    },
    // 管理员身份在一次会话内不会变。换人会让 queryKey 里的 userId 变化、自然重查，
    // 所以不需要靠过期时间来刷新。
    // retry: false —— 失败的代价只是少两个入口链接，而这接口目前正因 Supabase 网关
    // 被锁而必然失败，重试纯属浪费请求。
    staleTime: Infinity,
    retry: false,
  });

  const isAdmin = resolveIsAdmin(user, adminQuery.data);

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, isLoggedIn: Boolean(user), isAdmin }),
    [status, user, isAdmin],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
