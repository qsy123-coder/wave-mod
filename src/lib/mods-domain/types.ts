import type { Tables } from "@/types/supabase";

export type DriveLink = { platform: string; url: string };

export type ModSort = "default" | "latest" | "favorites" | "rating" | "hot";

export type SiteMod = {
  character: string;
  commentsCount: number;
  coverImage: string;
  createdAt: string;
  description: string;
  downloadUrl: string | null;
  downloads: number;
  driveLinks: DriveLink[];
  favorites: number;
  gameKey: string;
  gameVersion: string;
  id: string;
  images: string[];
  isFavorited?: boolean;
  isFeatured: boolean;
  featuredOrder?: number | null;
  isLiked?: boolean;
  likes: number;
  modAuthorUrl: string | null;
  nsfw: boolean;
  ratingAverage: number;
  ratingCount: number;
  title: string;
  userRating?: number | null;
  version: string;
  videoUrl: string | null;
  views: number;
  xxmiInstallGuide: string;
};

export type ViewerModState = {
  isFavorited: boolean;
  isLiked: boolean;
  userRating: number | null;
};

export type FavoriteMod = SiteMod & {
  favoritedAt: string;
};

export type AdminMod = SiteMod & {
  isPublished: boolean;
};

export type ModCommentSort = "newest" | "oldest" | "most-liked";

export type ModComment = {
  id: string;
  content: string;
  createdAt: string;
  isPinned?: boolean;
  likesCount?: number;
  dislikesCount?: number;
  parentId?: string | null;
  replies?: ModComment[];
  userReaction?: 1 | -1 | null;
  user: {
    avatarUrl: string | null;
    displayName: string;
    id: string | null;
    role?: "admin" | "creator" | "user" | null;
  };
};

export type ModRow = Tables<"mods">;

export type FavoriteRow = Pick<Tables<"favorites">, "created_at" | "mod_id">;

export type CommentRow = Omit<Pick<Tables<"comments">, "id" | "content" | "created_at" | "is_pinned" | "parent_id" | "user_id">, "user_id"> & {
  user_id: string | null;
  profiles:
    | {
        avatar_url: string | null;
        display_name: string | null;
        role: "admin" | "user" | "vip";
      }
    | {
        avatar_url: string | null;
        display_name: string | null;
        role: "admin" | "user" | "vip";
      }[]
    | null;
};

export type PublicModsFilters = {
  character?: string;
  /**
   * 只看有直链下载的（download_url 非空）。
   *
   * 别和 driveLinks（网盘：夸克/迅雷…）搞混 —— 全库 5285 条**每条都有网盘链接**，
   * 而直链只有个位数（入库脚本一律写 download_url: null，直链是手工补的）。
   * 这个筛选因此必然是小结果集，见 applyModQueryFilters。
   */
  direct?: boolean;
  gameKey?: string;
  /** 只看有真预览图的（排除 COS 占位图与兜底图，见 preview-image.ts） */
  preview?: boolean;
  query?: string;
  sort?: ModSort;
};

export type PaginatedResult<T> = {
  hasMore: boolean;
  items: T[];
  nextPage: number | null;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * mod 列表分页：比通用分页多一个**真总数**。
 *
 * 单独一个类型而不是给 `PaginatedResult` 加必填字段：评论分页（getModCommentsPage）
 * 从来就没有真总数，硬塞一个字段只能编个假值出来。这里用交叉类型把它限定在
 * `getPublicModsPage` 上，客户端读 `totalCount` 时编译器就能确认服务端真的填了。
 *
 * 列表页工具栏那句「共 N 个 MOD」要的就是它。非默认筛选时页面没有预渲染的种子，
 * 客户端只能等第一页回来才知道总数（见 mods-page-client）。
 */
export type ModsPage = PaginatedResult<SiteMod> & { totalCount: number };
