"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Eye, Heart, ImageOff } from "lucide-react";

import { CardFavoriteButton } from "@/components/common/card-favorite-button";
import { RatingSticker } from "@/components/layout/mod-interaction-bar";
import { Badge } from "@/components/ui/badge";
import type { SiteMod } from "@/lib/mods";
import { cn } from "@/lib/utils";

type MetaBadgeTone = "default" | "site";
type LinkMode = "card" | "split" | "none";
type ModCardVariant = "default" | "home" | "list";

type ModCardProps = {
  mod: SiteMod;
  href?: string;
  linkMode?: LinkMode;
  variant?: ModCardVariant;
  className?: string;
  mediaClassName?: string;
  imageAspectClassName?: string;
  imageClassName?: string;
  imageSizes?: string;
  imagePriority?: boolean;
  imageFetchPriority?: "auto" | "high" | "low";
  titleClassName?: string;
  contentClassName?: string;
  titleTag?: "h2" | "h3";
  showInteractionBar?: boolean;
  showTags?: boolean;
  showMetaBadges?: boolean;
  metaBadgeTone?: MetaBadgeTone;
  extraMetaBadges?: ReactNode;
  mediaTopLeft?: ReactNode;
  mediaTopLeftClassName?: string;
  mediaTopRight?: ReactNode;
  mediaTopRightClassName?: string;
  mediaBottomLeft?: ReactNode;
  showRatingSticker?: boolean;
  ratingStickerClassName?: string;
  showCheckbox?: boolean;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  bodyAfterDescription?: ReactNode;
  bodyBottom?: ReactNode;
  actions?: ReactNode;
  isLoggedIn?: boolean;
  onCardClick?: (modId: string) => void;
};

const metaBadgeStyles: Record<MetaBadgeTone, { character: string; version: string; nsfw: string }> = {
  default: {
    character: "bg-[#ffd84f] text-black hover:bg-[#ffd84f]",
    version: "bg-[#ff7a7a] text-black hover:bg-[#ff7a7a]",
    nsfw: "bg-[#bcaeff] text-black hover:bg-[#bcaeff]",
  },
  site: {
    character: "bg-[var(--neo-secondary)] text-black hover:bg-[var(--neo-secondary)]",
    version: "bg-[var(--neo-accent)] text-black hover:bg-[var(--neo-accent)]",
    nsfw: "bg-[var(--neo-muted)] text-black hover:bg-[var(--neo-muted)]",
  },
};

const textLimits: Record<ModCardVariant, { title: number; description: number }> = {
  default: { title: 6, description: 36 },
  home: { title: 6, description: 22 },
  list: { title: 6, description: 16 },
};

const variantStyles: Record<
  ModCardVariant,
  {
    title: string;
    description: string;
    content: string;
    tagWrap: string;
    titleLinkWrap: string;
    detailLink: string;
    topLeft: string;
    statsWrap: string;
    renderInlineDetailWithStats: boolean;
    defaultTopRight: string | null;
  }
> = {
  default: {
    title: "line-clamp-2 max-w-[13rem] text-[0.9rem] font-black uppercase leading-[1.04] tracking-[0.16em] text-white/50 group-hover/mod-card:text-white transition-colors",
    description: "hidden max-w-[14rem] text-[11px] font-bold leading-4 text-white/76 md:block",
    content: "absolute inset-x-0 bottom-0 px-4 pb-4 pt-24 text-white",
    tagWrap: "hidden flex-wrap gap-1.5 md:flex",
    titleLinkWrap: "block space-y-2",
    detailLink:
      "inline-flex items-center gap-1.5 self-start border-2 border-black bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[3px_3px_0px_0px_#000] transition-all duration-200 group-hover/mod-card:-translate-y-0.5 group-hover/mod-card:shadow-[4px_4px_0px_0px_#000]",
    topLeft: "absolute left-3 top-3 z-20 flex max-w-[calc(100%-4.5rem)] flex-wrap items-start gap-1.5",
    statsWrap: "flex flex-wrap items-center gap-2",
    renderInlineDetailWithStats: true,
    defaultTopRight: null,
  },
  home: {
    title: "line-clamp-2 max-w-[13rem] text-[0.85rem] font-black uppercase leading-[1.03] tracking-[0.16em] text-white/50 group-hover/mod-card:text-white transition-colors",
    description: "hidden max-w-[14rem] text-[11px] font-bold leading-4 text-white/72 md:block",
    content: "absolute inset-x-0 bottom-0 px-4 pb-4 pt-24 text-white",
    tagWrap: "hidden",
    titleLinkWrap: "block space-y-1",
    detailLink:
      "inline-flex items-center gap-1.5 self-start border-2 border-black bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[3px_3px_0px_0px_#000] transition-all duration-200 group-hover/mod-card:-translate-y-0.5 group-hover/mod-card:shadow-[4px_4px_0px_0px_#000]",
    topLeft: "absolute left-3 top-3 z-20 flex max-w-[calc(100%-4.75rem)] flex-wrap items-start gap-1.5",
    statsWrap: "flex flex-wrap items-center gap-2",
    renderInlineDetailWithStats: true,
    defaultTopRight: null,
  },
  list: {
    title: "line-clamp-1 max-w-[10.5rem] text-[0.75rem] font-black uppercase leading-[1.02] tracking-[0.16em] text-white/50 group-hover/mod-card:text-white transition-colors",
    description: "hidden max-w-[10.5rem] text-[10px] font-bold leading-3 text-white/66 md:block",
    content: "absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-20 text-white",
    tagWrap: "hidden",
    titleLinkWrap: "block space-y-1",
    detailLink:
      "inline-flex items-center gap-1 border-2 border-black bg-white/95 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-black shadow-[3px_3px_0px_0px_#000] transition-all duration-200 group-hover/mod-card:-translate-y-0.5 group-hover/mod-card:shadow-[4px_4px_0px_0px_#000]",
    topLeft: "absolute left-3 top-3 z-20 flex max-w-[calc(100%-8rem)] flex-wrap items-start gap-1.5",
    statsWrap: "mt-1 flex flex-wrap items-center gap-2",
    renderInlineDetailWithStats: false,
    defaultTopRight: "absolute right-3 top-3 z-20",
  },
};

