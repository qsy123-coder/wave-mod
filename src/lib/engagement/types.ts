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

/** 单个资源的四个互动计数（已含基线，见 store 里的 baseline 说明） */
export type EngagementCounts = {
  likes: number;
  favorites: number;
  views: number;
  /**
   * 下载次数的**旧展示口径**：当前浏览量 × 65% + 真实下载增量。
   * 2026-10-20 新增：以前只有「直链下载」会 +1、且写进 Supabase，
   * 而前台读的是快照，所以点夸克/迅雷永远显示 0。现在改为和其它计数一样实时累加。
   *
   * 2026-10-22 起发布的 mod 不再用这个值，改用 `downloadsReal` —— 见
   * ./downloads-policy.ts 的选择逻辑。
   */
  downloads: number;
  /**
   * 真实下载增量（只有点击，不含浏览量折算、也不含基线）。
   * 2026-10-22 及以后发布的 mod 用它作为展示值，从 0 开始涨。
   */
  downloadsReal: number;
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
  /**
   * 计数存储没读到/没写进（典型：Supabase 402、HK 服务超时），本次 counts 是基线兜底。
   *
   * 前端必须据此**跳过覆盖**：卡片首屏用的是服务端快照里的数，拿一份全是 0 的
   * 基线去覆盖它，用户看到的就是「数字突然没了」。2026-10-24 的事故正是这样。
   */
  degraded?: boolean;
};

export const engagementActions = ["like", "unlike", "favorite", "unfavorite", "view", "download"] as const;
export type EngagementAction = (typeof engagementActions)[number];

/**
 * 单次批量读取的 id 上限：够覆盖一页卡片（含抽屉里的推荐位），
 * 又不给服务端与响应体加压。前端超限要分批请求。
 */
export const ENGAGEMENT_MAX_IDS = 60;
