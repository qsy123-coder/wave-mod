"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import { isCurrentNavigationUrl, isPlainLeftClick } from "@/lib/navigation-url";
import { useNavigationLoading } from "@/components/layout/navigation-loading-context";
import { CharacterPickerDrawer } from "./character-picker-drawer";

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
 * 点击分类卡片：拦「原地踏步」，其余**先把选中的角色写成乐观值**再交给 `<Link>` 走导航。
 *
 * 卡片从 `<button onClick={router.push}>` 换成真 `<a href>`，是为了**水合之前**那一段：
 * 那时 button 上的事件处理器还不存在，点了完全没反应；真链接则会走浏览器原生跳转、
 * 自带加载指示。坏网络下那个死窗口实测有 11~23 秒（memory: prerender-click-dead-window）。
 * 三处卡片都写了 `prefetch={false}`：几十个分类链接默认预取会在慢网络下同时打出几十个
 * 请求，正好和用户当前正看的那页抢带宽 —— 那正是要治的病。
 *
 * 拦「原地踏步」的理由见 navigation-url.ts 顶部：push 一个与当前相同的 URL 不会带来任何
 * 变化（旧链接里角色名写成别名时解析结果也相同），只会白多一条历史记录。
 *
 * 为什么要点亮乐观值：右侧网格的骨架由**它自己的取数状态**驱动，而取数要等客户端导航
 * 把 RSC 拿回来、queryKey 变了才开始 —— 在那之前界面完全没反应（用户报告：「点左侧
 * 角色头像，右侧骨架屏没有秒出」）。
 *
 * ⚠️ 写法上有个硬约束：**不能去写 `isLoading`**。那是网格独有的写入口
 * （mods-page-client 的 handleStatusChange），别处写会被它下一次回报当场覆盖（实测过）。
 * 所以这里写的是**另一个**状态 `pendingCharacter`，由网格加算进加载态，两边互不打架。
 * 被 preventDefault 拦掉的分支不能写：那次点击不导航，写了只能等看门狗兜底。
 */
function handleCardClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  alreadyActive: boolean,
  label: string,
  setPendingCharacter: (character: string | null) => void,
) {
  // 带修饰键的点击（Ctrl/Cmd/中键 → 新标签页）放行给浏览器，见 isPlainLeftClick。
  if (!isPlainLeftClick(event)) return;

  if (alreadyActive || isCurrentNavigationUrl(href)) {
    event.preventDefault();
    return;
  }

  // 认不出标签就不写：宁可没有乐观值，也不要写一个永远不会被匹配清掉的进去
  if (label) setPendingCharacter(label);
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
  // 网格的 queryKey 全都跟着变，所以筛选本身不需要任何本地状态，也不用手工起进度条
  // （顶部进度条由网格的取数状态驱动，见 mods-page-client 的 handleStatusChange）。
  // 下面这个 pickerOpen 是抽屉自己的开合，与筛选无关。
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pendingCharacter, setPendingCharacter } = useNavigationLoading();

  /**
   * 导航落地就把乐观值清掉。
   *
   * `isActive` 由 URL 派生（mods-url-driven）：URL 一更新，被选中的那条就翻转成 active，
   * 此时乐观值已完成使命 —— 网格自己也已经接手在转圈了。清晚了没有副作用，但不清会让
   * 骨架一直挂到看门狗（60s）。
   */
  useEffect(() => {
    if (pendingCharacter === null) return;
    const landed =
      (isAllActive && pendingCharacter === allLabel) ||
      characters.some((c) => c.isActive && c.label === pendingCharacter);
    if (landed) setPendingCharacter(null);
  }, [allLabel, characters, isAllActive, pendingCharacter, setPendingCharacter]);

  /**
   * 四条关闭路径（点遮罩 / Esc / 右上 ✕ / 点选角色）都汇到这里，统一回收焦点。
   *
   * useCallback 是必需的，不只是优化：抽屉里 Esc 的 useEffect 依赖 onOpenChange，
   * 引用不稳定的话每次渲染都会把 window 上的监听重挂一遍。
   */
  const handlePickerOpenChange = useCallback((next: boolean) => {
    setPickerOpen(next);
    if (!next) triggerRef.current?.focus();
  }, []);

  /**
   * 点选网格里的分类：先复用侧栏既有的「原地踏步」短路，再显式关闭抽屉。
   *
   * 必须显式关 —— 抽屉是 Client 组件，next/link 的客户端导航不会卸载它，
   * 指望「页面变了抽屉自然没了」是错的。
   *
   * 带修饰键的点击（Ctrl/Cmd/中键 → 新标签页）直接放行且**不关**：用户还留在本页，
   * 抽屉不该消失。
   */
  const handlePickerItemClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string, isActive: boolean) => {
      if (!isPlainLeftClick(event)) return;

      // 抽屉里的格子只回调 (event, href, isActive)，标签得自己按 href 反查 ——
      // 这样不用为了一个 label 去改 character-picker-drawer 的接口。
      const label =
        href === allHref ? allLabel : characters.find((c) => c.href === href)?.label ?? "";

      handleCardClick(event, href, isActive, label, setPendingCharacter);
      handlePickerOpenChange(false);
    },
    [allHref, allLabel, characters, handlePickerOpenChange, setPendingCharacter]
  );

  const specialCategories = characters.filter((c) =>
    ["Skins", "Other/Misc", "UI"].includes(c.label)
  );
  const characterItems = characters.filter(
    (c) => !["Skins", "Other/Misc", "UI"].includes(c.label)
  );

  return (
    <>
      <aside className={cn("flex shrink-0 flex-col gap-1.5 border-4 border-black bg-[#fff8ef] p-2.5 shadow-[6px_6px_0px_0px_#000]", className)}>
        {/*
         * 触发按钮：它控制的是「这份列表怎么看」，属于控制而非内容，所以放在所有分类之前。
         *
         * `sticky top-0` 吸的顶是**调用方**那个 `flex-1 overflow-y-auto`（mods-listing-view
         * 里），不是 aside 自己 —— aside 的 overflow 是 visible，内部 `overflow-y-auto` 只包
         * 角色列表、不是本按钮的祖先。所以侧栏滚到哪它都在。
         * 背景用不透明的白：滚动时卡片从下方滑过，靠它整块遮住，不会从缝隙里露出来。
         */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          className="sticky top-0 z-10 flex items-center justify-center gap-1.5 border-[3px] border-black bg-white px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <span aria-hidden>▦</span>
          全部角色
        </button>

        {/* 全部 */}
        <Link
          href={allHref}
          prefetch={false}
          onClick={(event) => handleCardClick(event, allHref, isAllActive, allLabel, setPendingCharacter)}
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
              onClick={(event) => handleCardClick(event, item.href, item.isActive, item.label, setPendingCharacter)}
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
                onClick={(event) => handleCardClick(event, item.href, item.isActive, item.label, setPendingCharacter)}
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

      {/*
       * 抽屉挂在 aside **之外**、与它同级：Sheet 自带一个 `<div data-slot="sheet">` 包裹层，
       * 放进 aside 会被它的 `flex-col gap-1.5` 当成一个 flex 项、多撑出 6px 间隙，
       * 破坏「除新按钮外逐像素一致」这条回归要求。
       *
       * items 的顺序（特殊分类 → 角色）与 aside 里的视觉顺序一致，「全部」由抽屉补作第一格。
       */}
      <CharacterPickerDrawer
        open={pickerOpen}
        onOpenChange={handlePickerOpenChange}
        allLabel={allLabel}
        allHref={allHref}
        isAllActive={isAllActive}
        items={[...specialCategories, ...characterItems]}
        onItemClick={handlePickerItemClick}
      />
    </>
  );
}
