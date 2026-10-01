"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createPortal } from "react-dom";
import Autoplay from "embla-carousel-autoplay";

import { ArrowUpRight, Pause, Play, Star } from "lucide-react";

import { useSession } from "@/components/features/auth/session-provider";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { useEngagement } from "@/lib/engagement/use-engagement";
import { isPlainLeftClick } from "@/lib/navigation-url";
import type { SiteMod } from "@/lib/mods";

/**
 * 轮播图底部的「浏览 / 收藏」两个计数。
 *
 * 为什么单独抽一个组件：slides 是 `mods.map()` 出来的，hook 不能写在循环里。
 * 为什么不能直接渲染 `mod.views`：那两个字段来自服务端快照（源头是 Supabase），
 * 而互动写入已经不再进 Supabase ⇒ 直接渲染会**永远停在基线**，等多久都不动。
 */
function HeroCountPills({ mod }: { mod: SiteMod }) {
  const { counts } = useEngagement(mod.id, {
    likes: mod.likes,
    favorites: mod.favorites,
    views: mod.views,
  });

  return (
    <>
      <div className="border-2 border-black bg-white/92 px-2.5 py-1.5 shadow-[3px_3px_0px_0px_#000]">浏览 {counts.views}</div>
      <div className="border-2 border-black bg-white/92 px-2.5 py-1.5 shadow-[3px_3px_0px_0px_#000]">收藏 {counts.favorites}</div>
    </>
  );
}


type HeroCarouselProps = {
  mods: SiteMod[];
};

/**
 * 详情抽屉只在点击轮播图后才需要。
 * 首页首屏包已经很大，按需加载可以避免把评论/评分/灯箱这些代码带进首屏。
 */
const ModDetailDrawer = dynamic(
  () => import("@/components/features/mods/detail/mod-detail-drawer").then((m) => m.ModDetailDrawer),
  { ssr: false },
);

