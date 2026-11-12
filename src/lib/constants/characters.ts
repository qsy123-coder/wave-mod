/**
 * 角色名单的旧入口（转发到 `character-registry.ts`）。
 *
 * 真正的清单在 `character-registry.ts` —— 加角色改那里，不要在这里加。
 * 保留本文件名是因为 6 个文件按这个路径 import；合并成单一源头后它们自动跟随。
 */
export {
  characters,
  defaultCharacterSuggestions,
  defaultModVersion,
  defaultGameVersion,
} from "@/lib/constants/character-registry";
