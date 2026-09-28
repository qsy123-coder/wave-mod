"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Eye, HardDrive, Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GamebananaGallery } from "@/components/features/gamebanana/gamebanana-gallery";
import { GamebananaVisibilityGate } from "@/components/features/gamebanana/gamebanana-visibility-gate";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatBytes } from "@/lib/gamebanana-domain/format";
import type { GamebananaMod, GamebananaModDetail } from "@/lib/gamebanana-domain/types";

type GamebananaDetailDrawerProps = {
  /**
   * 列表里那一行。抽屉**先用它立刻画出来**（标题、角色、版本、数据、下载入口都在
   * 列表 payload 里），再去补只有详情才有的相册与来源分类 —— 所以打开抽屉不需要
   * 等任何请求，看不到骨架屏，断网也只是少一块预览图。
   */
  mod: GamebananaMod;
  onClose: () => void;
  /**
   * 点角色标签：切成该角色的筛选。**关抽屉由调用方一并做**（它同时要改筛选与 URL，
   * 分两步做会推出两条历史记录）。这里不做动画退场，见 handleOpenChange 的注释。
   */
  onCharacterClick: (character: string) => void;
};

/**
 * 点卡片就地打开的详情抽屉，与 `/mods` 的 `ModDetailDrawer` 同一套交互。
 *
 * 与站内 `mods` 抽屉的三处结构差别，都是「数据来源不同」推出来的：
 *
 * 1. **没有标签页 / 评论 / 评分 / 收藏**。那些控件写的是 `mods`、`favorites`、
 *    评论那几张表，而这里的 id 是 GameBanana 的数字 id —— 同 `ModCard` 关掉那三个
 *    展示位的理由（见 mappers.ts 的 `toSiteMod`）。要做就得先有对应的表。
 * 2. **元数据来自 props 而不是请求**。列表已经下发全库，没必要为了标题再打一次口。
 * 3. **下载是单一外链**，不是 `drive_links` 数组，所以直接一个 `<a>` 出去。
 *
 * 直接访问 `/gamebanana/<gb_id>` 走的仍是服务端整页（那份 HTML 里有真内容，
 * 对分享链接与慢网络更友好）；抽屉只是「在列表里点开」这条路上的加速，
 * 两边渲染的字段与文案必须保持一致 —— 所以 `formatBytes` 这类取同一个函数。
 */
