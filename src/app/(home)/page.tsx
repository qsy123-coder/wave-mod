import { Suspense } from "react";

import { DailyUpdateDialog } from "@/components/common/daily-update-dialog";
import { HeroCarousel } from "@/components/features/home/hero-carousel";
import { HomeHeroIntro } from "@/components/features/home/home-hero-intro";
import { LazyHomeLower } from "@/components/features/home/lazy-lower-home";
import { FeaturedCarouselSkeleton } from "@/components/layout/data-skeletons";
import { getFeaturedMods } from "@/lib/mods";

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

// ─── 首页 ────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <DailyUpdateDialog />
      <SnapContainer>
        {/* 区域 1: 现有 Hero（垂直居中，上下各 15vh 留白）。
             高度基准用"仅导航栏行"的 --home-hero-h（恒定），而非含横条的 --site-header-h，
             这样顶部横条开/关时大卡片与导航栏的间距保持不变。 */}
        <section
          className="relative flex w-full items-center pt-[11vh] pb-[15vh] h-[calc(100vh-var(--home-hero-h))] max-md:pt-4 max-md:pb-4 max-md:h-auto"
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
          className="h-full w-full overflow-hidden max-md:h-auto"
          style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <LazyHomeLower />
        </section>
      </SnapContainer>
    </>
  );
}
