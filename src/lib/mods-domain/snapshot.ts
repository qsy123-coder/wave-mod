import "server-only";

import { modCacheTags } from "@/lib/mod-cache";
import { createSnapshotLoader } from "@/lib/snapshot/loader";

/**
 * `mods` 表的兜底快照（网关被锁时前台唯一的真实数据来源）。
 *
 * 读取逻辑（远程 COS 优先 → 打包内文件 → 空数组、失败冷却、内容 memo、
 * 「只缓存输入不缓存输出」的不变量）都在 `src/lib/snapshot/loader.ts`，
 * 那是与 `gamebanana` 那份共用的实现。本文件只声明**这一份快照**的身份：
 * 对象键、打包内文件名、缓存键与 tag。
 *
 * 导出的行由 scripts/mods-snapshot.sql 产出，列清单与那边同步维护。
 *
 * ## 两条与线上列表路径刻意的差异（改 SQL 前务必先看）
 *
 * 1. **不含 `xxmi_install_guide`**：该列全库只有 2 个近似取值（就是
 *    install-guide.ts 里的静态文本，只差一个换行），却占 payload 约 24%
 *    （实测每次整表扫省 1,384,698 字节 ≈ 1.32 MiB）。导出时不带该列，
 *    由 mapMod 统一回填默认常量 —— 与线上列表路径的口径一致。
 *    代价：网关被锁期间，若某条 mod 的安装说明被后台自定义过，详情页会显示默认文本。
 *    全库当前没有这种行，且属于降级期可接受的损失。
 *    （线上详情页用 publicModDetailColumns，多带这一列，好让后台自定义值生效。）
 * 2. **含 `featured_order`**：publicModColumns 里没有它，但 mapMod 要读，
 *    线上的 getFeaturedMods 也是单独 append 这一列。缺了它首页轮播排序失效。
 */

/**
 * 快照在 COS 上的对象键。
 *
 * ⚠️ 真源有两份（本文件 + scripts/mods-snapshot-export.mjs）—— scripts 无法 import TS，
 * 与 scripts/mods-snapshot.sql 的情况一样。改一处必须同步另一处，
 * snapshot.test.ts 有用例比对这两个字符串。
 */
export const SNAPSHOT_OBJECT_KEY = "snapshots/mods-snapshot.json.gz";

const modsSnapshot = createSnapshotLoader({
  objectKey: SNAPSHOT_OBJECT_KEY,
  bundledFile: "mods-snapshot.json.gz",
  cacheKey: "mods-snapshot",
  tag: modCacheTags.snapshot,
  label: "[mods]",
});

/**
 * 取快照中某游戏的已发布**原始行**（形状 = Supabase 按 publicModColumns 返回的那种）。
 *
 * 注意：返回的不是领域对象。`getCachedModShard` 缓存的是 mapMod **之后**的结果，
 * 这里是它的输入形状而不是输出形状 —— 调用方必须自己交给 mapMod 处理，
 * 不能直接塞给 applyModQueryFilters。
 */
export async function getSnapshotRows(gameKey: string): Promise<Record<string, unknown>[]> {
  const rows = await modsSnapshot.loadRows();
  return rows.filter((row) => row.game_key === gameKey);
}
