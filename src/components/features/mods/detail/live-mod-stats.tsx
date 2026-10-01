"use client";

import { Heart, Star, ThumbsUp } from "lucide-react";

import { useEngagement } from "@/lib/engagement/use-engagement";

type Props = {
  modId: string;
  /** 服务端快照里的值，只用来打底（首屏/hydration 一致），随后被实时值覆盖 */
  likes: number;
  favorites: number;
  views: number;
  /** 这两个仍来自快照，本次改造没有动它们的数据源 */
  ratingAverage: number;
  downloads: number;
};

/**
 * 详情页右侧的统计块。
 *
 * 抽成客户端组件的原因：点赞 / 收藏 / 浏览这三个数已经改由游客互动通道提供，
 * 而它们所在的页面是**服务端组件**，没法在里面挂 hook。
 *
 * ⚠️ 不能直接渲染 props 里的 `likes/favorites/views`：那三个值源头是 Supabase 快照，
 * 而互动写入早已不再进 Supabase —— 直接渲染会永远停在基线，等多久都不会变。
 * 评分与下载量不在本次改造范围内，照旧直接渲染。
 */
export function LiveModStats({ modId, likes, favorites, views, ratingAverage, downloads }: Props) {
  const { counts } = useEngagement(modId, { likes, favorites, views });

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-2">
        <div className="border-4 border-black bg-[#ffd84f] p-3 shadow-[5px_5px_0px_0px_#000]"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">当前评分</p><p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black"><Star className="size-4 fill-[#ff7a00] text-[#ff7a00]" />{ratingAverage.toFixed(1)}</p></div>
        <div className="border-4 border-black bg-[#fff0cf] p-3 shadow-[5px_5px_0px_0px_#000]"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">下载量</p><p className="mt-1.5 text-xl font-black">{downloads}</p></div>
        <div className="border-4 border-black bg-[#ff7a7a] p-3 shadow-[5px_5px_0px_0px_#000]"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">点赞量</p><p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black"><ThumbsUp className="size-4" />{counts.likes}</p></div>
        <div className="border-4 border-black bg-[#bcaeff] p-3 shadow-[5px_5px_0px_0px_#000]"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">收藏量</p><p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black"><Heart className="size-4" />{counts.favorites}</p></div>
      </div>

      <div className="border-4 border-black bg-white p-3 shadow-[5px_5px_0px_0px_#000]"><div className="grid gap-2 text-[11px] font-black leading-6 sm:grid-cols-2"><div className="flex items-center justify-between gap-3 sm:col-span-2"><span>浏览量</span><span>{counts.views}</span></div></div></div>
    </>
  );
}
