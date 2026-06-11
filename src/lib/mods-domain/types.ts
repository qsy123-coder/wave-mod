import type { Tables } from "@/types/supabase";

export type ModSort = "latest" | "favorites" | "rating" | "hot";

export type SiteMod = {
  character: string;
  commentsCount: number;
  coverImage: string;
  createdAt: string;
  description: string;
  downloadUrl: string;
  downloads: number;
  favorites: number;
  gameKey: string;
  gameVersion: string;
  id: string;
  images: string[];
  isFavorited?: boolean;
  isLiked?: boolean;
  likes: number;
  modAuthorUrl: string | null;
  nsfw: boolean;
  ratingAverage: number;
  ratingCount: number;
  tags: string[];
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
  gameKey?: string;
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
