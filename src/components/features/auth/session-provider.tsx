"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  isAdminLookupNeeded,
  resolveIsAdmin,
  toSessionUser,
  type AdminLookup,
  type SessionStatus,
  type SessionUser,
} from "@/lib/auth/session-state";

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
async function subscribeToAuthChanges(queryClient: QueryClient) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(SESSION_IDENTITY_KEY, toSessionUser(session?.user ?? null));
    });

    return () => data.subscription.unsubscribe();
  } catch {
    // Supabase 环境变量缺失（某些构建 / 预览环境）或 chunk 取不到：没有客户端可订阅。
    // 不抛错 —— 会话态就停在查询的初值「未登录」，页面上其余部分照常可用。
    return () => {};
  }
}

/**
 * 「现在要不要去问会话」—— 首屏先不问。
 *
 * Supabase 客户端压缩后约 59 KB，而它换来的是头部那几个入口显示成「登录」还是
 * 「头像」。首屏最大的成本就是 JS（实测占 65%），这 59 KB 会和 hero 图抢同一条
 * 链路：2026-10-16 实测（本地生产构建 + CDP 模拟 150ms RTT / 4Mbps），加进来之前
 * LCP 0.8 秒、加进来之后 9.9 秒。
 *
 * 所以先按「未登录」渲染 —— 与下面 SessionContext 默认值的取舍一致：宁可少两个
 * 链接，也不要整块 UI 消失。等浏览器空闲（或最迟 2 秒）再放开。
 *
 * 代价：已登录用户的头部会晚一步从「登录」变成「头像」，这是明知的取舍，
 * 不是 bug。要改回去就把这个 hook 的返回值恒为 true。
 */
function useDeferredSessionLoad() {
  const [canLoad, setCanLoad] = useState(false);

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    // timeout 是必需的：一直不空闲（比如首屏图还在下）时不能让会话永远悬着，
    // 2 秒是「等首屏关键资源让路」和「登录态别太久不出现」之间的折中。
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(() => setCanLoad(true), { timeout: 2000 });
      return () => w.cancelIdleCallback?.(handle);
    }

    // Safari 16.4 以下没有 requestIdleCallback
    const timer = setTimeout(() => setCanLoad(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return canLoad;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const canLoadSession = useDeferredSessionLoad();

  // 会话来源是**本地 cookie，零网络**：`getSession()` 只解密本地存的 token，
  // 不发请求；`getUser()` 才发（而它正是打穿额度时的主要浪费来源）。
  //
  // 用查询而不是 useState + effect 有两个好处：不必在 effect 里同步 setState
  // （那会触发级联渲染，eslint 的 react-hooks/set-state-in-effect 也会报错），
  // 而且失败路径天然 fail closed —— 读不到会话时 data 是 undefined，等同于未登录。
  //
  // `enabled: canLoadSession` + 动态 import：首屏不去取 Supabase 那个 59 KB 的
  // chunk，等浏览器空闲再说 —— 理由见 useDeferredSessionLoad。
  const sessionQuery = useQuery<SessionUser | null>({
    queryKey: SESSION_IDENTITY_KEY,
    enabled: canLoadSession,
    queryFn: async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const { data } = await createClient().auth.getSession();
      return toSessionUser(data.session?.user ?? null);
    },
    staleTime: Infinity,
    retry: false,
  });

  // 订阅同样要等 canLoadSession：它内部也会拉起同一个 Supabase chunk。
  // 动态 import 是异步的，所以清理函数要等 promise 落地后再挂 —— 落在
  // 依赖变化之后（canLoadSession 不会变回去，但卸载仍要退订）。
  useEffect(() => {
    if (!canLoadSession) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void subscribeToAuthChanges(queryClient).then((fn) => {
      if (cancelled) fn();
      else unsubscribe = fn;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [canLoadSession, queryClient]);

  const user = canLoadSession ? sessionQuery.data ?? null : null;

  // 失败（isPending 变 false、data 仍是 undefined）也算 ready：那时确实「知道」了
  // ——就是未登录。卡在 loading 会让调用方以为还没确定。
  //
  // 还没放开加载时同样报 ready：那一刻我们愿意对外说「当作未登录」，
  // 报 loading 会让头部把登录入口整个藏起来（调用方普遍是 loading 就渲染占位），
  // 比晚一秒拿到头像难排查得多。
  const status: SessionStatus = canLoadSession && sessionQuery.isPending ? "loading" : "ready";

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