export function HeroCarousel({ mods }: HeroCarouselProps) {
  // 登录态 / 管理员标记改由客户端取（以前是首页服务端读 cookie 后逐层传下来）。
  // 抽屉是 `ssr: false` 的动态加载组件、点了才渲染，所以这里晚一两帧拿到会话
  // 完全看不出来。详见 session-provider.tsx。
  const { isLoggedIn, isAdmin, user } = useSession();
  const admin = isAdmin;
  const currentUserId = user?.id;
  // 抽屉自己会兜底成「我」，所以没有昵称时传 undefined 而不是空串。
  const currentUserName = user?.displayName ?? undefined;
  const plugin = React.useRef(
    Autoplay({ delay: 4500, stopOnInteraction: true, stopOnMouseEnter: true }),
  );
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [drawerModId, setDrawerModId] = React.useState<string | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  /**
   * 首页的滚动者是 snap 容器（内层 div），不是 body，
   * Sheet 自带的 body 锁定管不到它 —— 抽屉打开时手动锁住该容器，
   * 否则滚轮会穿透抽屉，把背后的首页整屏滚走。
   *
   * 容器是 overflow-y-scroll（滚动条常驻），切成 hidden 会让滚动条消失、
   * 内容盒一下宽出十几像素，居中的大卡片就横向跳一下。
   * 用等宽的 padding-right 把内容盒宽度补回去，卡片位置就纹丝不动。
   */
  React.useEffect(() => {
    if (!drawerModId) return;

    const scroller = cardRef.current?.closest<HTMLElement>("[data-scroll-lock-root]");
    if (!scroller) return;

    // offsetWidth - clientWidth = 左右边框 + 纵向滚动条；该容器无边框，即为滚动条宽度。
    // 必须在改 overflow 之前读，改完滚动条就没了。
    const scrollbarWidth = scroller.offsetWidth - scroller.clientWidth;
    const previousOverflow = scroller.style.overflow;
    const previousPaddingRight = scroller.style.paddingRight;

    scroller.style.overflow = "hidden";
    if (scrollbarWidth > 0) scroller.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      scroller.style.overflow = previousOverflow;
      scroller.style.paddingRight = previousPaddingRight;
    };
  }, [drawerModId]);

  React.useEffect(() => {
    if (!api) return;

    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);

    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const toggleAutoplay = () => {
    if (!plugin.current) return;

    if (isPlaying) {
      plugin.current.stop();
      setIsPlaying(false);
      return;
    }

    plugin.current.play();
    setIsPlaying(true);
  };

  if (mods.length === 0) {
    return (
      <MotionReveal delay={0.14} y={32} rotate={2}>
        <div className="neo-card-lg relative rotate-2 p-6 text-black" style={{ background: "var(--neo-panel)" }}>
          <div className="border-4 border-black bg-white px-5 py-8 shadow-[8px_8px_0px_0px_#000]">
            <p className="neo-label text-black/60">FEATURED DROP</p>
            <h2 className="mt-2 text-3xl font-black leading-tight">首页轮播已接入真实数据</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-black/75">当前还没有可展示的公开 MOD。你可以先去后台发布内容，首页热门轮播会自动展示最新条目。</p>
          </div>
        </div>
      </MotionReveal>
    );
  }

  // 下面 MotionReveal 上的 min-w-0 不能省：这层是首页那个 `grid`
  // （`lg:grid-cols-[0.9fr_1.1fr]`）的网格项，网格项默认 `min-width: auto`，
  // 会被内容的 min-content 顶住 —— 轮播的 min-content 实测 351px，于是它比 295px 的
  // 网格轨道宽出 56px，而外层面板是 overflow-hidden，超出的部分就被硬切掉。
  // 这就是「轮播右边没显示全、要双指缩小才看得到」的**主因**（2026-10-02 实测；
  // 倾斜只是额外多顶出约 4px，不是根因）。
  return (
    <MotionReveal delay={0.14} y={32} rotate={2} className="min-w-0">
      {/* 窄屏不倾斜、md 以上保留 —— 倾斜是这套 neo 风格的标志，但旋转元素的包围盒
          会随高度变宽（694px 高的卡片转 2° 横向多出约 24px），窄屏不值得为它冒险。 */}
      <div ref={cardRef} className="neo-card-lg relative p-3 md:rotate-2" style={{ background: "var(--neo-panel)" }}>
        <Carousel setApi={setApi} plugins={[plugin.current]} opts={{ loop: mods.length > 1 }}>
          <CarouselContent className="ml-0">
            {mods.map((mod, index) => (
              <CarouselItem key={mod.id} className="pl-0">
                {/* 点击不跳转到 /mods/<id>，改为就地打开右侧详情抽屉（与角色分类页一致）。
                    但元素本身得是真链接：`<div role="button" onClick>` 在 React 水合之前
                    没有事件处理器，点了完全没反应；真 <a href> 则会走浏览器原生跳转
                    （那个页面本身就会带着抽屉渲染出来），至少给得出加载指示。
                    见 memory: prerender-click-dead-window。
                    真链接顺带把键盘可达性也带来了：回车与点击同路径，不用再手写 onKeyDown。 */}
                <Link
                  href={`/mods/${mod.id}`}
                  prefetch={false}
                  aria-label={`查看 ${mod.title} 详情`}
                  onClick={(event) => {
                    // 带修饰键（Ctrl/Cmd/中键 → 新标签页）放行给浏览器
                    if (!isPlainLeftClick(event)) return;
                    event.preventDefault();
                    setDrawerModId(mod.id);
                  }}
                  // 按下反馈：纯 CSS，水合前按下去就有反应
                  className="group block cursor-pointer transition-transform duration-150 active:scale-[0.99] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-black"
                >
                  <div className="relative h-[500px] w-full overflow-hidden border-4 border-black bg-black md:h-[560px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mod.coverImage}
                      alt={mod.title}
                      loading={index === 0 ? "eager" : "lazy"}
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                    />


                    <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-2">
                      <Badge className="neo-sticker -rotate-2 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black hover:bg-[var(--neo-secondary)]" style={{ background: "var(--neo-secondary)" }}>
                        推荐 MOD
                      </Badge>
                      <Badge className={`neo-sticker px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black hover:bg-inherit ${index % 2 === 0 ? "rotate-2" : ""}`} style={{ background: index % 2 === 0 ? "var(--neo-accent)" : "var(--neo-muted)" }}>
                        {mod.character}
                      </Badge>
                    </div>

                    <div className="absolute right-3 top-3 z-20 rotate-2 border-4 border-black bg-[#ffd84f] px-2 py-1.5 shadow-[4px_4px_0px_0px_#000] text-black">
                      <div className="flex items-center gap-1"><Star className="size-3 fill-[#ff7a00] text-[#ff7a00]" /><span className="text-sm font-black leading-none">{mod.ratingAverage.toFixed(1)}</span></div>
                      <p className="mt-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-black/70">{mod.ratingCount} 人评分</p>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-24 text-white">
                      <div className="max-w-lg space-y-2.5">
                        <p className="neo-label text-white/65">FEATURED DROP</p>
                        <h2 className="text-sm font-black uppercase leading-tight tracking-[0.16em] text-white/50 transition-colors group-hover:text-white md:text-base">{mod.title.length > 8 ? `${mod.title.slice(0, 8)}...` : mod.title}</h2>
                        <p className="line-clamp-2 text-xs font-bold leading-5 text-white/78 md:text-sm md:leading-6">{mod.description}</p>
                        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-black/80">
                          <HeroCountPills mod={mod} />
                        </div>
                      </div>

                      <div className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full border-2 border-white/75 bg-black/36 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/92 backdrop-blur-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-white group-hover:bg-black/68 group-hover:text-white group-hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                        查看详情
                        <ArrowUpRight className="size-3.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className="left-4 top-1/2 z-30 -translate-y-1/2 border-white/70 bg-white/50 text-black shadow-[3px_3px_0px_0px_#000] backdrop-blur-sm transition-all hover:bg-white hover:shadow-[5px_5px_0px_0px_#000]" />
          <CarouselNext className="right-4 top-1/2 z-30 -translate-y-1/2 border-white/70 bg-white/50 text-black shadow-[3px_3px_0px_0px_#000] backdrop-blur-sm transition-all hover:bg-white hover:shadow-[5px_5px_0px_0px_#000]" />
        </Carousel>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {/* 内层这行也必须 flex-wrap：外层虽能换行，但圆点 + 「推荐精选 02/06」
              这一组本身在窄屏就超过内容宽（295px），不换行会撑到 375px，
              被面板的 overflow-hidden 在 359px 处裁掉 —— 「06」的右边就没了。 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              {mods.map((mod, index) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => api?.scrollTo(index)}
                  className={`border-2 border-black transition-all duration-150 ease-linear ${index === current ? "h-2.5 w-12 bg-[var(--neo-accent)] shadow-[3px_3px_0px_0px_#000]" : "h-2.5 w-6 bg-white/85 hover:w-8 hover:bg-white"}`}
                  aria-label={`跳转到 ${mod.title}`}
                />
              ))}
            </div>
            <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0px_0px_#000]">
              <span className="text-black/55">推荐精选</span>
              <span>{String(current + 1).padStart(2, "0")}</span>
              <span className="text-black/45">/</span>
              <span>{String(mods.length).padStart(2, "0")}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleAutoplay}
            className="neo-button-secondary inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em]"
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {isPlaying ? "暂停轮播" : "播放轮播"}
          </button>
        </div>

        {/* 抽屉走 portal 挂到 body：首页这里的祖先带 rotate/framer-motion 变换，
            留在原地会让 position:fixed 相对该祖先定位而不是视口。
            drawerModId 初值为 null，因此 SSR 阶段不会碰到 document。 */}
        {drawerModId && typeof document !== "undefined"
          ? createPortal(
              <ModDetailDrawer
                admin={admin}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                isLoggedIn={isLoggedIn}
                modId={drawerModId}
                onClose={() => setDrawerModId(null)}
              />,
              document.body,
            )
          : null}
      </div>
    </MotionReveal>
  );
}
