import type { GameConfig } from "@/config/games";
import { ZenlessHeroCarouselClient, type ZenlessHeroCopy, type ZenlessHeroSlide } from "@/features/games/zenless-zone-zero/components/zenless-hero-carousel-client";
import type { SiteMod } from "@/lib/mods";

const fallbackSlides: ZenlessHeroSlide[] = [
  {
    id: "zenless-fallback-1",
    title: "ZENLESS ZONE ZERO MOD HUB",
    character: "New Eridu",
    description: "代理人外观、战斗特效与界面增强 MOD 的绝区零分站入口。",
    coverImage: "",
    href: "/zenless-zone-zero/mods",
    version: "v1.0",
  },
];

const slideTitles = ["星见雅 · 霜刃行动套装", "艾莲 · 深海巡游外观", "妮可 · 狡兔屋霓虹制服", "安比 · 电光战术服", "朱鸢 · 治安局特别涂装"];
const slideCharacters = ["星见雅", "艾莲", "妮可", "安比", "朱鸢"];
const slideDescriptions = [
  "以新艾利都街区氛围为核心的代理人外观展示，适合做绝区零 MOD 分站首屏焦点。",
  "突出角色剪影、战斗姿态与高速直链下载入口，保持本站硬边框高对比风格。",
  "面向代理人皮肤、武器替换和 UI 增强 MOD 的分站展示位。",
  "保留原站 neo-brutalism 视觉系统，仅按参考图重排首屏结构。",
  "精选绝区零 MOD 内容入口，后续接入真实 ZZZ 数据后自动替换展示。",
];

type SlideDefaults = { titles: string[]; characters: string[]; descriptions: string[] };

function createZenlessSlides(
  game: GameConfig,
  mods: SiteMod[],
  defaults?: SlideDefaults,
  fb?: ZenlessHeroSlide[],
): ZenlessHeroSlide[] {
  const titles = defaults?.titles ?? slideTitles;
  const characters = defaults?.characters ?? slideCharacters;
  const descriptions = defaults?.descriptions ?? slideDescriptions;
  const fallback = fb ?? fallbackSlides;

  if (mods.length === 0) return fallback;

  return mods.map((mod, index) => ({
    id: mod.id,
    title: titles[index % titles.length],
    character: characters[index % characters.length],
    description: descriptions[index % descriptions.length],
    coverImage: mod.coverImage,
    href: `${game.nav.mods}/${mod.id}`,
    version: mod.version || "v1.0",
  }));
}

type ZenlessHeroStageProps = {
  game: GameConfig;
  mods: SiteMod[];
  slideDefaults?: SlideDefaults;
  fallbackSlides?: ZenlessHeroSlide[];
  copy?: ZenlessHeroCopy;
  className?: string;
};

export function ZenlessHeroStage({ game, mods, slideDefaults, fallbackSlides: fb, copy, className }: ZenlessHeroStageProps) {
  const slides = createZenlessSlides(game, mods, slideDefaults, fb);
  return <ZenlessHeroCarouselClient game={game} slides={slides} copy={copy} className={className} />;
}
