import type { ReactNode } from "react";

import { HomeHeroIntro } from "@/components/features/home/home-hero-intro";
import { FeaturedCarouselSkeleton, ModGridSkeleton, ModsPageSkeleton, SkeletonBar } from "@/components/layout/data-skeletons";

/**
 * 跨页导航骨架屏的**逐页版本**。
 *
 * 背景：`PageLoadingOverlay` 是唯一一个跨页覆盖层（点顶部导航时立刻盖上，路由变过去才收）。
 * 它此前对所有页面都用同一套「两行条 + 5 列 mod 网格」，于是跳到图库（暗色沉浸式图片网格、
 * 连站点 header 都没有）、先看我（定高 flex 列）、问题解答（340px 可拖拽双栏）、
 * 每日更新（180px 日期侧栏 + 分组网格）时，骨架与目标页版式完全对不上、切换瞬间形状跳变。
 *
 * 这里按目标路径挑一套几何对得上的骨架。两条硬约束：
 *
 * 1. **背景色必须跟目标页一致**（见 `PageSkeleton.background`）。覆盖层是 `fixed inset-0`，
 *    底色不对的话，点击瞬间会先闪一下别的颜色再切过去，比没有骨架还难看。图库尤其明显 ——
 *    它把暗底设在 `<html>` 上（`gallery/layout.tsx`），跟站点那套棕色点阵底毫无关系。
 * 2. **每个骨架根节点带 `data-slot`**（`page-skeleton-<name>`），供 CDP 验收断言「跳这个页面
 *    时出现的是这套骨架」，也方便以后排查。仓库里 `character-picker-drawer`、
 *    `mobile-character-nav` 已有同样的做法。
 *
 * 路径匹配前会先剥掉分站前缀（`wuthering-waves` / `zenless-zone-zero` / `genshin-impact`），
 * 这样主站与三个分站**复用同一批骨架**，不必各写一份。
 */

/** 站点默认底色 —— 与覆盖层原来那一套一致（棕色点阵）。 */
const SITE_BG =
  "bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px]";

/** 图库的暗底 —— 取自 `gallery/layout.tsx` 设在 `<html>` 上的 `rgb(1, 5, 19)`。 */
const GALLERY_BG = "bg-[rgb(1,5,19)]";

/** 站点内容宽容器，与 `(site)/layout.tsx` 的 `main` 一致。 */
const SITE_WIDTH = "mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6";

export type PageSkeleton = {
  /** 覆盖层背景，必须与目标页一致（否则切换瞬间闪底色） */
  background: string;
  /** 骨架内容（各自带自己的 max-w / padding / 高度） */
  content: ReactNode;
};

const GAME_SLUGS = new Set(["wuthering-waves", "zenless-zone-zero", "genshin-impact"]);

