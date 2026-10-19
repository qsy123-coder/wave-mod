"use client";

import { Download, Eye, Heart } from "lucide-react";

import { useEngagement } from "@/lib/engagement/use-engagement";

type Props = {
  modId: string;
  /** 服务端快照里的值，只用来打底（首屏/hydration 一致），随后被实时值覆盖 */
  favorites: number;
  views: number;
  /** 下载量由下载路由正常累加，不在互动计数器里 */
  downloads: number;
};

/**
 * 详情页右侧的统计块。
 *
 * 浏览 / 收藏两个数来自游客互动通道（客户端实时值）；下载量直接取详情数据。
 * 点赞与评分入口已从站内移除，这里不再展示。
 */
export function LiveModStats({ modId, favorites, views, downloads }: Props) {
  const { counts } = useEngagement(modId, { likes: 0, favorites, views });

  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      <div className="border-4 border-black bg-[#fff0cf] p-3 shadow-[5px_5px_0px_0px_#000]">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">下载量</p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black">
          <Download className="size-4" />
          {downloads}
        </p>
      </div>
      <div className="border-4 border-black bg-[#bcaeff] p-3 shadow-[5px_5px_0px_0px_#000]">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">收藏量</p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black">
          <Heart className="size-4" />
          {counts.favorites}
        </p>
      </div>
      <div className="border-4 border-black bg-white p-3 shadow-[5px_5px_0px_0px_#000]">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55">浏览量</p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xl font-black">
          <Eye className="size-4" />
          {counts.views}
        </p>
      </div>
    </div>
  );
}
