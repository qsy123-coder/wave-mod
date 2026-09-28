import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Eye, Heart, HardDrive } from "lucide-react";

import { GamebananaGallery } from "@/components/features/gamebanana/gamebanana-gallery";
import { GamebananaVisibilityGate } from "@/components/features/gamebanana/gamebanana-visibility-gate";
import { formatBytes } from "@/lib/gamebanana-domain/format";
// 收窄与格式化都放在 domain 里共享：拆出来的原因是**抽屉**（列表里点卡片打开的那份）
// 要渲染同一批字段。两边各写一份迟早在边界上分叉 —— 页面显示 "12.3 MB"、抽屉显示
// "12.34 MB"，或者一个判 404 另一个判 200。见 filter-params.ts 里 parseGamebananaGbId 的注释。
import { parseGamebananaGbId } from "@/lib/gamebanana-domain/filter-params";
import { getGamebananaModById } from "@/lib/gamebanana-domain/public";

type PageProps = {
  params: Promise<{ gb_id: string }>;
};

export const revalidate = 21600;
export const dynamicParams = true;

/**
 * `noindex, follow`：本页是从 GameBanana 搬运来的**副本**。
 *
 * 内容确实在 HTML 里（与 `/mods/<id>` 不同，那边是空壳 + 客户端抽屉），所以这一页
 * 对分享链接、慢网络、爬虫都是真的可读。但正因为它有真内容，更不该被收录：
 * 让几百个第三方作品的副本去和原站争排名，对谁都没好处；原站链接就在正文里。
 * `follow` 保留，页内链（角色分类、返回列表）照常传递权重。
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gb_id } = await params;
  const gbId = parseGamebananaGbId(gb_id);
  if (gbId === null) return { title: "内容不存在", robots: { index: false, follow: true } };

  const mod = await getGamebananaModById(gbId);
  if (!mod) return { title: "内容不存在", robots: { index: false, follow: true } };

  return {
    title: `${mod.title} — GameBanana 搬运`,
    description: `${mod.character} 的鸣潮 MOD，来自 GameBanana 搬运合集。`,
    alternates: { canonical: `/gamebanana/${gbId}` },
    robots: { index: false, follow: true },
  };
}

export default async function GamebananaDetailPage({ params }: PageProps) {
  const { gb_id } = await params;
  const gbId = parseGamebananaGbId(gb_id);
  if (gbId === null) notFound();

  const mod = await getGamebananaModById(gbId);
  // 未发布 / 不存在 / 读库失败都落到这里。`public.ts` 读失败时也返回 null
  // —— 「读不到」与「没有这条」对用户是同一件事：没有这个页面。
  if (!mod) notFound();

  const gbProfileUrl = `https://gamebanana.com/mods/${mod.gbId}`;
  const size = formatBytes(mod.fileSize);
  // 相册为空时退回封面，别渲染一个空画廊
  const gallery = mod.images.length > 0 ? mod.images : mod.coverImage ? [mod.coverImage] : [];
  const category = [mod.gbRootCategory, mod.gbSubcategory].filter(Boolean).join(" › ");

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto scrollbar-minimal py-3">
      <Link
        href="/gamebanana"
        prefetch={false}
        className="mb-4 inline-flex w-fit items-center gap-2 border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
      >
        <ArrowLeft className="size-3.5" />
        返回搬运合集
      </Link>

      <div className="mb-4 space-y-3">
        <h1 className="text-3xl font-black leading-tight text-[#fff8ef]">{mod.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]">
          <Link
            href={`/gamebanana?character=${encodeURIComponent(mod.character)}`}
            prefetch={false}
            className="border-[3px] border-black bg-[#ffd84f] px-2.5 py-1 text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
          >
            {mod.character}
          </Link>
          <span className="border-[3px] border-black bg-white px-2.5 py-1 text-black shadow-[3px_3px_0px_0px_#000]">
            版本 {mod.version ?? "未标注"}
          </span>
          {category ? (
            <span className="border-[3px] border-black bg-[#bcaeff] px-2.5 py-1 text-black shadow-[3px_3px_0px_0px_#000]">
              {category}
            </span>
          ) : null}
        </div>
      </div>

      <GamebananaVisibilityGate visibility={mod.visibility}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* 预览图：与抽屉共用同一个组件 —— 两边渲染的必须是同一批图、
              同一句文案、同一套交互（横排缩略图 + 点开灯箱，见 gamebanana-gallery.tsx） */}
          <div className="space-y-1">
            {gallery.length === 0 ? (
              <div className="border-4 border-black bg-white p-8 text-center text-sm font-bold text-black/60 shadow-[6px_6px_0px_0px_#000]">
                这件作品没有提供预览图。
              </div>
            ) : (
              <GamebananaGallery images={gallery} title={mod.title} />
            )}
          </div>

          {/* 侧栏：下载与出处 */}
          <aside className="space-y-4">
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
                下载直连 GameBanana 的文件服务器，不经过本站。若链接失效，
                请以原作品页为准。
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
                  <p className="border-t-[3px] border-black pt-2 text-black/60">平台扫描：{mod.avStatus}</p>
                ) : null}
              </div>
            </div>

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
              <a
                href={gbProfileUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-flex items-center gap-1.5 border-[3px] border-black bg-[#ffd84f] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
              >
                <ExternalLink className="size-3.5" />
                查看原作品页
              </a>
            </div>

            {/*
              刻意**不渲染** mod.description（`GameBanana` 的简介正文）。那一段是
              从平台原文剥掉 HTML 后存下来的长文本，本站此前把它入库只为留档，
              是否对外展示仍待确认（PRD AC 128）。要开只需在这里加一段渲染，
              数据已经在 `getGamebananaModById` 的返回值里 —— 不用改查询。
            */}
          </aside>
        </div>
      </GamebananaVisibilityGate>
    </div>
  );
}
