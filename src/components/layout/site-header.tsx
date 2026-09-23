import { SiteHeaderClient } from "@/components/layout/site-header-client";

/**
 * header 的薄包装。
 *
 * 以前这里 `await getCurrentUser()` 拿登录态，再算出 `isAdmin` 一起下发给客户端。
 * 那条路径有两个代价：
 *   1. `getCurrentUser()` 内部 `await cookies()` —— 任何用到 header 的页面都无法
 *      静态化，这正是 2026-09-23 Vercel 额度打穿（Fast Origin Transfer 300%）的
 *      直接原因；
 *   2. 它每次调用都打一次 Supabase Auth 的网络 `getUser()` 且没有 memo。
 *
 * 登录态现在由客户端 `SessionProvider` 从本地 cookie 读出（零网络），见
 * `session-provider.tsx`。
 *
 * 之所以仍然保留这层包装而不是让三个 layout 直接用 `SiteHeaderClient`：
 * layout 不必知道登录态是怎么来的，将来若要再下发别的属性也只有这一个改动点。
 */
export function SiteHeader({ topBar }: { topBar?: React.ReactNode }) {
  return <SiteHeaderClient topBar={topBar} />;
}
