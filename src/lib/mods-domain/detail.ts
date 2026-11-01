import "server-only";

import { getPublicModBaseById } from "@/lib/mods-domain/public";

/**
 * 详情页数据。
 *
 * 登录已下线，不再合并 per-user 的收藏/点赞/评分状态（viewer state）；
 * 点赞与收藏由客户端 `useEngagement` 按设备号读取。
 */
export async function getPublicModById(id: string) {
  return getPublicModBaseById(id);
}