export function GamebananaDetailDrawer({ mod, onClose, onCharacterClick }: GamebananaDetailDrawerProps) {
  const [isOpen, setIsOpen] = useState(true);

  /**
   * 只取列表**刻意没下发**的那几个字段。拿到之前抽屉已经可读可下载，
   * 所以这里没有 loading 骨架屏，失败也只是少一块预览图 + 一行提示。
   */
  const { data, isPending, isError } = useQuery({
    queryKey: ["gamebanana-detail", mod.gbId],
    queryFn: async () => {
      const response = await fetch(`/api/gamebanana/${mod.gbId}`);
      if (!response.ok) throw new Error(response.status === 404 ? "not_found" : "fetch_error");
      return (await response.json()) as GamebananaModDetail;
    },
  });

  /**
   * 退场动画走完再真正卸载：`Sheet` 的滑出是 200ms，立刻 unmount 会看到抽屉
   * 凭空消失（与 `ModDetailDrawer.handleOpenChange` 同一条，时长要跟着 Sheet 改）。
   *
   * 定时器要在卸载时清掉：点角色标签那条路是**父组件直接把抽屉从树上摘下来**的
   * （见 url-driven 的 handleDrawerCharacter），抽屉自己的退场根本没跑。留着这个
   * 定时器，200ms 后它会调一次 `onClose`，而父组件那时已经把 URL 改成筛选地址了
   * —— 于是同一份地址被推第二条历史记录，用户得按两下「返回」。
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) closeTimer.current = setTimeout(() => onClose(), 200);
  };

  const size = formatBytes(mod.fileSize);
  const category = [data?.gbRootCategory, data?.gbSubcategory].filter(Boolean).join(" › ");
  // 相册拉到了就用相册，否则退回封面 —— 与详情页同一条退化链，别渲染一个空画廊
  const gallery = data?.images?.length ? data.images : mod.coverImage ? [mod.coverImage] : [];

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        overlayClassName="bg-black/5"
        showCloseButton={false}
        customWidth
        // gap-0：SheetContent 基类自带 gap-4（给「头部/正文」那种分块留白），
        // 这里是「标题栏 + 一整块滚动区」，中间多一条 16px 缝只会让 title 下面
        // 那条 border-b-4 悬在半空。
        className="flex w-full flex-col gap-0 bg-[#fff8ef] p-0 text-black sm:w-[52%] lg:w-[44%]"
      >
        {/* 标题栏常驻：分级闸门只拦正文，不拦「这是哪一件作品」 */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-4 border-black px-4 py-3">
          {/* 标题**换行不截断**（与 /mods 抽屉的 truncate 相反）：这是详情，标题本身就是
              内容的一部分，藏掉半截不如让它占两行。`min-w-0 break-words` 是必须的 ——
              少了它，一个长到放不下的标题会把这个 flex 行撑宽，把右边的关闭按钮挤出屏幕。 */}
          <h2 className="min-w-0 break-words text-xl font-black leading-tight tracking-[0.02em]">
            {mod.title}
          </h2>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="inline-flex size-8 shrink-0 items-center justify-center border-[3px] border-black bg-white text-lg font-black leading-none shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            aria-label="关闭详情抽屉"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]">
            {/* 用 button 而不是链接：这是同页状态切换（筛选在本地算），
                走的不是路由。做成链接会撞上「同路由只换 search 的导航被 App Router
                丢掉」那一类（memory: mods-listing-remount-filtered-nav-dead）。 */}
            <button
              type="button"
              onClick={() => onCharacterClick(mod.character)}
              className="border-[3px] border-black bg-[#ffd84f] px-2.5 py-1 text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
            >
              {mod.character}
            </button>
            <span className="border-[3px] border-black bg-white px-2.5 py-1 text-black shadow-[3px_3px_0px_0px_#000]">
              版本 {mod.version ?? "未标注"}
            </span>
            {category ? (
              <span className="border-[3px] border-black bg-[#bcaeff] px-2.5 py-1 text-black shadow-[3px_3px_0px_0px_#000]">
                {category}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <GamebananaVisibilityGate visibility={mod.visibility}>
              <div className="space-y-4">
                {/* 下载与数据 */}
                <div className="border-4 border-black bg-[#fff8ef] p-4 shadow-[6px_6px_0px_0px_#000]">
                  <a
                    href={mod.downloadUrl}
                    target="_blank"
                    // noopener 防 tab-nabbing；nofollow 不给外站传权重（这是搬运来的外链）
                    rel="noopener noreferrer nofollow"
                    className="neo-button-primary flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
                  >
                    <Download className="size-4" />
                    下载（GameBanana）
                  </a>
                  <p className="mt-3 text-[11px] font-bold leading-5 text-black/70">
                    下载直连 GameBanana 的文件服务器，不经过本站。若链接失效，请以原作品页为准。
                  </p>

                  {/* 每个数字都带图标，图标本身就是标签，所以不再配一段可见文字说明 */}
                  <div className="mt-4 space-y-2 border-t-[3px] border-black pt-3 text-[11px] font-bold text-black/80">
                    {size ? (
                      <p className="flex items-center gap-2">
                        <HardDrive className="size-3.5 shrink-0" />
                        <span>{size}</span>
                      </p>
                    ) : null}
                    <p className="flex items-center gap-2">
                      <Heart className="size-3.5 shrink-0" />
                      <span>{mod.likeCount} 点赞</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Eye className="size-3.5 shrink-0" />
                      <span>
                        {mod.viewCount} 浏览 · {mod.downloadCount} 下载
                      </span>
                    </p>
                    {mod.avStatus ? (
                      <p className="border-t-[3px] border-black pt-2 text-black/60">
                        平台扫描：{mod.avStatus}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* 预览图：与详情页同一条「列表不下发相册」的退化链。
                    骨架照真实内容的形状给（横排几块），别用一个整块的大方块 ——
                    形状对不上时图片到达那一帧会整段重排。 */}
                {isPending ? (
                  <div className="flex gap-3 pt-6">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-32 w-32 shrink-0 animate-pulse border-[3px] border-black bg-white shadow-[4px_4px_0px_0px_#000]"
                      />
                    ))}
                  </div>
                ) : isError ? (
                  <div className="border-4 border-black bg-[#ffb5c3] px-4 py-3 text-xs font-bold shadow-[6px_6px_0px_0px_#000]">
                    预览图没加载出来（其余信息不受影响）。可以直接下载，或到原作品页查看。
                  </div>
                ) : (
                  <GamebananaGallery images={gallery} title={mod.title} />
                )}

                {/* 出处与署名 */}
                <div className="border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000]">
                  <p className="neo-label text-black/60">出处与署名</p>
                  <p className="mt-2 text-xs font-bold leading-6 text-black/80">
                    本作品由{" "}
                    {mod.authorUrl ? (
                      <a
                        href={mod.authorUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="underline decoration-2 underline-offset-2"
                      >
                        {mod.authorName ?? "原作者"}
                      </a>
                    ) : (
                      (mod.authorName ?? "原作者")
                    )}{" "}
                    发布在 GameBanana，本站仅做搬运与索引，版权归原作者所有。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`https://gamebanana.com/mods/${mod.gbId}`}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1.5 border-[3px] border-black bg-[#ffd84f] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
                    >
                      <ExternalLink className="size-3.5" />
                      查看原作品页
                    </a>
                    {/* 整页那份可以整页换，抽屉里换页会把「就地浏览」这件事弄丢，
                        所以给一条新标签页打开的同地址入口 */}
                    <a
                      href={`/gamebanana/${mod.gbId}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
                    >
                      在新标签打开
                    </a>
                  </div>
                </div>
              </div>
            </GamebananaVisibilityGate>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
