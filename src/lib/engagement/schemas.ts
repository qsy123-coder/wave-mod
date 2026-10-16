import { z } from "zod";

import { ENGAGEMENT_MAX_IDS, engagementActions } from "./types";

/**
 * 互动接口的入参校验。**只在服务端（API route）用。**
 *
 * 为什么单独一个文件而不是塞进 `./types`：`./types` 被客户端（`./client`）引用，
 * 那里的任何 zod 运行时 import 都会把整个 zod 打进每个页面的客户端包
 * （2026-10-16 实测首页因此多下 63KB 压缩后的 zod）。
 */

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
  modId: z.uuid("无效的资源 ID。"),
  action: engagementActionSchema,
});

/** `?ids=a,b,c` → 去空 + 上限校验 + UUID 校验 */
export const engagementIdsSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
  .refine((ids) => ids.length > 0, "至少需要一个资源 ID")
  .refine((ids) => ids.length <= ENGAGEMENT_MAX_IDS, `单次最多查询 ${ENGAGEMENT_MAX_IDS} 个资源 ID`)
  .refine((ids) => ids.every((id) => z.uuid().safeParse(id).success), "存在无效的资源 ID");
