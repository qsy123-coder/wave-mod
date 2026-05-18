export type ModListItem = {
  id: string;
  title: string;
  character: string;
  version: string;
  description: string;
  coverImage: string;
  images: string[];
  tags: string[];
  likes: number;
  favorites: number;
  views: number;
  gameVersion: string;
  updatedAt: string;
  downloadUrl: string;
  nsfw?: boolean;
};

export const mockMods: ModListItem[] = [
  {
    id: "jinxi-lotus-veil",
    title: "今汐 · Lotus Veil 战斗礼装",
    character: "今汐",
    version: "v1.3.2",
    description: "强化银白与深海蓝层次，保留技能演出辨识度，适配当前热门战斗镜头。",
    coverImage:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=1200&q=80",
    ],
    tags: ["高清贴图", "剧情过场", "热门"],
    likes: 1288,
    favorites: 846,
    views: 18562,
    gameVersion: "2.3.x",
    updatedAt: "2026-04-08",
    downloadUrl: "#",
  },
  {
    id: "changli-ember-rose",
    title: "长离 · Ember Rose 红焰重制",
    character: "长离",
    version: "v2.0.0",
    description: "针对火系技能特效做了色温统一，适合截图党与高饱和演示视频。",
    coverImage:
      "https://images.unsplash.com/photo-1486572788966-cfd3df1f5b42?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1486572788966-cfd3df1f5b42?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1544256718-3bcf237f3974?auto=format&fit=crop&w=1200&q=80",
    ],
    tags: ["高燃演示", "角色重涂"],
    likes: 946,
    favorites: 622,
    views: 13210,
    gameVersion: "2.3.x",
    updatedAt: "2026-04-06",
    downloadUrl: "#",
  },
  {
    id: "chixia-neon-rush",
    title: "炽霞 · Neon Rush 夜巡配色",
    character: "炽霞",
    version: "v1.0.4",
    description: "偏街头霓虹的夜战风格，移动端预览也能保持清晰细节。",
    coverImage:
      "https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
    ],
    tags: ["夜景", "轻量包"],
    likes: 731,
    favorites: 514,
    views: 9840,
    gameVersion: "2.2.x",
    updatedAt: "2026-04-05",
    downloadUrl: "#",
  },
];
