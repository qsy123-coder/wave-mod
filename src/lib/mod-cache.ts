import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

export const modCacheTags = {
  characters: "mods:characters",
  detail: (id: string) => `mods:detail:${id}`,
  list: "mods:list",
  /**
   * 远程兜底快照（COS）的缓存条目，见 src/lib/mods-domain/snapshot.ts。
   *
   * 网关被锁时它是前台唯一的数据源，所以写库脚本发完新对象后必须清掉它 ——
   * 否则要等满 1 小时 TTL 才生效，「上传完还得重新部署」的老问题会换个形式复发。
   */
  snapshot: "mods:snapshot",
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
  // 正常时期（Supabase 通）这条缓存条目根本不会被读，清它零代价；
  // 网关被锁时它就是前台的全部内容，必须跟着失效。
  //
  // ⚠️ 顺序上有讲究：脚本必须**先**把新快照传到 COS、**再** ping 这个接口。
  // 反过来的话，ping 之后第一个走到回退的请求会把 COS 上的旧对象重新拉下来
  // 缓存一整个 TTL，新内容反而比不 ping 更晚可见。
  revalidateTag(modCacheTags.snapshot, "default");
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
 *
 * ⚠️ 连 `/mods/<id>` 也不再 revalidatePath 了（2026-09-24）。`/mods` 与 `/mods/<id>`
 * 现在是 ISR 路由，而它们 HTML 里的计数**正是**上面那份刻意不清的分片缓存 ——
 * 重建一遍只会拿同一份旧计数重渲染，白付一次全表重扫。抽屉和详情页的计数走
 * `/api/mods/[id]`（private, no-store）实时拉，本来就不依赖路由 HTML。
 *
 * 所以真正会变的只剩「我的收藏」的**成员**（收藏 / 取消收藏），也就只剩它需要失效。
 * 这里不写 revalidateTag(modCacheTags.detail(modId))：那个 tag 目前没有任何缓存条目
 * 挂载，revalidateTag 它是空操作。哪天给详情页加了 unstable_cache，要回来补上。
 */
export function revalidateModEngagementCaches() {
  revalidatePath("/favorites");
}

/** 刷新指定创作者的 Profile 页缓存（上传/编辑 MOD 后调用） */
export function revalidateCreatorProfileCache(userId: string) {
  revalidateTag(`creator:profile:${userId}`, "default");
}
