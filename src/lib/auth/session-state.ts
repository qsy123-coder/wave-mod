/**
 * 会话态的**纯逻辑**部分。
 *
 * 为什么单独抽一个文件：真正用它的 `session-provider.tsx` 是 Client Component，
 * 而 vitest 跑在 node 环境（没有 jsdom），import 不了。把「怎么从 Supabase 的
 * user 推出我们自己的会话态、以及 is-admin 的响应算不算数」拆成不依赖 React /
 * 浏览器的纯函数，就能直接单测。
 *
 * 这一层要守住的核心不变量是 **isAdmin 的归属**：它由一次异步请求查出来，而请求
 * 往返期间用户可能登出、也可能换成了另一个人。放任不管的话，前一个人的 `true`
 * 会短暂地亮在后一个人的界面上（管理入口闪现）。`resolveIsAdmin` 就是这道闸门。
 */

/** Supabase `getSession()` / `onAuthStateChange` 给的 user 里我们真正用到的字段 */
export type SessionIdentity = {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: {
    display_name?: unknown;
    full_name?: unknown;
  } | null;
};

/** 归一化后的会话用户。空字符串一律收敛成 null，避免下游要同时判 null 和 ""。 */
export type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
  /**
   * 评论区里发评论时用的默认昵称。
   * 优先 user_metadata.display_name，其次 full_name，再退到邮箱前缀；都没有就是 null
   * （调用方自己兜底成「我」）。
   */
  displayName: string | null;
};

/**
 * `"loading"` = 还没读完本地 cookie，此时 user/isAdmin 都**不可信**；
 * `"ready"` 之后的值才代表已知状态。
 */
export type SessionStatus = "loading" | "ready";

/** `/api/auth/is-admin` 的响应加上「这是替谁查的」 */
export type AdminLookup = {
  userId: string;
  isAdmin: boolean;
};

/**
 * 取展示昵称。空字符串按「没有」处理 —— Supabase 里留空的名字很常见，
 * 而空白昵称会让评论区出现一条没有署名的评论。
 */
function readDisplayName(identity: SessionIdentity, email: string | null): string | null {
  const candidates = [identity.user_metadata?.display_name, identity.user_metadata?.full_name];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return email ? email.split("@")[0] : null;
}

export function toSessionUser(identity: SessionIdentity | null | undefined): SessionUser | null {
  if (!identity?.id) {
    return null;
  }

  const email = identity.email?.trim().toLowerCase() || null;

  return {
    id: identity.id,
    email,
    phone: identity.phone?.trim() || null,
    displayName: readDisplayName(identity, email),
  };
}

/**
 * 是否需要去打 `/api/auth/is-admin`。
 *
 * 匿名访客与爬虫**一律不打**——`isAdmin` 只有在已登录时才可能为 true，
 * 未登录还去问一次是纯浪费（爬虫量远大于真人，见 CLAUDE.md 里的额度事故）。
 */
export function isAdminLookupNeeded(user: SessionUser | null): boolean {
  return Boolean(user);
}

/**
 * 这次查询结果能不能算在**当前用户**头上。
 *
 * 三类情况一律否掉：
 *   - 还没查到人（`loading`，登出后也是 null）；
 *   - 查询替的不是当前这个人（登出或换人后飞回来的旧响应）；
 *   - 返回体不是布尔 `true`（接口被中间层改坏时 fail closed，不能因为 truthy 就放行）。
 *
 * 调用方不处理错误：查询失败时根本没有 lookup 可传，结果同样是 false。
 */
export function resolveIsAdmin(user: SessionUser | null, lookup: AdminLookup | null | undefined): boolean {
  if (!user || !lookup || lookup.userId !== user.id) {
    return false;
  }

  return lookup.isAdmin === true;
}
