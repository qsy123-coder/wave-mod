import { NextRequest, NextResponse } from "next/server";

import { getPublicModById } from "@/lib/mods";

/**
 * ⚠️ 这个响应里**有 per-user 状态**：`getPublicModById` 会把
 * `getViewerModState(id)`（当前用户是否点过赞 / 收藏过 / 打了几分）合并进来。
 *
 * 所以它必须 `private, no-store`，**绝不能**带 `s-maxage`：一旦被任何共享缓存存下，
 * 一个登录用户的 `isLiked: true` 就会发给所有人。
 * 这一点和 `/api/mods`（公开列表，可以 public + s-maxage）正好相反，别互相抄。
 *
 * 显式写 `dynamic`：本路由读认证 cookie，本来就不可能静态化，写出来是防止以后
 * 有人加 `revalidate` 之类的配置时静默改变语义。
 */
export const dynamic = "force-dynamic";

const NO_STORE = "private, no-store, max-age=0";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const mod = await getPublicModById(id);

  if (!mod) {
    // 404 也带 no-store：网关抖动时可能短暂回 not_found，被缓存住会让这个 mod
    // 在缓存 TTL 内一直「不存在」。
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": NO_STORE } });
  }

  return NextResponse.json(mod, { headers: { "Cache-Control": NO_STORE } });
}
