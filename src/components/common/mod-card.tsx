import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Eye, Heart } from "lucide-react";

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

  const media = (
    <div className={cn("relative overflow-hidden border-4 border-black bg-black shadow-[6px_6px_0px_0px_#000]", mediaClassName)}>
      <div className={cn(
        "relative w-full",
        isAutoAspect ? "h-auto" : "min-h-72 aspect-[4/5] sm:aspect-[3/4] xl:aspect-[4/5]",
        !isAutoAspect && imageAspectClassName
      )}>
        {/* 模糊放大背景图，填充 object-contain 产生的空白区域 */}
        {isAutoAspect ? (
          <Image
            src={mod.coverImage}
            alt={mod.title}
            width={800}
            height={600}
            unoptimized={mod.coverImage?.includes("supabase.co")}
            priority={imagePriority}
            fetchPriority={imageFetchPriority}
            sizes={imageSizes}
            style={{ width: "100%", height: "auto" }}
            className={cn("block object-contain object-center transition-transform duration-500 ease-out group-hover/mod-card:scale-[1.06]", imageClassName)}
          />
        ) : (
          <>
            <Image
              src={mod.coverImage}
              alt=""
              fill
              unoptimized={mod.coverImage?.includes("supabase.co")}
              sizes={imageSizes}
              className="scale-110 object-cover blur-xl"
              aria-hidden="true"
            />
            <Image
              src={mod.coverImage}
              alt={mod.title}
              fill
              unoptimized={mod.coverImage?.includes("supabase.co")}
              priority={imagePriority}
              fetchPriority={imageFetchPriority}
              sizes={imageSizes}
              className={cn("object-contain object-center transition-transform duration-500 ease-out group-hover/mod-card:scale-[1.06]", imageClassName)}
            />
          </>
        )}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_18%,rgba(0,0,0,0.16)_55%,rgba(0,0,0,0.42)_100%)] transition-opacity duration-500 group-hover/mod-card:opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/18 to-black/8" />

      {topLeftContent ? <div className={cn(styles.topLeft, mediaTopLeftClassName)}>{topLeftContent}</div> : null}
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
