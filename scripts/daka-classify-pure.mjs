/**
 * 大卡分类的**纯函数部分**：无 IO、无 Node 内置模块，浏览器也能 import。
 *
 * 抽出来是为了让后台批量上传页面复用每日脚本的分类规则，
 * 同时不把 `psql-db.mjs`（依赖 node:child_process）带进客户端包。
 */

export const FLEURDELYS = "芙露德莉斯";
export const CARTETHYIA = "卡提希娅";

/** 「卡提希娅-大卡-XXX」→ 芙露德莉斯，title 只剥掉角色名这一层，保留「大卡-XXX」 */
export const DAKA_LEADER = "卡提希娅-";
const DAKA_MARK = "卡提希娅-大卡";

/** 大卡的武器：整包归芙露德莉斯，title 保留完整 key */
const DAKA_WEAPON_PREFIXES = ["大卡提希娅的剑", "大卡提希娅的武器"];

/**
 * 「这条 key 是大卡吗？」——是则返回 `{ character, title }`，不是则返回 `null`。
 * 小卡等非大卡 key 一律返回 null，交给调用方原有分支。
 */
export function resolveDakaIfApplicable(key) {
  const raw = String(key ?? "").trim();
  if (!raw) return null;

  for (const prefix of DAKA_WEAPON_PREFIXES) {
    if (raw.startsWith(prefix)) return { character: FLEURDELYS, title: raw };
  }

  if (raw.startsWith(DAKA_MARK)) {
    return { character: FLEURDELYS, title: raw.slice(DAKA_LEADER.length) };
  }

  return null;
}
