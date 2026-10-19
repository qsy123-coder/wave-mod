"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, Eye, Heart, ImageOff } from "lucide-react";

import { CardFavoriteButton } from "@/components/common/card-favorite-button";
import { Badge } from "@/components/ui/badge";
import { COS_IMG_CARD, COS_IMG_THUMB, cosImageSrcSet, withCosImageTransform } from "@/lib/cos/shared";
import { useEngagement } from "@/lib/engagement/use-engagement";
import { normalizeCharacterName } from "@/lib/mods-domain/sorting";
import { isPlainLeftClick } from "@/lib/navigation-url";
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
  /**
   * 图片加载后把真实宽高比报给外面。瀑布流要靠它决定卡片高度、
   * 以及横屏图要不要横跨两列（比例在服务端拿不到，只能等图片加载）。
   */
  onImageRatioChange?: (ratio: number) => void;
  showCheckbox?: boolean;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  bodyAfterDescription?: ReactNode;
  bodyBottom?: ReactNode;
  actions?: ReactNode;
  /**
   * @deprecated 互动（点赞/收藏）已不再要求登录，这个 prop 不再被 ModCard 使用。
   * 保留是为了不改动十余处调用方；下次动到那些文件时顺手删掉。
   */
  isLoggedIn?: boolean;
  /** 点击整张卡时回调（列表页/更新页用来就地在右侧开详情抽屉），卡片本身仍是真链接 */
  onCardClick?: (modId: string) => void;
  /**
   * 卡片**不是链接**、点击只回调的场景（目前只有后台批量选择）。
   * 与 onCardClick 分开，是因为这时的 href 只是给 split 模式标题链接的备用值，
   * 拿它当导航目标会把用户送错页（后台选择模式下 href 指向的是编辑页）。
   */
  onCardSelect?: (modId: string) => void;
};

