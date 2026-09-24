"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import { isCurrentNavigationUrl, isPlainLeftClick } from "@/lib/navigation-url";

export type CharacterSidebarItem = {
  label: string;
  href: string;
  count: number;
  isActive: boolean;
};

type CharacterSidebarProps = {
  allLabel: string;
  allHref: string;
  allCount: number;
  isAllActive: boolean;
  characters: CharacterSidebarItem[];
  className?: string;
};

const tagColors = [
  "bg-[#ff7a7a]",
  "bg-[#ffd84f]",
  "bg-[#bcaeff]",
];

/**
 * 点击分类卡片：只拦「原地踏步」，其余一律交给 <Link> 自己走客户端导航。
 *
 * 卡片从 `<button onClick={router.push}>` 换成真 `<a href>`，是为了**水合之前**那一段：
 * 那时 button 上的事件处理器还不存在，点了完全没反应；真链接则会走浏览器原生跳转，
 * 自带加载指示。坏网络下这个死窗口实测有 11~23 秒（memory: prerender-click-dead-window）。
 *
 * 拦「原地踏步」的理由见 navigation-url.ts 顶部：push 一个与当前相同的 URL 不会带来任何
 * 变化（同 URL 不会；旧链接里角色名写成别名时解析结果也相同），只会白白多一条历史记录。
 * 顶部导航早就有同样的短路（site-header-client.tsx 里那句 href === currentUrl）。
 *
 * 三处卡片都写了 `prefetch={false}`：侧边栏几十个分类链接，默认预取会在慢网络下
 * 同时打出几十个请求，正好和用户当前正在看的这一页抢带宽 —— 那正是要治的病。
 */
function handleCardClick(event: MouseEvent<HTMLAnchorElement>, href: string, alreadyActive: boolean) {
  // 带修饰键的点击（Ctrl/Cmd/中键 → 新标签页）放行给浏览器，见 isPlainLeftClick。
  if (!isPlainLeftClick(event)) return;

  if (alreadyActive || isCurrentNavigationUrl(href)) event.preventDefault();
}

export function CharacterSidebar({
  allLabel,
  allHref,
  allCount,
  isAllActive,
  characters,
  className,
}: CharacterSidebarProps) {
  // 筛选条件直接来自 URL（mods-url-driven.tsx）：URL 一变，侧边栏高亮、筛选条、
  // 网格的 queryKey 全都跟着变，所以这里不需要任何本地状态，也不用手工起进度条
  // （顶部进度条由网格的取数状态驱动，见 mods-page-client 的 handleStatusChange）。
  const specialCategories = characters.filter((c) =>
    ["Skins", "Other/Misc", "UI"].includes(c.label)
  );
  const characterItems = characters.filter(
    (c) => !["Skins", "Other/Misc", "UI"].includes(c.label)
  );

  return (
    <aside className={cn("flex shrink-0 flex-col gap-1.5 border-4 border-black bg-[#fff8ef] p-2.5 shadow-[6px_6px_0px_0px_#000]", className)}>
      {/* 全部 */}
      <Link
        href={allHref}
        prefetch={false}
        onClick={(event) => handleCardClick(event, allHref, isAllActive)}
        className={cn(
          "border-[3px] border-black px-2.5 py-1.5 text-left text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
          // 按下反馈（按下态在 hover 之后出，Tailwind 的变体顺序保证它赢过 hover 的位移）
          "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
          isAllActive
            ? "bg-[#ff7a7a] text-black"
            : "bg-white text-black/75"
        )}
      >
        {allLabel}
        <span className="ml-1 text-[9px] opacity-50">{allCount}</span>
      </Link>

      {/* 特殊分类 */}
      {specialCategories.map((item, i) => {
        const avatarPath = getCharacterImagePath(item.label);

        return (
          <Link
            key={item.label}
            href={item.href}
            prefetch={false}
            onClick={(event) => handleCardClick(event, item.href, item.isActive)}
            className={cn(
              "flex items-center gap-2 border-[3px] border-black px-2.5 py-2 text-left text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
              // 按下反馈（按下态在 hover 之后出，Tailwind 的变体顺序保证它赢过 hover 的位移）
              "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
              item.isActive
                ? "bg-[#ff7a7a] text-black"
                : cn("bg-white text-black/75", tagColors[i % tagColors.length])
            )}
          >
            {avatarPath ? (
              <Image
                src={avatarPath}
                alt={item.label}
                width={32}
                height={32}
                unoptimized
                className="size-8 shrink-0 rounded-full border-2 border-black object-cover"
              />
            ) : null}
            {item.label}
            <span className="ml-1 text-[9px] opacity-50">{item.count}</span>
          </Link>
        );
      })}

      {/* 分隔线 */}
      <div className="my-0.5 border-t-[3px] border-black" />

      {/* 角色列表 - 隐藏滚动条 */}
      <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {characterItems.map((item, i) => {
          const avatarPath = getCharacterImagePath(item.label);

          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch={false}
              onClick={(event) => handleCardClick(event, item.href, item.isActive)}
              className={cn(
                "flex items-center gap-2 border-[3px] border-black px-2.5 py-2 text-left text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
                // 按下反馈（按下态在 hover 之后出，Tailwind 的变体顺序保证它赢过 hover 的位移）
                "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                item.isActive
                  ? "bg-[#ff7a7a] text-black"
                  : cn("bg-white text-black/75", tagColors[i % tagColors.length])
              )}
            >
              {avatarPath ? (
                <Image
                  src={avatarPath}
                  alt={item.label}
                  width={32}
                  height={32}
                  unoptimized
                  className="size-8 shrink-0 rounded-full border-2 border-black object-cover"
                />
              ) : null}
              {item.label}
              <span className="ml-1 text-[9px] opacity-50">{item.count}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
