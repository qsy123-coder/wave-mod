import type { ModComment, PaginatedResult } from "@/lib/mods-domain/types";

/**
 * 「评论取不到」和「真的没有评论」是两件事，但在 UI 上曾经长得一模一样。
 *
 * 背景（2026-09-21）：Supabase 网关被 restriction 期间，getModCommentsPage 出错时
 * 只记一条服务端日志、返回 200 空数组。前端拿到 response.ok === true，于是把
 * 「评论加载失败」原样显示成「还没有玩家发表评论」—— 用户以为库里就是空的。
 *
 * 这两个决定抽在这里，是因为 comments.ts 带 `import "server-only"`，
 * 测试里 import 不了，纯逻辑留在那儿就等于没测试。
 */

/** 评论首页/翻页的结果，比通用分页多一个降级标志。 */
export type CommentsPage = PaginatedResult<ModComment> & {
  /** 数据源不可用（如 Supabase 网关被 restriction）。为 true 时 items 为空不代表真的没有评论。 */
  degraded?: boolean;
};

/**
 * 取不到数据时必须用 503，不能用 200 + 空数组。
 *
 * 200 会让前端的 response.ok 变成 true，错误在到达 UI 之前就丢了 —— 这正是要修的病根。
 * 503（Service Unavailable）语义也对得上：数据源暂时不可用，稍后重试即可。
 */
export function resolveCommentsHttpStatus(page: Pick<CommentsPage, "degraded">): 200 | 503 {
  return page.degraded ? 503 : 200;
}

/** 评论区该显示什么。 */
export type CommentsViewState = "list" | "empty" | "unavailable";

export function resolveCommentsViewState(input: {
  /** 当前要渲染的评论条数（含乐观插入的） */
  itemCount: number;
  /** 请求失败，含服务端返回 503 */
  failed: boolean;
}): CommentsViewState {
  // 已经有内容时优先展示内容：一次翻页失败不该把用户已经看到的评论换成整块错误页
  if (input.itemCount > 0) {
    return "list";
  }

  return input.failed ? "unavailable" : "empty";
}
