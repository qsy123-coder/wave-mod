import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

export const modCacheTags = {
  characters: "mods:characters",
  detail: (id: string) => `mods:detail:${id}`,
  list: "mods:list",
} as const;

/**
 * 内容写入（新增 / 编辑 / 上下架 / 删除）后失效。
 *
 * 这些操作会改变列表的**成员**，所以必须连分片缓存一起清 —— 只 revalidatePath
 * 是不够的：路由本身是按需渲染的动态路由，清掉它下次还是会命中没变的 unstable_cache。
 */
export function revalidatePublicModCaches(modId?: string) {
  revalidateTag(modCacheTags.characters, "default");
  revalidateTag(modCacheTags.list, "default");
  revalidateTag("creators:ranking", "default");

  if (modId) {
    revalidateTag(modCacheTags.detail(modId), "default");
    revalidatePath(`/mods/${modId}`);
  }

  revalidatePath("/");
  revalidatePath("/mods");
}

/**
 * 用户互动（点赞 / 收藏 / 评分 / 评论）后的失效范围。
 *
 * 刻意**不**碰 modCacheTags.list 和 characters。这两个是全站仅有的 unstable_cache
 * 条目（src/lib/mods-domain/public.ts），其中 list 的分片是整个已发布表按 500 行
 * 切出来的 —— 一次 revalidateTag(list) 会让下一次任意页面的访问重扫全表
 * （约 5.5MB 出口）。而互动只改单个 mod 的计数、不改列表成员，为此付一次全表
 * 重扫是纯浪费，TTL 涨到 1 小时之后更是每次互动都把这 1 小时白省一遍。
 *
 * 代价：列表卡片上的点赞 / 评论 / 收藏计数最多滞后一个 TTL。详情页不受影响。
 */
export function revalidateModEngagementCaches(modId: string) {
  // 详情页与评论区都是按需渲染的动态路由，revalidatePath 足够让它们下次重查。
  //
  // 这里不写 revalidateTag(modCacheTags.detail(modId))：那个 tag —— 以及
  // "creators:ranking" —— 目前没有任何缓存条目挂载，revalidateTag 它们是空操作。
  // 哪天给详情页加了 unstable_cache，要回来这里补上。
  revalidatePath(`/mods/${modId}`);
}

/** 刷新指定创作者的 Profile 页缓存（上传/编辑 MOD 后调用） */
export function revalidateCreatorProfileCache(userId: string) {
  revalidateTag(`creator:profile:${userId}`, "default");
}