const metaBadgeStyles: Record<MetaBadgeTone, { character: string; version: string; nsfw: string }> = {
  default: {
    character: "bg-[var(--neo-secondary)] text-black hover:bg-[var(--neo-secondary)]",
    version: "bg-[var(--neo-accent)] text-black hover:bg-[var(--neo-accent)]",
    nsfw: "bg-[var(--neo-muted)] text-black hover:bg-[var(--neo-muted)]",
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

/** 标题白色实心描边：8 方向 text-shadow 勾边，提升在图片上的可读性 */
const TITLE_TEXT_OUTLINE =
  "[text-shadow:-1px_-1px_0_#fff,1px_-1px_0_#fff,-1px_1px_0_#fff,1px_1px_0_#fff,-1px_0_0_#fff,1px_0_0_#fff,0_-1px_0_#fff,0_1px_0_#fff]";

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
    title: "line-clamp-2 max-w-[13rem] text-[0.9rem] font-black uppercase leading-[1.04] tracking-[0.16em] text-black/60 group-hover/mod-card:text-black group-hover/mod-card:line-clamp-none transition-colors",
    description: "hidden max-w-[14rem] text-[11px] font-bold leading-4 text-black/70 md:block",
    content: "absolute inset-x-0 bottom-0 px-4 pb-4 pt-24 text-black",
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
    title: "line-clamp-2 max-w-[13rem] text-[0.85rem] font-black uppercase leading-[1.03] tracking-[0.16em] text-black/60 group-hover/mod-card:text-black group-hover/mod-card:line-clamp-none transition-colors",
    description: "hidden max-w-[14rem] text-[11px] font-bold leading-4 text-black/70 md:block",
    content: "absolute inset-x-0 bottom-0 px-4 pb-4 pt-24 text-black",
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
    title: "line-clamp-1 max-w-[10.5rem] text-[0.75rem] font-black uppercase leading-[1.02] tracking-[0.16em] text-black/60 group-hover/mod-card:text-black group-hover/mod-card:line-clamp-none transition-colors",
    description: "hidden max-w-[10.5rem] text-[10px] font-bold leading-3 text-black/66 md:block",
    content: "absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-20 text-black",
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
  // 断点如实描述卡片宽度（窄屏 2 列 / 中屏 3 列 / 宽屏 5 列，另有 240px 侧栏）：
  // 写大了浏览器会挑大档、白花字节，写小了会糊。调用方有更准的值就传 imageSizes 覆盖。
  // （这个 prop 此前一直被解构却没用上，等于让 sizes 缺省 —— 与 srcSet 一起补上。）
  imageSizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 18vw",
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
  onImageRatioChange,
  showCheckbox = false,
  checkboxChecked = false,
  onCheckboxChange,
  bodyAfterDescription,
  bodyBottom,
  actions,
  onCardClick,
  onCardSelect,
}: ModCardProps) {
  const badgeTone = metaBadgeStyles[metaBadgeTone];
  const styles = variantStyles[variant];
  const limits = textLimits[variant];

  // 互动计数：先用服务端快照里的值打底，客户端批量拉到新值后无缝替换（拉不到就一直是它）
  const { counts, mine, favorite } = useEngagement(mod.id, {
    likes: mod.likes,
    favorites: mod.favorites,
    views: mod.views,
  });

  // hover 卡片时标题显示全称（默认 6 字缩写）；竖排换行见 styles.title 的 group-hover:line-clamp-none
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);
  const cardHoverHandlers = {
    onMouseEnter: () => setIsTitleExpanded(true),
    onMouseLeave: () => setIsTitleExpanded(false),
  };
  const displayTitle = isTitleExpanded ? mod.title : shortenText(mod.title, limits.title);
  const TitleTag = titleTag;
  const canLink = Boolean(href);
  const canUseInnerLinks = canLink && linkMode !== "card";
  const resolvedHref = href ?? "#";

  const metaBadges = showMetaBadges ? (
    <>
      <Badge className={cn("neo-sticker -rotate-2 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] max-sm:hidden", badgeTone.character)}>
        {normalizeCharacterName(mod.character ?? "")}
      </Badge>
      {extraMetaBadges}
    </>
  ) : null;

  const topLeftContent = mediaTopLeft ?? (showMetaBadges ? metaBadges : null);

  const titleAndDescription = (
    <>
      <TitleTag className={cn(styles.title, TITLE_TEXT_OUTLINE, titleClassName)}>{displayTitle}</TitleTag>
    </>
  );

  const compactStats = showInteractionBar ? (
    <div className="flex flex-wrap items-center gap-1.5 max-sm:hidden px-1.5 py-0.5 text-xs font-bold text-black/80 bg-[var(--neo-panel)]/20">
      <span className="inline-flex items-center gap-1">
        <Eye className="size-3.5" />{counts.views}
      </span>
      <span className="inline-flex items-center gap-1">
        <Heart className="size-3.5" />{counts.favorites}
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

  // 瀑布流：读取图片真实宽高，锁定容器 aspect-ratio。
  // object-contain 落在 bg-black 容器上，若容器宽高比 ≠ 图片宽高比，两侧/上下会留黑边。
  // 刷新命中缓存时，load 事件可能在 React 水合前就已触发，onLoad 不会再被调用，
  // 因此额外用 ref 回调兜底：挂载时若 img.complete 已为 true，直接读取 naturalWidth/Height。
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  // 图片是否已就位：用于把加载期间的纯黑占位换成骨架动画
  const [imageLoaded, setImageLoaded] = useState(false);

  const readImageRatio = useCallback((img: HTMLImageElement | null) => {
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setImageRatio(ratio);
      setImageLoaded(true);
      onImageRatioChange?.(ratio);
    }
  }, [onImageRatioChange]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      readImageRatio(e.currentTarget);
    },
    [readImageRatio],
  );

  // ref 回调：元素挂载时，若图片已完成加载（缓存命中），同步读取尺寸
  const handleImageRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (img && img.complete) readImageRatio(img);
    },
    [readImageRatio],
  );

  // 图片加载失败自动重试（指数退避：1s → 2s → 4s，最多 3 次）
  const retryCount = useRef(0);
  const maxRetries = 3;
  const [imageError, setImageError] = useState(false);
  const [retryTimestamp, setRetryTimestamp] = useState(0);

  const handleImageError = useCallback(() => {
    if (retryCount.current < maxRetries) {
      const delay = Math.pow(2, retryCount.current) * 1000;
      retryCount.current += 1;
      setTimeout(() => setRetryTimestamp(Date.now()), delay);
    } else {
      setImageError(true);
    }
  }, []);

  // 原始图是 2560px 直出（452KB），卡片位只显示一两百 CSS px，先按卡片档缩一档再渲染。
  // 变换必须在拼 `_retry` 之前做：实测 `?imageMogr2/...&_retry=` 两种顺序结果一致。
  const coverImage = withCosImageTransform(mod.coverImage, COS_IMG_CARD);
  // 模糊背景只需低分辨率；用 800 档会在网格模式（非瀑布流）多下一份大图
  const blurImage = withCosImageTransform(mod.coverImage, COS_IMG_THUMB) ?? coverImage;

  /**
   * 卡片图的 `srcset` 档位。
   *
   * ⚠️ **必须低于 560**，否则一个字节都省不下来：库存的预览图已统一成 560px webp，
   * 而 `%3E` 不放大 —— 640 / 800 这些档返回的都是**同一张 560 图**，体积分毫不差
   * （2026-10-16 从服务器实测：原图 57.8KB、`thumbnail/800` 55.8KB）。
   * 只有真正下采样的档才有意义：同一次实测 `thumbnail/320` 是 26.2KB，约 1/3。
   *
   * 480 是照「槽位实际需要多少设备像素」定的：/mods 网格 xl 下 5 列、单卡约 260 CSS px，
   * 2x 屏需要 ~520，480 覆盖 93%（肉眼无差）而体积明显更小 —— 卡在 560 那条线上等于白做。
   */
  // 320 / 480 / 560 三档：单档 320 在 2x 屏（卡片位约 340–520 设备像素）会被放大发虚，
  // 用户反馈「预览图都糊」。560 是库存预览图的上限，再高的档返回同一张图、白花字节。
  const CARD_IMAGE_WIDTHS = [320, 480, 560] as const;

  // 重试要绕过缓存，src 与 srcSet **都得带** `_retry` —— 只给 src 的话浏览器会从 srcSet
  // 里挑回那张已经失败的。srcSet 必须由**未变换**的原 URL 现算：已经把 imageMogr2 拼进去的
  // URL 再喂给 cosImageSrcSet 会被它幂等短路，每个档返回同一个地址。
  const withRetry = (url: string | undefined) =>
    !url || retryTimestamp === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}_retry=${retryTimestamp}`;

  const imageSrc = withRetry(coverImage) ?? coverImage;
  const imageSrcSet = withRetry(cosImageSrcSet(mod.coverImage, CARD_IMAGE_WIDTHS));

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
          <div className="flex h-full min-h-[120px] items-center justify-center">
            <ImageOff className="size-8 text-white/30" />
          </div>
        ) : isAutoAspect ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            srcSet={imageSrcSet}
            sizes={imageSizes}
            alt={mod.title}
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imageFetchPriority}
            decoding="async"
            referrerPolicy="no-referrer"
            ref={handleImageRef}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={cn("absolute inset-0 h-full w-full object-contain object-center transition-transform duration-500 ease-out group-hover/mod-card:scale-[1.06]", imageClassName)}
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={blurImage}
              alt=""
              loading="lazy"
              fetchPriority="low"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={handleImageError}
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
              aria-hidden="true"
            />
            {/* 前景图必须跟随 imagePriority：无限滚动每次追加 16 张卡，若一律 eager，
                视口里那几张会排在一堆屏幕外图片后面抢 6 个并发连接，越滑越堵。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              srcSet={imageSrcSet}
              sizes={imageSizes}
              alt={mod.title}
              loading={imagePriority ? "eager" : "lazy"}
              fetchPriority={imageFetchPriority}
              decoding="async"
              referrerPolicy="no-referrer"
              ref={handleImageRef}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className={cn("absolute inset-0 h-full w-full object-contain object-center transition-transform duration-500 ease-out group-hover/mod-card:scale-[1.06]", imageClassName)}
            />
          </>
        )}
        {/* 加载期间占位：图片到位前 bg-black 容器是一块纯黑，看起来像黑屏或坏图。
            内层独占 animate-pulse —— pulse 动画直接改写 opacity，若与淡出写在同一元素上，
            opacity-0 会被动画覆盖，占位永远不会消失。 */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-300",
            imageLoaded || imageError ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="h-full w-full animate-pulse bg-[var(--neo-muted)]" />
        </div>
      </div>
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
      {topRightContent ? <div className={cn("z-20 max-sm:hidden", mediaTopRightClassName)}>{topRightContent}</div> : null}
      {mediaBottomLeft}

      <CardFavoriteButton isFavorited={mine.favorited} onToggle={favorite} />

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
    // 批量选择模式：卡片是勾选框，不是链接，href 在这个模式下没有意义（见 onCardSelect 注释）
    if (onCardSelect) {
      return (
        <article {...cardHoverHandlers} className={cn("group/mod-card neo-card neo-card-lift h-full p-3", className)}>
          <button type="button" onClick={() => onCardSelect(mod.id)} className="block h-full w-full cursor-pointer text-left">
            {media}
          </button>
        </article>
      );
    }

    /**
     * 整张卡就是一个真链接。
     *
     * 从 `<button onClick={openDrawer}>` 换成 `<a href>`，图的是**水合之前**那一段：
     * 那时 button 上的事件处理器还不存在，点了完全没反应；真链接则会走浏览器原生跳转，
     * 自带加载指示。坏网络下这个死窗口实测有 11~23 秒（memory: prerender-click-dead-window）。
     * 水合之后仍然由我们自己接管 —— preventDefault 后就地开抽屉，不跳走。
     *
     * 因此 prefetch 一律关掉：一次点击压根不会导航过去，预取那些 RSC 负载纯属浪费带宽，
     * 还要和用户正在看的这一页抢（无限滚动一次就是十几张卡）。
     */
    const handleCardClick = onCardClick
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          // 带修饰键的点击（Ctrl/Cmd/中键 → 新标签页）放行给浏览器，见 isPlainLeftClick
          if (!isPlainLeftClick(event)) return;
          event.preventDefault();
          onCardClick(mod.id);
        }
      : undefined;

    return (
      <article {...cardHoverHandlers} className={cn("group/mod-card neo-card neo-card-lift h-full p-3", className)}>
        <Link
          href={resolvedHref}
          prefetch={false}
          onClick={handleCardClick}
          // 按下反馈：纯 CSS，水合前按下去就有反应，不依赖任何 JS
          className="block h-full transition-transform duration-150 active:scale-[0.98]"
        >
          {media}
        </Link>
      </article>
    );
  }

  return (
    <article {...cardHoverHandlers} className={cn("group/mod-card neo-card neo-card-lift h-full p-3", className)}>
      {media}
    </article>
  );
}
