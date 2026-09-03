"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Grid3X3, Star, Users, Zap } from "lucide-react";

import { getDefaultGame } from "@/config/games";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import type { SiteMod, TopCreator } from "@/lib/mods";
import { ZenlessHeroStage } from "@/features/games/zenless-zone-zero/components/zenless-hero-stage";
import { ZenlessLowerHome } from "@/features/games/zenless-zone-zero/components/zenless-lower-home";

// 鸣潮 slide 默认数据（Fallback 时使用）
const wuwaSlideDefaults = {
  titles: [
    "今汐 · 时序之曦",
    "长离 · 玄戈灭光",
    "女漂 · 异界旅装",
    "吟霖 · 雷光千瞬",
    "白芷 · 玉笛飞声",
  ],
  characters: ["今汐", "长离", "女漂", "吟霖", "白芷"],
  descriptions: [
    "以鸣潮世界观为核心的角色外观 MOD，突出高清预览与直链下载体验。",
    "展示鸣潮角色的战斗姿态与个性化皮肤，保持本站硬边框高对比风格。",
    "面向角色外观、武器替换和 UI 增强 MOD 的主站精选展示位。",
    "保留原站 neo-brutalism 视觉系统，仅按参考图重排首屏结构。",
    "精选鸣潮 MOD 内容入口，每日更新最新发布和热门作品。",
  ],
};

// 鸣潮 Hero 文案
const wuwaCopy = {
  badge: "鸣潮 MOD 精选",
  headingLine1: "Wuthering Waves",
  headingLine2: "Mod Hub",
  subtitle: "高清预览 · 高速直链 · 每日更新",
  fallbackDesc:
    "以鸣潮角色为中心整理 MOD，突出高清预览与直链下载体验，减少网盘跳转和限速干扰。",
  browseLabel: "浏览 MOD",
  guideLabel: "XXMI 教程",
  updateBadge: "最新更新",
  featuredSuffix: "精选",
  exploreLabel: "立即探索",
};

type LowerHomeData = {
  featuredMods: SiteMod[];
  latestMods: SiteMod[];
  topCreators: TopCreator[];
  characters: string[];
  totalMods: number;
  avgRating: string;
  characterCounts: Record<string, number>;
};

const EMPTY_DATA: LowerHomeData = {
  featuredMods: [],
  latestMods: [],
  topCreators: [],
  characters: [],
  totalMods: 0,
  avgRating: "0.0",
  characterCounts: {},
};

/**
 * 首页第二屏：滚动到该屏（提前 400px）才从 API 拉取数据渲染，
 * 避免首屏 SSR 时因为默认加载整屏内容而拉长浏览器加载时间。
 */
export function LazyHomeLower() {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<LowerHomeData | null>(null);
  const [failed, setFailed] = useState(false);

  // 鸣潮主页 entry：固定 default game + 导航覆盖
  const game = useMemo(() => {
    const raw = getDefaultGame();
    return { ...raw, nav: { ...raw.nav, mods: "/mods", guide: "/guide" } };
  }, []);

  useEffect(() => {
    if (data) return;

    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        fetch("/api/home/lower")
          .then((r) => {
            if (!r.ok) throw new Error("lower section fetch failed");
            return r.json();
          })
          .then((json: LowerHomeData) => {
            if (!cancelled) setData(json);
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [data]);

  const resolved = failed ? EMPTY_DATA : data;

  if (!resolved) {
    return (
      <div ref={ref} className="flex min-h-full items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-black border-t-[var(--neo-accent)]" />
          <p className="text-sm font-black text-white/60">加载鸣潮精选内容...</p>
        </div>
      </div>
    );
  }

  const stats = [
    { icon: Download, value: `${resolved.totalMods}+`, label: "MOD 可用" },
    { icon: Users, value: `${resolved.topCreators.length}+`, label: "创作者" },
    { icon: Star, value: resolved.avgRating, label: "用户评分" },
    { icon: Grid3X3, value: `${resolved.characters.length}+`, label: "角色分类" },
    { icon: Zap, value: "Daily", label: "每日更新" },
  ];

  const categories = resolved.characters.slice(0, 6).map((name) => {
    const count = resolved.characterCounts[name] ?? 0;
    const avatar = getCharacterImagePath(name);
    return { avatar, name: `${name}外观`, query: name, count: `${count}` };
  });

  const creators = resolved.topCreators.map((c) => ({
    name: c.displayName,
    followers: `${Math.max(1, c.totalDownloads / 1000).toFixed(1)}K`,
  }));

  const displayMods = resolved.characters.slice(0, 4).map((name) => ({
    character: name,
    title: `${name} · 精选外观`,
  }));

  return (
    <div ref={ref} className="flex min-h-full flex-col">
      <ZenlessHeroStage
        game={game}
        mods={resolved.featuredMods}
        slideDefaults={wuwaSlideDefaults}
        copy={wuwaCopy}
        className="!h-[44vh] !min-h-0 !pt-[30px]"
        imageTopClass="-top-45"
        imageShiftPx={200}
        imagePosition="50% 35%"
        fullscreen
      />
      <div className="mx-auto w-full max-w-[1680px]">
        <ZenlessLowerHome
          game={game}
          latestMods={resolved.latestMods}
          mods={resolved.featuredMods}
          stats={stats}
          categories={categories}
          creators={creators}
          displayMods={displayMods}
        />
      </div>
    </div>
  );
}