/** 去掉查询串/哈希与尾斜杠；空串归一成 `/`。href 可能带 `?character=…`。 */
function normalizePath(input: string | null): string {
  if (!input) return "/";
  let path = input.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

/** `/zenless-zone-zero/mods` → `/mods`；分站首页 `/zenless-zone-zero` → `/`。 */
function stripGamePrefix(path: string): string {
  const segment = path.split("/")[1];
  if (segment && GAME_SLUGS.has(segment)) {
    const rest = path.slice(segment.length + 1);
    return rest === "" ? "/" : rest;
  }
  return path;
}

/**
 * 按目标路径挑骨架。认不出来的一律回落到通用 mod 网格（即改动前的行为），
 * 保证「任何路径都有东西可显示」，不会出现一片空白。
 */
export function pickPageSkeleton(target: string | null): PageSkeleton {
  const path = stripGamePrefix(normalizePath(target));

  if (path === "/") return { background: SITE_BG, content: <HomePageSkeleton /> };
  if (path === "/mods" || path.startsWith("/mods/")) return { background: SITE_BG, content: <ModsNavSkeleton /> };
  if (path === "/gallery") return { background: GALLERY_BG, content: <GallerySkeleton /> };
  if (path === "/guide") return { background: SITE_BG, content: <GuideSkeleton /> };
  if (path === "/updates") return { background: SITE_BG, content: <UpdatesSkeleton /> };
  if (path === "/support") return { background: SITE_BG, content: <SupportSkeleton /> };
  if (path === "/troubleshooting") return { background: SITE_BG, content: <TroubleshootingSkeleton /> };
  if (path === "/ranking") return { background: SITE_BG, content: <RankingSkeleton /> };
  if (path === "/favorites") return { background: SITE_BG, content: <FavoritesSkeleton /> };
  if (path.startsWith("/auth/login")) return { background: SITE_BG, content: <LoginSkeleton /> };

  return {
    background: SITE_BG,
    content: (
      <div data-slot="page-skeleton-generic" className={`${SITE_WIDTH} py-8`}>
        <div className="mb-6 flex items-center gap-3">
          <SkeletonBar className="h-10 w-36" />
          <SkeletonBar className="h-10 flex-1 bg-white/45" />
        </div>
        <ModGridSkeleton count={10} />
      </div>
    ),
  };
}

/* ==================== 各页骨架 ==================== */

/** `/mods` —— 复用为它写好的 `ModsPageSkeleton`（此前全站无人使用）。 */
function ModsNavSkeleton() {
  return (
    // 用 `h-full` 而不是再算一遍 `100dvh - var(--site-header-h)`：遮罩层自己已经整体
    // 下移了一个导航栏的高度（见 page-loading-overlay），它的内容区高度**就等于**
    // `(site)/mods/layout.tsx` 那个 `h-[calc(100dvh-var(--site-header-h))]`。
    // 再扣一次会双重扣减、骨架比真页面矮一截。
    // `[&>*]:h-full` 让 ModsPageSkeleton 的根（`flex gap-6`）撑满，侧栏才会像真页面那样通高。
    <div data-slot="page-skeleton-mods" className={`${SITE_WIDTH} h-full py-3 [&>*]:h-full`}>
      <ModsPageSkeleton />
    </div>
  );
}

/**
 * 首页 —— SnapContainer 的第一屏。
 *
 * **左半用真文案、只有右半是骨架**：首页左列（徽标 / 大标题 / 正文 / 两个按钮）
 * 本来就是静态的、渲染即得，不需要等任何数据 —— 首页自己也只在右半轮播上挂了
 * `FeaturedCarouselSkeleton`。把它一并糊成灰条既难看也没必要，所以这里直接复用
 * 首页那份 `HomeHeroIntro`（与真实页面同一份 JSX，文案不会两边脱节）。
 */
function HomePageSkeleton() {
  return (
    // ⚠️ 这个 section 是**照抄** `(home)/page.tsx` 里那一个的 —— 高度公式、上下 padding、
    // `items-center` 全都一致，一个都不能改，否则垂直位置对不上。
    //
    // 为什么不能自己写「撑满 + 居中」：首页那张 hero 卡（约 717px）**比可视内容区还高**，
    // 真页面靠 `items-center` 让它**上下对称溢出**从而落在离导航栏很近的位置。
    // 而遮罩是个**滚动容器**，滚动容器不允许内容向上溢出（滚不到负偏移），
    // 于是同样的居中会被夹住、整块被往下压约 60px（实测：卡顶 229 vs 真页面 169）。
    // 照抄结构就没有这个夹取，落点与真页面只差「横条高度」那一点（见下）。
    //
    // 残留差异：首页 header 含一条 30px 的「近期上新」横条（--site-header-h 160），
    // 而跳转途中显示的还是上一页的 header（130）。横条要等路由真的切过去才出现，
    // 骨架无从预知 —— 这点差值是这个过渡本身固有的，不是骨架写错。
    <div data-slot="page-skeleton-home">
      {/*
       * 补上首页那条「近期上新」横条的高度：首页 header = 导航栏 + 横条，
       * 而跳转途中显示的仍是上一页的 header（没有横条），遮罩因此从更高的位置铺下来。
       * 横条要等路由真的切过去才渲染，骨架无从预知，只能在这里手动补。
       *
       * 30px / `md` 以下隐藏，都照抄 `components/common/daily-ticker.tsx:70` 的
       * `min-h-[30px] ... md:flex`。**改那边的高度时这里要跟着改。**
       */}
      <div aria-hidden className="hidden h-[30px] md:block" />
      <section className="relative flex w-full items-center h-[calc(100vh-var(--home-hero-h))] pt-[11vh] pb-[15vh] max-md:h-auto max-md:pt-4 max-md:pb-4">
        <div className={SITE_WIDTH}>
          <HomeHeroIntro right={<FeaturedCarouselSkeleton />} />
        </div>
      </section>
    </div>
  );
}

/**
 * 图库 —— **暗色沉浸式**，与站点那套 neo 白底体系无关，所以不用 `SkeletonBar`。
 * 列数照 `gallery-renderer.tsx` 的 `calcCols`（视口 1–7 列），间距 24px、卡片圆角 16px。
 */
function GallerySkeleton() {
  return (
    // `min-h-full` 而不是 `min-h-dvh`：遮罩已整体下移一个导航栏高度，再按整屏算会溢出。
    <div data-slot="page-skeleton-gallery" className="min-h-full px-3 py-6 sm:px-5">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl bg-white/[0.06]"
            // 高低错落，别做成一排整齐的方块 —— 真实图库每张图的宽高比都不同
            style={{ aspectRatio: i % 3 === 0 ? "3 / 4" : i % 3 === 1 ? "4 / 5" : "1 / 1" }}
          />
        ))}
      </div>
    </div>
  );
}

