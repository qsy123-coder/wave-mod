import { Crown, Download, Flame, Grid3X3, Users } from "lucide-react";

import type { GameConfig } from "@/config/games";
import type { ModSort, SiteMod } from "@/lib/mods";

export const zenlessSortOptions: { label: string; value: ModSort }[] = [
  { label: "热门趋势", value: "hot" },
  { label: "最多下载", value: "favorites" },
  { label: "最高评分", value: "rating" },
  { label: "最新发布", value: "latest" },
];

export const zenlessAgents = ["全部 MOD", "星见雅", "艾莲", "妮可", "安比", "朱鸢", "青衣"] as const;
export const zenlessTags = ["女性", "男性", "服装", "武器", "动漫", "写实", "SFW", "贴合原作"] as const;

export const zenlessDisplayMods = [
  ["星见雅", "星见雅 · 霜刃行动套装", "热门", "角色"],
  ["艾莲", "艾莲 · 深海巡游外观", "热门", "服装"],
  ["莱卡恩", "莱卡恩 · 月影执事礼装", "趋势", "角色"],
  ["妮可", "妮可 · 狡兔屋霓虹制服", "新作", "服装"],
  ["安比", "安比 · 电光战术服", "热门", "角色"],
  ["11号", "11号 · 火线行动涂装", "趋势", "武器"],
  ["苍角", "苍角 · 冰蓝补给套装", "新作", "服装"],
  ["朱鸢", "朱鸢 · 治安局暗夜制服", "趋势", "角色"],
  ["青衣", "青衣 · 青霜巡逻外观", "热门", "角色"],
] as const;

export const zenlessCategories = [
  [Users, "代理人外观", "角色", "1,523"],
  [Crown, "服装皮肤", "皮肤", "986"],
  [Download, "武器替换", "武器", "652"],
  [Grid3X3, "UI 视觉", "UI", "412"],
  [Flame, "玩法增强", "玩法", "231"],
] as const;

export const zenlessCreators = ["NewEriduLab", "HollowWorks", "ProxyForge", "BunnyHouse", "Section6"] as const;

export function buildZenlessModsHref(game: GameConfig, sort: ModSort, character?: string, query?: string) {
  const params = new URLSearchParams();
  if (sort !== "hot") params.set("sort", sort);
  if (character) params.set("character", character);
  if (query) params.set("query", query);
  const queryString = params.toString();
  return queryString ? `${game.nav.mods}?${queryString}` : game.nav.mods;
}

export function getZenlessDisplayMod(index: number) {
  return zenlessDisplayMods[index % zenlessDisplayMods.length];
}

export function toZenlessDisplayMod(mod: SiteMod, index: number): SiteMod {
  const [character, title, tag] = getZenlessDisplayMod(index);
  return { ...mod, character, title, tags: [tag, "ZZZ", character], description: `${character} 主题绝区零 MOD，适合新艾利都分站预览、直链下载与 XXMI 安装流程。` };
}
