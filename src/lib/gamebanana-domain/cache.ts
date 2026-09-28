import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

/**
 * `/gamebanana` 公开读缓存的 tag 与失效入口。
 *
 * 与 `src/lib/mod-cache.ts` 分开、而不是塞进那个对象里：那个模块管的是 `mods` 表
 * 那一套（分片、角色列表、详情），两者的失效范围完全不同 ——
 * 混在一起会让「一次 mod 互动要不要清 banana 缓存」这种问题反复被重新讨论。
 */

export const gamebananaCacheTags = {
  /** 列表（`unstable_cache` 的 gamebanana-mods） */
  list: "gamebanana",
  /**
   * 远程兜底快照（COS）的缓存条目，见 src/lib/gamebanana-domain/snapshot.ts。
   *
   * 网关被锁时它是 `/gamebanana` 唯一的数据源，所以写库脚本发完新对象后必须清掉它 ——
   * 否则要等满 1 小时 TTL 才生效。
   */
  snapshot: "gamebanana:snapshot",
} as const;

/**
 * 写入 `gamebanana_mods` 之后失效（`/api/revalidate` 会调它）。
 *
 * ⚠️ 此前这个接口只清 `mods` 那一套 tag，**清不到 `/gamebanana`**：同步脚本
 * 收尾 ping 了、缓存却没失效，新同步的内容要等满 6 小时 TTL 才出现。
 * 这个缺口是补这一份快照时才发现的 —— 加了 `snapshot` tag 却不失效，
 * 等于「上传成功了但前台永远读不到」，与快照机制自身的那个坑同形。
 */
export function revalidateGamebananaCaches() {
  revalidateTag(gamebananaCacheTags.list, "default");
  revalidateTag(gamebananaCacheTags.snapshot, "default");
  revalidatePath("/gamebanana");
}
