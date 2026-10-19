/**
 * 游客互动（点赞 / 浏览 / 收藏）的共享契约。
 *
 * 这个模块**必须保持客户端可导入**：前端要靠它拿到类型与上限常量。
 * 服务端专有的落盘逻辑在 ./store（带 `server-only`），别从这里 re-export。
 *
 * ⚠️ **这里不能 import zod**：本模块会被 `./client`（客户端）引用，
 * 只要有一个 zod 的运行时 import，整个 zod（压缩后约 63KB）就会进每个页面的
 * 客户端包 —— 2026-10-16 实测首页就是这样被拖进去的。
 * 校验 schema 全部放在 `./schemas`，只给 API route 用。
 */

/** 单个资源的三个互动计数（已含基线，见 store 里的 baseline 说明） */
export type EngagementCounts = {
  likes: number;
  favorites: number;
  views: number;
};

/** 当前设备对某个资源的互动状态 */
export type EngagementMine = {
  liked: boolean;
  favorited: boolean;
};

/** 批量读/写接口的统一返回形状（只有服务端用得到） */
export type EngagementReadResult = {
  counts: Record<string, EngagementCounts>;
  mine: Record<string, EngagementMine>;
};

export const engagementActions = ["like", "unlike", "favorite", "unfavorite", "view"] as const;
export type EngagementAction = (typeof engagementActions)[number];

/**
 * 单次批量读取的 id 上限：够覆盖一页卡片（含抽屉里的推荐位），
 * 又不给服务端与响应体加压。前端超限要分批请求。
 */
export const ENGAGEMENT_MAX_IDS = 60;
