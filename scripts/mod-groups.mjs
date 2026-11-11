/**
 * `.mod-groups.json` 的读写。
 *
 * 文件放在日期目录根下（与「分享结果导出-*.csv」同级），命名工坊落盘时写、每日上传
 * 脚本读。清单只用于把同一 GameBanana 帖子的多个附件合并成一张卡；文件缺失/损坏时
 * 上传脚本必须按旧逻辑继续，绝不能让整批上传失败。
 */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MOD_GROUPS_FILE, mergeModGroups, normalizeManifest } from "./mod-groups-pure.mjs";

export function modGroupsPath(dateDir) {
  return join(dateDir, MOD_GROUPS_FILE);
}

/** 读清单；坏 JSON/结构不对都当作「没有清单」并打一行警告 */
export function readModGroupsFile(dateDir, { warn = true } = {}) {
  const path = modGroupsPath(dateDir);
  if (!existsSync(path)) return null;
  try {
    return normalizeManifest(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    if (warn) console.warn(`   ⚠️ 无法读取 ${MOD_GROUPS_FILE}（按旧逻辑处理）: ${err.message}`);
    return null;
  }
}

/** 合并旧清单 + 本批分组，返回要落盘的文本；没有有效分组时返回 null */
export function buildModGroupsFileContent(existing, incoming, nowIso = new Date().toISOString()) {
  const merged = mergeModGroups(existing, incoming, nowIso);
  return merged ? `${JSON.stringify(merged, null, 2)}\n` : null;
}

/**
 * 原子写：同目录临时文件 + rename。
 * NTFS 上同卷 rename 是原子的，不会让上传脚本读到半截 JSON。
 */
export function writeModGroupsFileAtomic(path, content) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, "utf8");
  try {
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // 临时文件清理失败不掩盖原始错误
    }
    throw err;
  }
}

/** 撤销用：写回旧内容；content 为 null 表示本批之前没有清单，删除即可 */
export function restoreModGroupsFile(path, content) {
  if (content === null || content === undefined) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  writeModGroupsFileAtomic(path, content);
}
