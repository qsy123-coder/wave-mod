import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * 手机端专属首屏：只保留品牌信息与两个主入口。
 *
 * 为什么不在手机端渲染轮播：轮播需要滑过几乎一整个视口，用户第一眼看不到任何
 * 可浏览的内容。参考站（huanmod.top）的手机首页也是「文案 → 列表」直接进入，
 * 所以这里有意识地**不引入任何需要等数据的组件** —— 渲染即得，角色分类紧随其后。
 *
 * 搜索框已经挪进下方「角色分类」面板（`mobile-home-feed.tsx`）：
 * 用户要求的浏览路径是「先选角色、再搜」，搜索与角色筛选放在同一张卡片里更顺手。
 * `prefetch={false}`：首屏链接的默认预取会和下面的角色清单/卡片流抢带宽。
 */
export function MobileHomeIntro() {
  return (
    <section className="px-4 pb-3 pt-4">
      <div className="relative overflow-hidden border-4 border-black bg-[var(--neo-panel)] px-4 py-5 shadow-[8px_8px_0px_0px_#000]">
        <div className="neo-grid absolute inset-0 opacity-30" />
        <div className="absolute -right-3 top-5 size-12 rotate-12 border-4 border-black bg-[var(--neo-secondary)]" />

        <div className="relative space-y-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="neo-sticker -rotate-2 inline-flex items-center gap-1 bg-[var(--neo-accent)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black">
              <Sparkles className="size-3" />
              单主理人精选发布
            </span>
            <span className="neo-label text-black/60">高清预览 · 高速直链</span>
          </div>

          <div>
            <h1 className="text-[2.1rem] font-black leading-[0.95] tracking-tight text-black">
              角色外观资源
            </h1>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-black/45">
              PREVIEW FIRST. DOWNLOAD FAST.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/mods?sort=hot"
              prefetch={false}
              className="neo-button-primary inline-flex items-center gap-1.5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em]"
            >
              热度榜
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              href="/guide"
              prefetch={false}
              className="neo-button-secondary inline-flex items-center gap-1.5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em]"
            >
              安装教程
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