/** 先看我 —— 定高 flex 列：hero 头卡 → 视频卡 → 工具卡 → 章节 Tab 区。 */
function GuideSkeleton() {
  return (
    <div
      data-slot="page-skeleton-guide"
      className={`${SITE_WIDTH} flex flex-col gap-4 py-4 lg:py-6`}
      style={{ height: "calc(100vh - 5rem)" }}
    >
      <div className="shrink-0 border-4 border-black bg-[var(--neo-accent)] px-5 py-4 shadow-[8px_8px_0px_0px_#000]">
        <SkeletonBar className="h-4 w-24 bg-white/70" />
        <SkeletonBar className="mt-3 h-10 w-72 bg-white" />
      </div>
      <SkeletonBar className="h-40 w-full shrink-0 bg-[var(--neo-muted)]" />
      <SkeletonBar className="h-24 w-full shrink-0" />
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="hidden w-64 shrink-0 flex-col gap-2 border-4 border-black bg-[#fff8ef] p-3 shadow-[6px_6px_0px_0px_#000] lg:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} className={`h-10 w-full ${i === 0 ? "bg-[#ff7a7a]" : "bg-white"}`} />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3 border-4 border-black bg-[#fff8ef] p-5 shadow-[6px_6px_0px_0px_#000]">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBar key={i} className={`h-12 w-full ${i % 2 === 0 ? "bg-white" : "bg-white/65"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 每日更新 —— 180px 日期侧栏 + 页头 + 按天分组（组头徽章条 + 分组网格）。 */
function UpdatesSkeleton() {
  return (
    <div data-slot="page-skeleton-updates" className={`${SITE_WIDTH} py-8`}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-8 w-48 bg-[var(--neo-accent)]" />
          <SkeletonBar className="h-4 w-64 bg-white/60" />
        </div>
        <SkeletonBar className="h-6 w-32 bg-white/60" />
      </header>

      <div className="flex gap-6">
        {/* 日期侧栏，与 DailyDateSidebar 同为 w-[180px] 且 lg 以下隐藏 */}
        <div className="hidden w-[180px] shrink-0 flex-col gap-2 lg:flex">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBar key={i} className={`h-12 w-full ${i === 0 ? "bg-[#ff7a7a]" : "bg-white"}`} />
          ))}
        </div>

        <div className="min-w-0 flex-1 space-y-10">
          {Array.from({ length: 2 }).map((_, group) => (
            <div key={group}>
              {/* 组头：日期徽章 + 分隔线 + 数量徽章（照 updates-grid.tsx:43-53） */}
              <div className="mb-4 flex items-center gap-3">
                <SkeletonBar className="h-8 w-40 shrink-0 bg-[var(--neo-secondary)]" />
                <div className="h-px flex-1 bg-white/40 shadow-[0_1px_0_#000]" />
                <SkeletonBar className="h-6 w-12 shrink-0 bg-[var(--neo-muted)]" />
              </div>
              <div className="grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="neo-card bg-[#fff8ef] p-2.5">
                    <div className="overflow-hidden border-4 border-black bg-black">
                      <div className="aspect-[5/6] w-full animate-pulse bg-[var(--neo-muted)] sm:aspect-[4/5]" />
                    </div>
                    <div className="space-y-2 px-1 pb-1 pt-3">
                      <SkeletonBar className="h-5 w-4/5" />
                      <SkeletonBar className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 转载声明 —— 黄底 hero + md 两列彩卡 + 底部整幅卡。 */
function SupportSkeleton() {
  return (
    <div data-slot="page-skeleton-support" className={`${SITE_WIDTH} flex flex-col gap-8 py-8 lg:py-10`}>
      <div className="inline-block w-fit border-4 border-black bg-[var(--neo-accent)] px-5 py-4 shadow-[8px_8px_0px_0px_#000]">
        <SkeletonBar className="h-4 w-24 bg-white/70" />
        <SkeletonBar className="mt-3 h-10 w-80 bg-white" />
        <SkeletonBar className="mt-3 h-4 w-96 max-w-full bg-white/80" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="neo-card-lg h-full space-y-4 p-5"
            style={{ background: ["var(--neo-secondary)", "var(--neo-muted)", "var(--neo-accent)"][i % 3] }}
          >
            <div className="flex items-center gap-3">
              <SkeletonBar className="size-12 shrink-0" />
              <SkeletonBar className="h-7 w-32 bg-white/85" />
            </div>
            <div className="space-y-2">
              <SkeletonBar className="h-4 w-full bg-white/85" />
              <SkeletonBar className="h-4 w-11/12 bg-white/85" />
              <SkeletonBar className="h-4 w-2/3 bg-white/85" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-4 border-black bg-[#fff8ef] p-5 shadow-[8px_8px_0px_0px_#000]">
        <SkeletonBar className="h-5 w-24" />
        <SkeletonBar className="h-4 w-full" />
        <SkeletonBar className="h-4 w-3/4" />
      </div>
    </div>
  );
}

/** 问题解答 —— 340px 左栏 + 拖拽分隔条 + 右栏 Q&A 列表。 */
function TroubleshootingSkeleton() {
  return (
    <div data-slot="page-skeleton-troubleshooting" className={`${SITE_WIDTH} py-6 lg:py-8`}>
      <div className="mb-6 border-4 border-black bg-[var(--neo-accent)] px-5 py-4 shadow-[8px_8px_0px_0px_#000]">
        <SkeletonBar className="h-9 w-64 bg-white" />
        <SkeletonBar className="mt-3 h-4 w-80 max-w-full bg-white/80" />
      </div>
      <div className="flex border-4 border-black bg-[#fff8ef] shadow-[8px_8px_0px_0px_#000]">
        {/* 左 TOC 侧栏，宽度照 TroubleshootingContent 的默认 sidebarWidth=340 */}
        <div className="hidden w-[340px] shrink-0 flex-col gap-2 p-4 lg:flex">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonBar key={i} className={`h-10 w-full ${i === 0 ? "bg-[#ff7a7a]" : "bg-white"}`} />
          ))}
        </div>
        <div className="hidden w-2 shrink-0 bg-black/80 lg:block" />
        <div className="min-w-0 flex-1 space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} className={`h-12 w-full ${i % 2 === 0 ? "bg-white" : "bg-white/65"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 排行 —— hero + 3 列领奖台 + 3 列榜单。 */
function RankingSkeleton() {
  return (
    <div data-slot="page-skeleton-ranking" className={`${SITE_WIDTH} flex flex-col gap-8 py-8 lg:py-10`}>
      <div className="inline-block w-fit border-4 border-black bg-[var(--neo-accent)] px-5 py-4 shadow-[8px_8px_0px_0px_#000]">
        <SkeletonBar className="h-4 w-20 bg-white/70" />
        <SkeletonBar className="mt-3 h-10 w-64 bg-white" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="neo-card bg-[var(--neo-panel)] p-3">
            <SkeletonBar className="aspect-[4/5] w-full" />
            <SkeletonBar className="mt-3 h-7 w-4/5" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="space-y-3 border-4 border-black bg-[#fff8ef] p-4 shadow-[6px_6px_0px_0px_#000]">
            <SkeletonBar className="h-8 w-32 bg-[var(--neo-secondary)]" />
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBar key={i} className="h-11 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 收藏 —— hero + 操作行 + 2/3 列卡片（网格列数与 /mods 的 5 列不同）。 */
function FavoritesSkeleton() {
  return (
    <div data-slot="page-skeleton-favorites" className={`${SITE_WIDTH} flex flex-col gap-8 py-8 lg:py-10`}>
      <div className="inline-block w-fit border-4 border-black bg-[var(--neo-muted)] px-5 py-4 shadow-[8px_8px_0px_0px_#000]">
        <SkeletonBar className="h-4 w-20 bg-white/70" />
        <SkeletonBar className="mt-3 h-10 w-56 bg-white" />
      </div>
      <div className="flex flex-wrap gap-3">
        <SkeletonBar className="h-11 w-40" />
        <SkeletonBar className="h-11 w-36 bg-[var(--neo-accent)]" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[420px] w-full animate-pulse border-4 border-black bg-[var(--neo-panel)] shadow-[6px_6px_0px_0px_#000]" />
        ))}
      </div>
    </div>
  );
}

/** 登录 —— 独立 layout（无站点 header / 无内容容器），所以是居中的单张卡。 */
function LoginSkeleton() {
  return (
    <div data-slot="page-skeleton-login" className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="h-[360px] w-full max-w-md animate-pulse border-4 border-black bg-[var(--neo-panel)] shadow-[8px_8px_0px_0px_#000]" />
    </div>
  );
}
