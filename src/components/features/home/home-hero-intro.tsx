import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";

/**
 * 首页 Hero 大卡的**外壳 + 左半文案**：左列是徽标 / 大标题 / 正文 / 两个按钮，
 * 右边留一个插槽给「需要等数据的东西」（真正的轮播）。
 *
 * 为什么单独抽出来：跨页导航骨架（`page-skeletons.tsx` 的 `HomePageSkeleton`）
 * 要原样用它当占位。首页左列本来就是**渲染即得的静态文案**、不依赖任何数据 ——
 * 把它也糊成灰条既难看也没必要。两处共用同一份 JSX，文案改动不会只改一边。
 *
 * 右侧插槽由调用方给：
 *   - 首页给 `<Suspense fallback={<FeaturedCarouselSkeleton/>}><HomeFeaturedCarousel/></Suspense>`
 *   - 骨架直接给 `<FeaturedCarouselSkeleton/>`
 */
export function HomeHeroIntro({ right }: { right: ReactNode }) {
  return (
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
                角色外观资源
              </h1>
              <p className="neo-headline-stroke max-w-3xl text-[1.7rem] font-black uppercase leading-[0.94] tracking-tight md:text-[2.15rem] xl:text-[2.7rem]">
                PREVIEW FIRST. DOWNLOAD FAST.
              </p>
            </div>
          </MotionReveal>

          {/* 正文（恢复为文字卡片，不旋转） */}
          <MotionReveal delay={0.2}>
            <p className="max-w-lg border-4 border-black bg-white px-4 py-3 text-sm leading-6 text-black md:text-[15px] md:leading-6">
              以角色为中心整理外观资源，突出高清预览与直链下载体验，减少网盘跳转和限速干扰。
            </p>
          </MotionReveal>

          {/* 主操作。prefetch={false}：这是首屏可见的链接，App Router 默认会在
              它们进入视口时就去预取目标路由的 RSC payload —— 首屏可见的链接一共有
              十几个，实测第一帧就发出约 50 个预取请求、67 KB，和首屏图抢同一条链路。
              站内已有导航骨架屏兜底，点击后的等待感不会更差。 */}
          <MotionReveal delay={0.24}>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/mods?sort=hot"
                prefetch={false}
                className="neo-button-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]"
              >
                查看热度榜
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/guide"
                prefetch={false}
                className="neo-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em]"
              >
                先看安装教程
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </MotionReveal>
        </div>
        {right}
      </div>
    </div>
  );
}