function shortenText(text: string, max: number) {
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max).trimEnd()}...`;
}

export function ModCard({
  mod,
  href,
  linkMode = "card",
  variant = "default",
  className,
  mediaClassName,
  imageAspectClassName,
  imageClassName,
  imageSizes = "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw",
  imagePriority = false,
  imageFetchPriority = imagePriority ? "high" : "auto",
  titleClassName,
  contentClassName,
  titleTag = "h2",
  showInteractionBar = true,
  showTags = false,
  showMetaBadges = true,
  metaBadgeTone = "default",
  extraMetaBadges,
  mediaTopLeft,
  mediaTopLeftClassName,
  mediaTopRight,
  mediaTopRightClassName,
  mediaBottomLeft,
  showRatingSticker = true,
  ratingStickerClassName,
  showCheckbox = false,
  checkboxChecked = false,
  onCheckboxChange,
  bodyAfterDescription,
  bodyBottom,
  actions,
  isLoggedIn = false,
  onCardClick,
}: ModCardProps) {
  const badgeTone = metaBadgeStyles[metaBadgeTone];
  const styles = variantStyles[variant];
  const limits = textLimits[variant];
  const TitleTag = titleTag;
  const canLink = Boolean(href);
  const canUseInnerLinks = canLink && linkMode !== "card";
  const resolvedHref = href ?? "#";

  const metaBadges = showMetaBadges ? (
    <>
      <Badge className={cn("neo-sticker -rotate-2 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em]", badgeTone.character)}>
        {mod.character}
      </Badge>
      {extraMetaBadges}
    </>
  ) : null;

  const topLeftContent = mediaTopLeft ?? (showMetaBadges ? metaBadges : null);

  const titleAndDescription = (
    <>
      <TitleTag className={cn(styles.title, titleClassName)}>{shortenText(mod.title, limits.title)}</TitleTag>
    </>
  );

  const compactStats = showInteractionBar ? (
    <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-white/55">
      <span className="inline-flex items-center gap-1">
        <Eye className="size-3.5" />{mod.views}
      </span>
      <span className="inline-flex items-center gap-1">
        <Heart className="size-3.5" />{mod.favorites}
      </span>
    </div>
  ) : null;

  const inlineDetailLink = canUseInnerLinks ? (
    <span className={styles.detailLink}>
      查看详情
      <ArrowUpRight className="size-3.5" />
    </span>
  ) : null;

  const topRightContent = mediaTopRight ??
    (styles.defaultTopRight && inlineDetailLink ? <div className={styles.defaultTopRight}>{inlineDetailLink}</div> : null);

  const isAutoAspect = imageAspectClassName === "auto";

  // 瀑布流：图片 onLoad 读取真实尺寸，锁定容器 aspect-ratio，防止黑屏抖动
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth && img.naturalHeight) {
        setImageRatio(img.naturalWidth / img.naturalHeight);
      }
    },
    [],
  );

  // 图片加载失败自动重试（指数退避：1s → 2s → 4s，最多 3 次）
  const retryCount = useRef(0);
  const maxRetries = 1; // 调试：只重试 1 次
  const [imageError, setImageError] = useState(false);
  const [retryTimestamp, setRetryTimestamp] = useState(0);
  const [debugUrl, setDebugUrl] = useState(""); // 调试：记录失败的 URL

  const handleImageError = useCallback(() => {
    setDebugUrl(imageSrc); // 记录当前尝试的 URL
    if (retryCount.current < maxRetries) {
      const delay = Math.pow(2, retryCount.current) * 1000;
      retryCount.current += 1;
      setTimeout(() => setRetryTimestamp(Date.now()), delay);
    } else {
      setImageError(true);
    }
  }, []);

  // 图片 URL 附加重试参数绕过缓存
  const imageSrc = retryTimestamp > 0
    ? `${mod.coverImage}${mod.coverImage.includes("?") ? "&" : "?"}_retry=${retryTimestamp}`
    : mod.coverImage;

  const media = (
    <div className={cn("relative overflow-hidden border-4 border-black bg-black shadow-[6px_6px_0px_0px_#000]", mediaClassName)}>
      <div
        className={cn(
          "relative w-full transition-[aspect-ratio] duration-300",
          isAutoAspect
            ? "h-auto"
            : "min-h-72 aspect-[4/5] sm:aspect-[3/4] xl:aspect-[4/5]",
          !isAutoAspect && imageAspectClassName,
        )}
        style={isAutoAspect ? { aspectRatio: imageRatio ? String(imageRatio) : "3/4" } : undefined}
      >
        {/* 模糊放大背景图，填充 object-contain 产生的空白区域 */}
        {imageError ? (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 py-2">
            <ImageOff className="size-8 text-white/30" />
            <p className="text-center text-[9px] leading-tight text-red-400 break-all line-clamp-3">{debugUrl || imageSrc}</p>
          </div>
        ) : debugUrl ? (
          <div className="absolute inset-0 z-50 flex items-end bg-black/60 p-2">
            <p className="text-[8px] leading-tight text-yellow-400 break-all line-clamp-2">{debugUrl}</p>
          </div>
        ) : null}
        {!imageError && isAutoAspect ? (
          <Image
            src={imageSrc}
            alt={mod.title}
            fill
            priority={imagePriority}
            fetchPriority={imageFetchPriority}
            sizes={imageSizes}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={cn("object-contain object-center transition-transform duration-500 ease-out group-hover/mod-card:scale-[1.06]", imageClassName)}
          />
        ) : (
          <>
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes={imageSizes}
              onError={handleImageError}
              className="scale-110 object-cover blur-xl"
              aria-hidden="true"
            />
            <Image
              src={imageSrc}
              alt={mod.title}
              fill
              priority={imagePriority}
              fetchPriority={imageFetchPriority}
              sizes={imageSizes}
              onError={handleImageError}
              className={cn("object-contain object-center transition-transform duration-500 ease-out group-hover/mod-card:scale-[1.06]", imageClassName)}
            />
          </>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/18 to-black/8" />

      {/* 批量操作复选框 */}
      {showCheckbox ? (
        <div className="absolute left-2 top-2 z-30" onClick={(e) => e.stopPropagation()}>
          <label className="flex size-4 cursor-pointer items-center justify-center border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5">
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(e) => onCheckboxChange?.(e.target.checked)}
              className="sr-only"
            />
            {checkboxChecked ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            ) : null}
          </label>
        </div>
      ) : null}
      {topLeftContent ? <div className={cn(styles.topLeft, showCheckbox && "left-7", mediaTopLeftClassName)}>{topLeftContent}</div> : null}
      {topRightContent ? <div className={cn("z-20", mediaTopRightClassName)}>{topRightContent}</div> : null}
      {mediaBottomLeft}
      {showRatingSticker ? <RatingSticker ratingAverage={mod.ratingAverage} ratingCount={mod.ratingCount} className={cn("z-20 shadow-[4px_4px_0px_0px_#000]", ratingStickerClassName)} /> : null}

      <CardFavoriteButton
        modId={mod.id}
        isFavorited={mod.isFavorited ?? false}
        isLoggedIn={isLoggedIn}
      />

      <div className={cn(styles.content, contentClassName)}>
        <div className="max-w-sm space-y-1.5">
          {canUseInnerLinks && linkMode === "split" ? ( 
            <Link href={resolvedHref} className={styles.titleLinkWrap}>
              {titleAndDescription}
            </Link>
          ) : (
            titleAndDescription
          )}
          {showTags ? null : null}
          {bodyAfterDescription}
          {compactStats ? (
            <div className={styles.statsWrap}>
              {compactStats}
              {styles.renderInlineDetailWithStats ? inlineDetailLink : null}
            </div>
          ) : styles.renderInlineDetailWithStats ? (
            inlineDetailLink
          ) : null}
          {bodyBottom}
          {actions}
        </div>
      </div>
    </div>
  );

  if (canLink && linkMode === "card") {
    if (onCardClick) {
      return (
        <article className={cn("group/mod-card neo-card neo-card-lift h-full p-3", className)}>
          <button type="button" onClick={() => onCardClick(mod.id)} className="block h-full w-full cursor-pointer text-left">
            {media}
          </button>
        </article>
      );
    }
    return (
      <article className={cn("group/mod-card neo-card neo-card-lift h-full p-3", className)}>
        <Link href={resolvedHref} className="block h-full">
          {media}
        </Link>
      </article>
    );
  }

  return (
    <article className={cn("group/mod-card neo-card neo-card-lift h-full p-3", className)}>
      {media}
    </article>
  );
}
