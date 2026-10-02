import { z } from "zod";

import { characterImageMap } from "@/lib/constants/character-images";
import { hasPreviewImage } from "@/lib/mods-domain/preview-image";
import type { ModSort, PublicModsFilters, SiteMod } from "@/lib/mods-domain/types";

export const modIdSchema = z.uuid();
export const modSortSchema = z.enum(["default", "latest", "favorites", "rating", "hot"]);

export function calculateHotScore(mod: Pick<SiteMod, "views" | "downloads" | "favorites" | "likes" | "commentsCount" | "ratingCount" | "ratingAverage">) {
  return mod.views * 0.08 + mod.downloads * 5 + mod.favorites * 4 + mod.likes * 3 + mod.commentsCount * 5 + mod.ratingCount * 2 + mod.ratingAverage * 18;
}

export function applyModSort(sort: Exclude<ModSort, "hot">) {
  return (mods: SiteMod[]) => {
    if (sort === "default") {
      return mods
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    }

    if (sort === "favorites") {
      return mods
        .slice()
        .sort((a, b) => b.favorites - a.favorites || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    if (sort === "rating") {
      return mods
        .slice()
        .sort((a, b) => b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    return mods.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  };
}

export function sortModsByHot(mods: SiteMod[]) {
  return mods
    .slice()
    .sort((a, b) => calculateHotScore(b) - calculateHotScore(a) || b.ratingAverage - a.ratingAverage || b.views - a.views || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * 推荐 mod 排序：featuredOrder 升序（null/undefined 排最后），
 * 无顺序或顺序相同时按 created_at 倒序兜底。
 */
export function sortFeaturedModsByOrder<T extends { featuredOrder?: number | null; createdAt: string }>(mods: T[]): T[] {
  return mods.slice().sort((a, b) => {
    const ao = a.featuredOrder ?? null;
    const bo = b.featuredOrder ?? null;
    if (ao !== null && bo !== null && ao !== bo) {
      return ao - bo;
    }
    if (ao !== null && bo === null) return -1;
    if (ao === null && bo !== null) return 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

/** 前台轮播图最多展示的推荐数量；拖拽排序时前 N 位进入轮播，其余为「待轮播」 */
export const MAX_CAROUSEL_SLOTS = 6;

/**
 * 把有序 id 列表映射为 featured_order：前 maxSlots 个依次 1..maxSlots，
 * 其余为 null（「待轮播」：已推荐但暂不进轮播图）。
 */
export function buildFeaturedOrderMap(ids: string[], maxSlots: number): Array<{ id: string; featuredOrder: number | null }> {
  return ids.map((id, index) => ({
    id,
    featuredOrder: index < maxSlots ? index + 1 : null,
  }));
}

/**
 * 「含直链」「含预览图」这两个开关。
 *
 * 必须在**服务端**过滤（这里是唯一的收口），不能放到客户端卡片列表上做：全库只有
 * 个位数条直链 mod，客户端只拿得到已加载的那几十条，翻不到它们 —— 表现为「勾了
 * 含直链，一条都没有」（2026-09-22 用户报告）。挂在 URL 上由服务端过滤，还能顺带
 * 让总数（共 N 个 MOD）准确。
 */
/** query 命中信息：hits = 命中的关键词个数；weight = 各命中关键词最高字段权重之和 */
export type ModQueryRank = { hits: number; weight: number };

/**
 * 命中字段的权重。标题里写着关键词的，比描述里顺带提一句的更该排在前面。
 * 数组顺序必须与 `modQueryFields` 的取字段顺序一致。
 */
const QUERY_FIELD_WEIGHTS = [3, 2, 1, 1] as const; // title / character / description / 网盘平台名

/** 一条 mod 参与匹配的四个字段（顺序与 QUERY_FIELD_WEIGHTS 对齐，值为小写） */
function modQueryFields(mod: SiteMod): string[] {
  return [mod.title, mod.character, mod.description, mod.driveLinks.map((d) => d.platform).join(" ")].map((value) =>
    (value ?? "").toLowerCase(),
  );
}

export function parseQueryKeywords(query: string | undefined): string[] {
  return (
    query
      ?.split(/[,，\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

/**
 * 站内标准角色名，**从既有的头像映射表派生**，不新建一份手写清单。
 *
 * `scripts/upload-daily-by-date.mjs` 的头部注释专门警告过「前缀表两处维护」这个坑，
 * 这里不能再造第三份。含逗号的 key（`滑翔翼,翱翔翼,科考摩托`）是历史别名串、不是
 * 一个角色名，排除掉。
 *
 * 长者优先排序：`爱弥斯的机甲` 必须比 `爱弥斯` 先匹配上，否则「爱弥斯的机甲」会被
 * 切成 `[爱弥斯, 的机甲]`。
 */
const KNOWN_CHARACTER_NAMES = Object.keys(characterImageMap)
  .filter((name) => name.length >= 2 && !name.includes(","))
  .sort((a, b) => b.length - a.length);

/**
 * 放宽解析用的宽分隔符。中文用户不打空格，标题里却常写「爱弥斯-誓约」，
 * 用 `-` 输入的「千咲-皮肤」在严格解析下是一个词 ⇒ 一条都搜不到。
 */
const LOOSE_SEPARATOR = /[,，\s\-_—–·、。.:：;；!！?？/\\|+*&^%$#@~()（）\[\]【】{}<>《》'"]+/;

/** 两个等长串是否只差一个字符（允许一次替换错：米/弥、艾/爱 这类打错） */
function differsByOneChar(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      diff += 1;
      if (diff > 1) return false;
    }
  }
  return true;
}

/**
 * 三等字以下的角色名允许「一个字打错」（爱米斯 → 爱弥斯）。
 *
 * 二字名**故意不放开**：一个字的差异就占了整串的一半，信号太弱 —— 「白止」能对上
 * 「白芷」，那随便一个二字词都可能对到某个角色上。三字及以上时，一个字之差只占
 * 三分之一，才谈得上"像是打错了"。
 */
const FUZZY_MIN_NAME_LENGTH = 3;

/** 把已知角色名从词首认出来并切开：「爱弥斯誓约」→ [`爱弥斯`, `誓约`]；「爱米斯fjslf」→ [`爱弥斯`, `fjslf`] */
function splitKnownPrefix(token: string): string[] {
  for (const name of KNOWN_CHARACTER_NAMES) {
    const lower = name.toLowerCase();
    const fuzzable = lower.length >= FUZZY_MIN_NAME_LENGTH;

    // 整个词就是角色名（含一个字打错）⇒ 归一到标准名，没有余下部分
    if (token.length === lower.length) {
      if (token === lower || (fuzzable && differsByOneChar(token, lower))) return [lower];
      continue;
    }

    // 比角色名长：认词首，余下部分另成一个词。等长时已经处理过，所以这里必然有余下部分
    if (token.length > lower.length) {
      const prefix = token.slice(0, lower.length);
      if (prefix === lower || (fuzzable && differsByOneChar(prefix, lower))) {
        return [lower, token.slice(lower.length)];
      }
    }
  }

  return [token];
}

/**
 * 放宽解析：宽分隔符切一遍，再把每个词按「已知角色名前缀」切开。
 *
 * 只在严格解析**一条都没搜到**时才会被调用（见 applyModQueryFilters 的 pass 2），
 * 所以它怎么拆都影响不到任何现在能搜出结果的查询。
 */
export function looseSplitQuery(query: string): string[] {
  return query
    .split(LOOSE_SEPARATOR)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .flatMap(splitKnownPrefix);
}

/**
 * 按一组关键词扫一遍，**同时**算出全命中（AND）与命中任一（OR）两个集合。
 *
 * 一次遍历而不是两趟：整表 filter 不缓存（见 public.ts 里 getAllPublishedMods 的注释），
 * 分两趟扫等于把每次查询最贵的那部分成本翻倍。
 */
function matchModsByKeywords<T extends SiteMod>(
  mods: T[],
  keywords: string[],
): { all: T[]; any: T[]; ranks: Map<string, ModQueryRank> } {
  const all: T[] = [];
  const any: T[] = [];
  const ranks = new Map<string, ModQueryRank>();

  for (const mod of mods) {
    const fields = modQueryFields(mod);

    let hits = 0;
    let weight = 0;
    for (const keyword of keywords) {
      // 同一关键词命中多个字段只取最高权重（标题命中不必因为描述里也提到而重复加分）
      let bestWeight = 0;
      for (let i = 0; i < fields.length; i += 1) {
        if (fields[i].includes(keyword) && QUERY_FIELD_WEIGHTS[i] > bestWeight) {
          bestWeight = QUERY_FIELD_WEIGHTS[i];
        }
      }
      if (bestWeight > 0) {
        hits += 1;
        weight += bestWeight;
      }
    }

    if (hits === 0) continue;

    ranks.set(mod.id, { hits, weight });
    (hits === keywords.length ? all : any).push(mod);
  }

  return { all, any, ranks };
}

/**
 * 关键词匹配 + 相关度打分。
 *
 * 两段式：pass 1 用严格解析（只认 `[,，\s]`），AND 优先、0 结果才放宽为 OR；
 * 仍然一条都没有时，pass 2 换宽分隔符 + 角色名前缀拆词再试一次。
 *
 * `relaxQuery` 默认 false ⇒ 调用方不显式打开时行为与改动前**完全一致**（只有 AND，
 * 且 pass 2 根本不会跑）。放宽是「0 结果」这一个场景的补救，不该悄悄改变别人对这套
 * 匹配的预期。
 */
export function applyModQueryFilters<T extends SiteMod>(
  mods: T[],
  filters: Pick<PublicModsFilters, "character" | "query" | "direct" | "preview">,
  options: { relaxQuery?: boolean } = {},
): { mods: T[]; queryRanks: Map<string, ModQueryRank>; relaxed: boolean } {
  let nextMods: T[] = mods;

  // 非角色分类名，用于 Skins 筛选时排除
  const NON_CHARACTER_CATEGORIES = new Set(["Skins", "UI", "Other/Misc"]);

  if (filters.character) {
    if (filters.character === "Skins") {
      // Skins 分类 = 展示所有角色 MOD，排除 UI / Other/Misc 等非角色分类
      nextMods = nextMods.filter((mod) => !NON_CHARACTER_CATEGORIES.has(normalizeCharacterName(mod.character ?? "")));
    } else {
      nextMods = nextMods.filter((mod) => normalizeCharacterName(mod.character ?? "") === filters.character);
    }
  }

  // 三个布尔开关先过：它们比关键词匹配便宜，先把集合收窄，下面那趟最贵的扫描就能少扫一些。
  // 都是纯谓词，与原来「先 query 后开关」的顺序在结果上完全等价。
  if (filters.direct) {
    // 直链 = download_url（卡片上那个绿色「直链下载」角标），不是网盘链接
    nextMods = nextMods.filter((mod) => Boolean(mod.downloadUrl));
  }

  if (filters.preview) {
    nextMods = nextMods.filter((mod) => hasPreviewImage(mod.images));
  }

  const keywords = parseQueryKeywords(filters.query);
  let queryRanks = new Map<string, ModQueryRank>();
  let relaxed = false;

  if (keywords.length > 0) {
    // ---- pass 1：严格解析（只认 [,，\s]）----
    const strict = matchModsByKeywords(nextMods, keywords);

    if (strict.all.length > 0) {
      nextMods = strict.all;
      queryRanks = strict.ranks;
    } else if (options.relaxQuery && strict.any.length > 0) {
      // 一个都全中才放宽：只要有一个精确命中，就绝不混入部分命中的结果
      nextMods = strict.any;
      queryRanks = strict.ranks;
      relaxed = true;
    } else if (options.relaxQuery) {
      // ---- pass 2：换一种拆法再试 ----
      //
      // 只在 pass 1 **一条都没有**时跑。要救的是中文连写：「爱弥斯誓约」在严格解析下
      // 是**一个**词，而单词时 AND 集与 OR 集完全相同 ⇒ 「AND 为空」必然「OR 也为空」，
      // 放宽机制根本没有可放宽的余地。分词的失败发生在放宽的上游，所以得先把词切开。
      //
      // ⚠️ 这是**第二趟全表遍历**，与 PRD「不得让遍历翻倍」的硬要求是有意破例：
      // 常态查询在 pass 1 就返回了、永远不会走到这里；只有本来毫无产出的 0 结果查询
      // 才多付这一趟，换回结果。该约束的原意是「别让常规路径翻倍」，不是「任何情况下
      // 都不许第二趟」。
      const looseKeywords = looseSplitQuery(filters.query ?? "");
      const sameAsStrict =
        looseKeywords.length === keywords.length && looseKeywords.every((k, i) => k === keywords[i]);

      if (!sameAsStrict) {
        const loose = matchModsByKeywords(nextMods, looseKeywords);

        if (loose.all.length > 0) {
          nextMods = loose.all;
          queryRanks = loose.ranks;
          relaxed = true;
        } else if (loose.any.length > 0) {
          nextMods = loose.any;
          queryRanks = loose.ranks;
          relaxed = true;
        } else {
          nextMods = [];
        }
      } else {
        // 拆不开（如「千咲女仆」在严格解析下已经就是两个词）：别白扫第二趟
        nextMods = [];
      }
    } else {
      nextMods = [];
    }

    // 空结果没有排序可言，别让 rankModsByQuery 白跑
    if (nextMods.length === 0) queryRanks.clear();
  }

  return { mods: nextMods, queryRanks, relaxed };
}

/**
 * 按 query 相关度重排：`hits`（仅放宽时参与）降序 → `weight` 降序 → **保持传入顺序**。
 *
 * 传给它的数组应当**已经按用户选择的 sort 排好**，于是「相等返回 0」这一条就实现了
 * 「相关度为主、用户排序为次」—— 依赖 Array.prototype.sort 的稳定性（ES2019 起保证）。
 * 反过来先按相关度排再按 sort 排是错的：第二趟会把相关度完全覆盖掉。
 *
 * AND 路径下所有条目的 `hits` 相同，第一个键恒为常数，字段权重自然主导。
 */
export function rankModsByQuery<T extends SiteMod>(mods: T[], queryRanks: Map<string, ModQueryRank>, relaxed: boolean): T[] {
  if (queryRanks.size === 0) return mods;

  return mods.slice().sort((a, b) => {
    const rankA = queryRanks.get(a.id);
    const rankB = queryRanks.get(b.id);
    if (!rankA || !rankB) return 0;

    if (relaxed && rankB.hits !== rankA.hits) return rankB.hits - rankA.hits;
    return rankB.weight - rankA.weight;
  });
}

export function parseModSort(sort: string | undefined): ModSort {
  return modSortSchema.safeParse(sort).data ?? "latest";
}

export function parseCharacterFilter(character: string | undefined) {
  const value = character?.trim();
  return value ? value : undefined;
}

export function parseModQuery(query: string | undefined) {
  const value = query?.trim();
  return value ? value : undefined;
}

/**
 * URL 上的开关（?direct=1 / ?preview=1）。
 * 只认 "1" 与 "true"，其余一律当没开 —— 这样链接里写不写、写成什么都不影响判等
 * （判等见 navigation-url.ts），拼链接那边固定写 "1"。
 */
export function parseModFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function normalizeCharacterName(value: string) {
  // 角色名别名映射：规范化数据库中的变体名到标准名
  const CHARACTER_ALIASES: Record<string, string> = {
    "陆赫斯": "路赫斯",
    "反虚化，ui界面，场景，葫芦，特效等": "UI",
    "千咲皮肤[蜜桃冰]": "千咲",
    "科考摩托": "滑翔翼,翱翔翼,科考摩托",
    // 文件名常用简称「心-」写 心月狐（2026-10-02 批次，预览图确认同一角色）。
    // 与 scripts/upload-daily-by-date.mjs 的 CHARACTER_ALIASES 同步。
    "心": "心月狐",
  };
  const trimmed = value.trim();
  return CHARACTER_ALIASES[trimmed] ?? trimmed;
}

export function isMissingTableError(message: string) {
  return message.includes("Could not find the table 'public.likes'") || message.includes("relation \"public.likes\" does not exist");
}

export function isAbortErrorMessage(message: string) {
  return message.toLowerCase().includes("aborterror") || message.toLowerCase().includes("operation was aborted");
}
