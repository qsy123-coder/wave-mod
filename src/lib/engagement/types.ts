import { z } from "zod";

/**
 * 游客互动（点赞 / 浏览 / 收藏）的共享契约。
 *
 * 这个模块**必须保持客户端可导入**：前端要靠它拿到类型与上限常量。
 * 服务端专有的落盘逻辑在 ./store（带 `server-only`），别从这里 re-export。
 */

/** 单个 MOD 的三个互动计数（已含基线，见 store 里的 baseline 说明） */
export type EngagementCounts = {
  likes: number;
  favorites: number;
  views: number;
};

/** 当前设备对某个 MOD 的互动状态 */
export type EngagementMine = {
  liked: boolean;
  favorited: boolean;
};

export const engagementActions = ["like", "unlike", "favorite", "unfavorite", "view"] as const;
export type EngagementAction = (typeof engagementActions)[number];

/**
 * 单次批量读取的 id 上限：够覆盖一页卡片（含抽屉里的推荐位），
 * 又不给服务端与响应体加压。前端超限要分批请求。
 */
export const ENGAGEMENT_MAX_IDS = 60;

export const engagementActionSchema = z.enum(engagementActions);

/**
 * 设备号：客户端生成的随机 UUID，**纯匿名去重键**，不含任何身份信息。
 * 服务端只用它判断「这台设备是否已经赞过/今天是否已浏览」，不做其它用途。
 */
export const deviceIdSchema = z
  .string()
  .trim()
  .min(8, "设备号过短")
  .max(64, "设备号过长")
  .regex(/^[A-Za-z0-9_-]+$/, "设备号格式不合法");

export const engagementWriteSchema = z.object({
  modId: z.uuid("无效的 MOD ID。"),
  action: engagementActionSchema,
});

/** `?ids=a,b,c` → 去空 + 上限校验 + UUID 校验 */
export const engagementIdsSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
  .refine((ids) => ids.length > 0, "至少需要一个 MOD ID")
  .refine((ids) => ids.length <= ENGAGEMENT_MAX_IDS, `单次最多查询 ${ENGAGEMENT_MAX_IDS} 个 MOD ID`)
  .refine((ids) => ids.every((id) => z.uuid().safeParse(id).success), "存在无效的 MOD ID");
