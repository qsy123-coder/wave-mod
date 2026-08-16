import type { CommentRow, ModComment, ModRow, SiteMod } from "@/lib/mods-domain/types";

export const fallbackCoverImage =
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80";

export const publicModColumns = `
  id,
  title,
  character,
  version,
  game_version,
  game_key,
  description,
  images,
  video_url,
  download_url,
  downloads_count,
  drive_links,
  nsfw,
  mod_author_url,
  xxmi_install_guide,
  views,
  downloads_count,
  favorites_count,
  likes_count,
  comments_count,
  rating_count,
  rating_average,
  is_published,
  is_featured,
  created_at
`;

export function mapMod(row: ModRow): SiteMod {
  const images = row.images?.filter(Boolean) ?? [];

  return {
    character: row.character,
    commentsCount: row.comments_count ?? 0,
    coverImage: images[0] ?? fallbackCoverImage,
    createdAt: row.created_at,
    description: row.description,
    downloadUrl: row.download_url ?? null,
    downloads: row.downloads_count ?? 0,
    driveLinks: (row.drive_links as Array<{ platform: string; url: string }>) ?? [],
    favorites: row.favorites_count ?? 0,
    gameKey: row.game_key,
    gameVersion: row.game_version,
    id: row.id,
    images: images.length > 0 ? images : [fallbackCoverImage],
    likes: row.likes_count ?? 0,
    modAuthorUrl: row.mod_author_url,
    nsfw: row.nsfw ?? false,
    ratingAverage: row.rating_average ?? 0,
    ratingCount: row.rating_count ?? 0,
    title: row.title,
    userRating: null,
    version: row.version,
    videoUrl: row.video_url,
    views: row.views ?? 0,
    isFeatured: row.is_featured ?? false,
    featuredOrder: row.featured_order ?? null,
    xxmiInstallGuide: row.xxmi_install_guide,
  };
}

export function mapComment(row: CommentRow): ModComment {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    isPinned: row.is_pinned,
    parentId: row.parent_id,
    user: {
      avatarUrl: profile?.avatar_url ?? null,
      displayName: profile?.display_name?.trim() || "匿名玩家",
      id: row.user_id,
      role: profile?.role === "admin" ? "admin" : "user",
    },
  };
}
