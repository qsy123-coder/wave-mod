/**
 * GameBanana 搬运 MOD 的领域类型。
 *
 * 与 `mods-domain/types.ts` 的 `SiteMod` **刻意分开**：两张表的语义不同
 * （`mods` 是国内网盘 + `drive_links` 数组，这里是单一外链 + 平台自带分级），
 * 合并成一个类型会让两边都变模糊（见 supabase/add_gamebanana_mods.sql 的立论）。
 *
 * 本文件必须保持**纯净**（只有类型），因为客户端组件要 `import type`。
 */

/** 列表页排序。口径与 URL 参数一一对应，见 filter-params.ts。 */
export type GamebananaSort = "latest" | "hot" | "views" | "downloads";

/**
 * GameBanana 自己的三级可见性分级。
 *
 * 采信平台的判定而不是自己猜 NSFW（实测 3057 条交叉验证过，见建表迁移的注释）：
 * - `show` 正常
 * - `warn` 需提示（去遮挡 / 暴露向）
 * - `hide` NSFW，默认不在列表出现，详情页需过内容分级提示
 */
export type GamebananaVisibility = "show" | "warn" | "hide";

/**
 * 一条 GameBanana MOD。
 *
 * 字段刻意只留**前台真的会渲染**的那些：详情页的长描述、AV 结果等放在详情查询里取，
 * 不塞进列表下发的那份（列表约 3000 行时每多一个字段都是白花的流量）。
 */
export type GamebananaMod = {
  /** GameBanana 的 `_idRow`，同时是库里的主键 */
  gbId: number;
  title: string;
  character: string;
  authorName: string | null;
  authorUrl: string | null;
  /** 首图（800 档），列表卡片用 */
  coverImage: string;
  /** 预览图（530 档，最多 8 张），详情页用 */
  images: string[];
  version: string | null;
  visibility: GamebananaVisibility;
  /** 文件级直链（`https://gamebanana.com/dl/{fileId}`）；拿不到时为 mod 页面 */
  downloadUrl: string;
  /** 取自 `_aFiles[0]._nFilesize`，单位字节；拿不到时为 null */
  fileSize: number | null;
  /** GameBanana 侧的文件扫描结论，实测样例 `clean` */
  avStatus: string | null;
  likeCount: number;
  viewCount: number;
  downloadCount: number;
  /** `_tsDateAdded` */
  gbCreatedAt: string | null;
};

/** 详情页比列表多出来的字段（都是长文本，不下发给列表） */
export type GamebananaModDetail = GamebananaMod & {
  description: string | null;
  /** GameBanana 的原始分类，详情页作为「来源分类」展示，也便于人工复核归类 */
  gbRootCategory: string | null;
  gbSubcategory: string | null;
};
