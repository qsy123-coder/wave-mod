/**
 * 库行 → 领域类型 的映射。**纯函数**，客户端组件要 import（`toSiteMod`）。
 */

import type { SiteMod } from "@/lib/mods-domain/types";
import type { Tables } from "@/types/supabase";

import type { GamebananaMod, GamebananaModDetail, GamebananaVisibility } from "@/lib/gamebanana-domain/types";

type GamebananaRow = Tables<"gamebanana_mods">;

/**
 * 列表查询**下发的列**对应的行：比整行少了三个详情页才用的长字段，外加 `images`。
 *
 * 为什么要显式建模：列表一次下发全库（当前 288 条，`--all` 后 3000+），而 `images`
 * 是每行最多 8 个 URL 的数组 —— 它是这一坨 JSON 里最大的一块，而卡片只渲染
 * `coverImage` 一张图。不把它排掉，等于每次进列表页都替详情页预取一遍相册。
 *
 * 用类型而不是「select 少写一列、代码里假装它存在」：后者在类型上仍然是
 * `string[]`，运行时却是 `undefined`，哪天有人拿 `.images.map()` 就会炸在线上。
 */
export type GamebananaListRow = Omit<
  GamebananaRow,
  "description" | "gb_root_category" | "gb_subcategory" | "images"
>;

/**
 * 列表查询下发的列清单，**必须与 `GamebananaListRow` 一致**（多一列浪费、少一列
 * 会在运行时拿到 undefined）。
 *
 * 放在这个纯模块里而不是 `public.ts`（那边有 `server-only`，测试里 import 不了）：
 * 单测要拿它当**流量防回归护栏** —— 谁把 `images`/`description` 加回来，测试就必须红。
 */
export const publicGamebananaColumns =
  "gb_id,title,character,author_name,author_url,cover_url,version,visibility," +
  "download_url,file_size,av_status,like_count,view_count,download_count,gb_created_at";

/** 站内 game_key。GameBanana 目前只搬鸣潮，保持与 `mods` 表同一个取值。 */
export const GAMEBANANA_GAME_KEY = "wuthering-waves";

/** 版本号缺失时的占位，与 `mods` 表的取值保持一致 */
const UNKNOWN_VERSION = "未标注";

/**
 * 可见性收窄。
 *
 * 库里那一列有 check 约束，但**外部数据的类型断言不能只依赖库约束**：
 * 万一将来约束被放宽或类型生成漂移，这里落回 `hide` 是最安全的一侧 ——
 * 宁可把一条正常 mod 多拦一次，也不要漏放行一条 NSFW。
 */
function toVisibility(v: string): GamebananaVisibility {
  return v === "show" || v === "warn" || v === "hide" ? v : "hide";
}

/** 库行 → 列表用领域对象。`images` 空数组即「这一份没下发相册」，详情页才带上。 */
export function mapGamebananaMod(row: GamebananaListRow): GamebananaMod {
  return {
    gbId: row.gb_id,
    title: row.title,
    character: row.character,
    authorName: row.author_name,
    authorUrl: row.author_url,
    coverImage: row.cover_url ?? "",
    images: [],
    version: row.version,
    visibility: toVisibility(row.visibility),
    downloadUrl: row.download_url,
    fileSize: row.file_size,
    avStatus: row.av_status,
    likeCount: row.like_count,
    viewCount: row.view_count,
    downloadCount: row.download_count,
    gbCreatedAt: row.gb_created_at,
  };
}

/** 库行 → 详情用领域对象：补回列表刻意不下的相册与长文本字段。 */
export function mapGamebananaModDetail(row: GamebananaRow): GamebananaModDetail {
  return {
    ...mapGamebananaMod(row),
    // 详情页是 `select("*")`，这里才真有相册
    images: row.images,
    // `?? null` 是给**兜底快照**那条路准备的：快照刻意不下发 description
    // （占 payload 最大一块，而详情页根本不渲染它，见 gamebanana-snapshot.sql），
    // 那时这里是 `undefined`。类型写的是 `string | null`，别让一个缺键冒充合法取值。
    description: row.description ?? null,
    gbRootCategory: row.gb_root_category,
    gbSubcategory: row.gb_subcategory,
  };
}

/**
 * 领域对象 → `SiteMod`，**为了复用站内现成的 `<ModCard>`**。
 *
 * 为什么合成而不是另写一张卡片：`ModCard` 已经内置了图片失败重试（指数退避 3 次）、
 * 占位图、标题 hover 展开、neo-brutalism 样式 —— 抄一份出来必然随时间与站内风格漂移。
 * 代价是 `SiteMod` 有一批这里没有对应数据的字段（收藏数、评分、评论数…），
 * 一律填 0 并在卡片上**关掉对应的展示位**，这样填的 0 不会渲染出来骗人。
 *
 * ⚠️ 因此调用方**必须**同时传这三个：
 * `showInteractionBar={false}`、`showRatingSticker={false}`、`showFavoriteButton={false}`。
 * 它们对应的控件写的是 `mods` / `favorites` 表，而这里的 `id` 是 GameBanana 的数字 id
 * （不是 uuid）、行也不在 `mods` 里 —— 点下去要么写库失败、要么把用户送去
 * `/auth/login?next=/mods/<数字id>` 这个不存在的页面。前两个是展示位、第三个是交互，
 * **少关一个的表现都是「点了没反应」**，很难在开发时注意到。
 */
export function toSiteMod(mod: GamebananaMod): SiteMod {
  return {
    character: mod.character,
    commentsCount: 0, // 没接评论
    coverImage: mod.coverImage,
    createdAt: mod.gbCreatedAt ?? "",
    description: "", // 列表不下发描述，卡片也不渲染它
    downloadUrl: mod.downloadUrl,
    downloads: mod.downloadCount,
    driveLinks: [], // 本表是单一外链，没有国内网盘
    favorites: 0, // 没接收藏
    gameKey: GAMEBANANA_GAME_KEY,
    gameVersion: UNKNOWN_VERSION,
    id: String(mod.gbId),
    images: mod.images,
    isFeatured: false, // 没有轮播位概念
    likes: mod.likeCount,
    modAuthorUrl: mod.authorUrl,
    // 平台判定的 hide 视为 NSFW，供卡片/详情做展示决策
    nsfw: mod.visibility === "hide",
    ratingAverage: 0,
    ratingCount: 0,
    title: mod.title,
    version: mod.version ?? UNKNOWN_VERSION,
    videoUrl: null,
    views: mod.viewCount,
    xxmiInstallGuide: "",
  };
}
