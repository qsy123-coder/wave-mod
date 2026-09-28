import "server-only";

import { gamebananaCacheTags } from "@/lib/gamebanana-domain/cache";
import { createSnapshotLoader } from "@/lib/snapshot/loader";

/**
 * `gamebanana_mods` 表的兜底快照。
 *
 * 读取逻辑（远程 COS 优先 → 打包内文件 → 空数组、失败冷却、内容 memo、
 * 「只缓存输入不缓存输出」的不变量）都在 `src/lib/snapshot/loader.ts`，
 * 与 `mods` 那份共用实现。本文件只声明**这一份快照**的身份。
 *
 * ## 为什么要有第二份快照
 *
 * 网关被锁（`exceed_egress_quota` → REST/Auth 全站 402）时，`/gamebanana` 原本会
 * 退化成空列表 —— 前台显示「当前筛选条件下没有搬运内容」，**静默地像个空库**，
 * 而同一时刻首页和 `/mods` 靠它们自己的快照照常显示内容，两边的反差本身就是误导。
 *
 * 但**不能**把它塞进 `mods` 那份快照：那份的列清单是 `mods` 的形状，而且
 * 桌面端 JASM 共用同一个产物（见 docs 里的相关记录），往共享快照里加一张表
 * 会连它一起改。所以这里是**独立的对象键 + 独立的打包内文件**，
 * `mods` 那份一个字节都不动。
 *
 * ## 列清单：刻意不含 description
 *
 * 见 scripts/gamebanana-snapshot.sql 的注释 —— 它是这份 payload 里最大的一块
 * （实测 288 行：含它 142KB gz，不含它 33KB），而详情页**本来就不渲染它**
 * （PRD AC 128 未开），所以排除它今天零代价。
 */

/**
 * 快照在 COS 上的对象键。
 *
 * ⚠️ 真源有两份（本文件 + scripts/gamebanana-snapshot.mjs）—— scripts 无法 import TS。
 * 改一处必须同步另一处，snapshot.test.ts 有用例比对这两个字符串。
 */
export const GAMEBANANA_SNAPSHOT_OBJECT_KEY = "snapshots/gamebanana-snapshot.json.gz";

const gamebananaSnapshot = createSnapshotLoader({
  objectKey: GAMEBANANA_SNAPSHOT_OBJECT_KEY,
  bundledFile: "gamebanana-snapshot.json.gz",
  cacheKey: "gamebanana-snapshot",
  tag: gamebananaCacheTags.snapshot,
  label: "[gamebanana]",
});

/**
 * 取快照里的**原始行**（形状 = scripts/gamebanana-snapshot.sql 导出的那些列）。
 *
 * 与 `mods` 那份不同，这里**不按 game_key 过滤** —— 这张表整个就是鸣潮，
 * 没有第二个游戏要区分（game_key 是 `mods` 表的概念，本表连这一列都没有）。
 *
 * 返回的不是领域对象：列表路径交给 `mapGamebananaMod`、详情路径交给
 * `mapGamebananaModDetail`，不能直接塞给筛选/排序函数。
 */
export async function getGamebananaSnapshotRows(): Promise<Record<string, unknown>[]> {
  return gamebananaSnapshot.loadRows();
}
