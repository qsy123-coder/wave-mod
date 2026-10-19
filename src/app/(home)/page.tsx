import { Suspense } from "react";

import { DailyUpdateDialog } from "@/components/common/daily-update-dialog";
import { HeroCarousel } from "@/components/features/home/hero-carousel";
import { HomeHeroIntro } from "@/components/features/home/home-hero-intro";
import { LazyHomeLower } from "@/components/features/home/lazy-lower-home";
import { MobileHomeFeed, MobileHomeFeedSkeleton } from "@/components/features/home/mobile-home-feed";
import { MobileHomeIntro } from "@/components/features/home/mobile-home-intro";
import { FeaturedCarouselSkeleton } from "@/components/layout/data-skeletons";
import { getAvailableCharacters, getFeaturedMods, getPublicModsPage } from "@/lib/mods";
import { MODS_PAGE_SIZE } from "@/lib/mods-domain/filter-params";

/**
 * 首页现在可以预渲染了。
 *
 * 以前 `HomeFeaturedCarousel` 要 `await getCurrentUser()` 把登录态烤进 HTML ——
 * 一次 `await cookies()` 就让整页无法静态化（这是 Vercel 额度打穿的两个根因之一），
 * 而它换来的只是「轮播图抽屉里收藏/点赞要不要显示成已登录」。
 *
 * 现在那部分由客户端的 SessionProvider 补齐（见 hero-carousel.tsx）。
 *
 * revalidate 300 与 `/api/updates`、`/api/home/lower` 已有的 300 秒缓存一致：
 * 首页顶部的「近期上新」横条与日期标签由 `Date.now()` 派生，必须保持接近实时。
 */
export const revalidate = 300;

// ─── Scroll-Snap 容器 ───────────────────────────────────────────

function SnapContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      // 首页的滚动者是这个容器而不是 body：轮播图打开详情抽屉时，
      // HeroCarousel 会按这个标记找到并锁住它（见 hero-carousel.tsx）。
      data-scroll-lock-root
      className="h-[calc(100vh-var(--site-header-h))] overflow-y-scroll max-md:h-auto max-md:min-h-[calc(100vh-var(--site-header-h))] max-md:overflow-y-auto"
      style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}
    >
      {children}
    </div>
  );
}

// ─── 区域 1: 现有 Hero ──────────────────────────────────────────

async function HomeFeaturedCarousel() {
  // 轮播图点击后就地打开详情抽屉；抽屉里的收藏/点赞/评论所需的登录态与管理员标记
  // 由 HeroCarousel 自己从 SessionProvider 取 —— 这里不再读 cookie，首页因此可静态化。
  const mods = await getFeaturedMods(6);

  return <HeroCarousel mods={mods} />;
}

/**
 * 手机端第二屏的**首屏种子**：角色清单 + 第一页资源。
 *
 * 两者都走已有缓存（getAvailableCharacters / getPublicModsPage 的 6 小时分片缓存），
 * 不会因为首页每 5 分钟重渲染就扫一遍全表。种子直接放进 HTML 的目的是让首屏头像
 * 与第一页卡片图从 HTML 解析阶段就开始下载，而不是等 JS 水合后再打两个 API。
 */
async function MobileHomeFeedSeed() {
  const [characters, page] = await Promise.all([
    getAvailableCharacters(),
    getPublicModsPage(1, MODS_PAGE_SIZE, { sort: "latest" }),
  ]);

  return (
    <MobileHomeFeed
      initialCharacters={characters}
      initialMods={page.items}
      initialTotalCount={page.totalCount}
    />
  );
}

// ─── 首页 ────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <DailyUpdateDialog />

      {/*
       * 手机端（< 768px）：普通长滚动，不使用截屏吸附。
       *
       * 结构参考 huanmod.top：简洁首屏 → 角色分类 → 资源卡片流。
       * 这里**不渲染**桌面那套轮播与 ZZZ 第二屏，而不是用 CSS 藏起来：
       * 藏起来的 LazyHomeLower 仍会挂载、仍可能触发 IntersectionObserver；
       * 直接不渲染才是确定的「零请求、零高度」。
       */}
      <div className="md:hidden">
        <MobileHomeIntro />
        <Suspense fallback={<MobileHomeFeedSkeleton />}>
          <MobileHomeFeedSeed />
        </Suspense>
      </div>

      {/* 桌面端（≥ 768px）：与改动前完全一致 —— 大卡 + 轮播 + 第二屏 + 整屏吸附 */}
      <div className="hidden md:block">
        <SnapContainer>
          {/* 区域 1: 现有 Hero（垂直居中，上下各 15vh 留白）。
               高度基准用"仅导航栏行"的 --home-hero-h（恒定），而非含横条的 --site-header-h，
               这样顶部横条开/关时大卡片与导航栏的间距保持不变。 */}
          <section
            className="relative flex w-full items-center pt-[11vh] pb-[15vh] h-[calc(100vh-var(--home-hero-h))]"
            style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}
          >
            <div className="mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">
              {/* 左半文案是静态的、渲染即得；只有右半轮播要等 getFeaturedMods。
                  外壳与左半抽到 HomeHeroIntro，跨页导航骨架复用同一份（见 page-skeletons.tsx）。 */}
              <HomeHeroIntro
                right={
                  <Suspense fallback={<FeaturedCarouselSkeleton />}>
                    <HomeFeaturedCarousel />
                  </Suspense>
                }
              />
            </div>
          </section>

          {/* 区域 2: ZZZ 风格内容（滚动到该屏才加载，首屏不触发，浏览器不再长时间转圈） */}
          <section
            id="snap-section-2"
            className="h-full w-full overflow-hidden"
            style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}
          >
            <LazyHomeLower />
          </section>
        </SnapContainer>
      </div>
    </>
  );
}
