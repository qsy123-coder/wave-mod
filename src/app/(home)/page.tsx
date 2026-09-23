import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle, QrCode, Sparkles } from "lucide-react";

import { DailyUpdateDialog } from "@/components/common/daily-update-dialog";
import { LazyHomeLower } from "@/components/features/home/lazy-lower-home";
import { HeroCarousel } from "@/components/features/home/hero-carousel";
import { FeaturedCarouselSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
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
            <div className="relative overflow-hidden border-4 border-black bg-[var(--neo-panel)] px-5 py-6 shadow-[12px_12px_0px_0px_#000] sm:px-6 lg:px-8 lg:py-8">
              <div className="neo-grid absolute inset-0 opacity-40" />
              <div className="absolute -left-4 top-6 h-14 w-14 rotate-12 border-4 border-black bg-[var(--neo-secondary)]" />
              <div className="absolute right-8 top-8 hidden h-16 w-16 rounded-full border-4 border-black bg-[var(--neo-muted)] lg:block" />
              <div className="relative grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                <div className="max-w-xl space-y-5 lg:pr-2">
                  {/* 眉标行：徽章 + 卖点合并成一行 */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <MotionReveal delay={0.02} rotate={-2}>
                      <Badge className="neo-sticker -rotate-2 bg-[var(--neo-accent)] px-4 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-black hover:bg-[var(--neo-accent)]">
                        <Sparkles className="mr-1 size-3" />
                        单主理人精选发布
                      </Badge>
                    </MotionReveal>
                    <MotionReveal delay={0.06}>
                      <p className="neo-label text-black/60">高清预览 · 高速直链 · 移动端友好</p>
                    </MotionReveal>
                  </div>

                  {/* 大标题：唯一视觉焦点（去掉多余贴纸盒/旋转） */}
                  <MotionReveal delay={0.1}>
                    <div className="space-y-2">
                      <h1 className="max-w-3xl text-[2.65rem] font-black uppercase leading-[0.92] tracking-tight text-black md:text-5xl xl:text-[3.6rem]">
                        鸣潮角色 MOD
                      </h1>
                      <p className="neo-headline-stroke max-w-3xl text-[1.7rem] font-black uppercase leading-[0.94] tracking-tight md:text-[2.15rem] xl:text-[2.7rem]">
                        PREVIEW FIRST. DOWNLOAD FAST.
                      </p>
                    </div>
                  </MotionReveal>

                  {/* 社区轻量条（不旋转、无卡片，两行排布） */}
                  <MotionReveal delay={0.16}>
                    <div className="space-y-2 border-y-2 border-black/15 py-3">
                      {/* 行1：群名 + 群号 */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1.5 text-lg font-black text-black">
                          <MessageCircle className="size-5" />
                          QQ交流群
                        </span>
                        <span className="font-mono text-lg font-black tracking-normal text-black">
                          342432956
                        </span>
                      </div>
                      {/* 行2：进入频道 + 扫码 */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Link
                          href="https://pd.qq.com/s/6tajhe3vz?b=9"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-lg font-black uppercase tracking-[0.1em] text-black underline-offset-4 hover:underline"
                        >
                          进入鸣潮QQ频道
                          <ArrowRight className="size-4" />
                        </Link>
                        <div className="group relative inline-flex">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-lg font-black tracking-[0.06em] text-black underline-offset-4 hover:underline"
                            aria-label="qq内扫描二维码进入QQ频道"
                          >
                            <QrCode className="size-4" />
                            qq内扫描二维码进入QQ频道
                          </button>
                          <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 w-44 -translate-x-1/2 border-4 border-black bg-white p-1.5 shadow-[8px_8px_0px_0px_#000] opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                            <Image
                              src="/qq-channel/qrcode.jpg"
                              alt="鸣潮QQ频道二维码"
                              width={176}
                              height={264}
                              className="h-auto w-full"
                            />
                            <p className="pb-1 pt-1.5 text-center text-xs font-black uppercase tracking-[0.08em] text-black/60">
                              QQ频道 · 扫一扫加入
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* 副文案 */}
                      <p className="text-lg font-medium text-black/75">
                        获取
                        <span className="mx-1 inline-block rounded-none border-2 border-black bg-neo-accent/30 px-1.5 py-0.5 font-black text-black">
                          每日mod更新
                        </span>
                        ，并且
                        <span className="mx-1 inline-block rounded-none border-2 border-black bg-neo-accent/30 px-1.5 py-0.5 font-black text-black">
                          QQ群内上传了部分MOD
                        </span>
                        ，可按需下载。
                      </p>
                    </div>
                  </MotionReveal>

                  {/* 正文（恢复为文字卡片，不旋转） */}
                  <MotionReveal delay={0.2}>
                    <p className="max-w-lg border-4 border-black bg-white px-4 py-3 text-sm leading-6 text-black md:text-[15px] md:leading-6">
                      以角色为中心整理 MOD，突出高清预览与直链下载体验，减少网盘跳转和限速干扰。
                    </p>
                  </MotionReveal>

                  {/* 主操作 */}
                  <MotionReveal delay={0.24}>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <Link
                        href="/mods?sort=hot"
                        className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]"
                      >
                        查看热度榜
                        <ArrowRight className="size-4" />
                      </Link>
                      <Link
                        href="/guide"
                        className="neo-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]"
                      >
                        先看安装教程
                        <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </MotionReveal>
                </div>
                <Suspense fallback={<FeaturedCarouselSkeleton />}>
                  <HomeFeaturedCarousel />
                </Suspense>
              </div>
            </div>
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
