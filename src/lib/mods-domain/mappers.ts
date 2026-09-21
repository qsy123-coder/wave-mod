import { xxmiInstallGuideText } from "@/lib/constants/install-guide";
import type { CommentRow, ModComment, ModRow, SiteMod } from "@/lib/mods-domain/types";

export const fallbackCoverImage =
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80";

/**
 * 列表路径的列清单（整表分片扫描、每日更新、收藏、创作者页、后台列表都用它）。
 *
 * 刻意不含 xxmi_install_guide：该列全库只有 2 个近似取值（就是 install-guide.ts 的
 * 静态文本，只差一个换行），却占 payload 约 24%。实测（2026-09-21 在真库上量）：
 * 每次整表扫省 1,384,698 字节 ≈ 1.32 MiB。列表页也不展示安装说明（只有详情页展示），
 * 所以这里裁剪掉，由 mapMod 统一回填默认常量。
 * 真要把它加回来，先看 mappers.test.ts 里那条护栏测试为什么是红的。
 */
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

/**
 * 详情页/编辑回填用的列清单：在列表列基础上补回 xxmi_install_guide。
 *
 * 只有真正展示安装说明的地方才需要它（当前是 getPublicModBaseById）。
 * 后台编辑表单不在这里 —— 它用自己那份列清单（edit-mod-actions.ts 的 getEditableMod）。
 */
export const publicModDetailColumns = `${publicModColumns}, xxmi_install_guide`;

/**
 * mapMod 的入参。
 *
 * xxmi_install_guide 声明为可选是有意的：列表路径的查询已裁剪该列
 * （见 publicModColumns），运行时它就是缺的，而 Tables<"mods"> 声明它是必填 string。
 * 把这个落差写进类型，免得后人把 mapMod 里的 `?? 默认常量` 当成冗余删掉，
 * 那会让所有列表页的安装说明变成 undefined。
 */
type MappableModRow = Omit<ModRow, "xxmi_install_guide"> & {
  xxmi_install_guide?: string | null;
};

export function mapMod(row: MappableModRow): SiteMod {
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
    // 列表路径裁剪了该列（见 publicModColumns），缺键时回填默认常量。
    // 详情/后台路径的查询带该列，后台为单条 mod 自定义的说明会被保留。
    xxmiInstallGuide: row.xxmi_install_guide ?? xxmiInstallGuideText,
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
