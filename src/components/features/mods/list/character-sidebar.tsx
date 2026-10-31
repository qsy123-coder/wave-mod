"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
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
  /**
   * 抽屉是否开着（只用于按钮的 aria-expanded）。
   *
   * 这两个 prop 是**可选**的：
   *   - 给了 onOpenPicker = 受控模式（主站 /mods）：抽屉由调用方渲染，
   *     因为沉浸收起侧栏后，工具栏还要一个入口打开同一个抽屉；
   *   - 没给 = 自管模式（后台、游戏分站）：保持原来「按钮 + 抽屉都在组件内」的行为。
   */
  pickerOpen?: boolean;
  onOpenPicker?: (trigger: HTMLElement) => void;
};

const tagColors = [
  "bg-[var(--neo-accent)]",
  "bg-[var(--neo-secondary)]",
  "bg-[var(--neo-muted)]",
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
export function handleCardClick(
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
  pickerOpen,
  onOpenPicker,
}: CharacterSidebarProps) {
  // 筛选条件直接来自 URL（mods-url-driven.tsx）：URL 一变，侧边栏高亮、筛选条、
  // 网格的 queryKey 全都跟着变，所以筛选本身不需要任何本地状态，也不用手工起进度条
  // （顶部进度条由网格的取数状态驱动，见 mods-page-client 的 handleStatusChange）。
  const { pendingCharacter, setPendingCharacter } = useNavigationLoading();

  /**
   * 自管模式下的抽屉状态（后台 / 游戏分站）。
   * 主站 /mods 传了 onOpenPicker，这两个 state 不会被用到，但 hook 必须无条件调用。
   */
  const [uncontrolledPickerOpen, setUncontrolledPickerOpen] = useState(false);
  const uncontrolledTriggerRef = useRef<HTMLElement | null>(null);
  const isPickerControlled = onOpenPicker !== undefined;
  const resolvedPickerOpen = isPickerControlled ? pickerOpen ?? false : uncontrolledPickerOpen;

  const openPicker = (trigger: HTMLElement) => {
    if (onOpenPicker) {
      onOpenPicker(trigger);
      return;
    }
    uncontrolledTriggerRef.current = trigger;
    setUncontrolledPickerOpen(true);
  };

  const closeUncontrolledPicker = () => {
    setUncontrolledPickerOpen(false);
    uncontrolledTriggerRef.current?.focus();
  };

  /** 自管模式下点选抽屉里的分类：乐观值 + 关抽屉，与主站受控模式同一套语义 */
  const handleUncontrolledItemClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    isActive: boolean,
  ) => {
    if (!isPlainLeftClick(event)) return;
    const label = href === allHref ? allLabel : characters.find((c) => c.href === href)?.label ?? "";
    handleCardClick(event, href, isActive, label, setPendingCharacter);
    closeUncontrolledPicker();
  };

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

  const specialCategories = characters.filter((c) =>
    ["Skins", "Other/Misc", "UI"].includes(c.label)
  );
  const characterItems = characters.filter(
    (c) => !["Skins", "Other/Misc", "UI"].includes(c.label)
  );

  return (
    <>
      <aside className={cn("flex shrink-0 flex-col gap-1.5 border-4 border-black bg-[var(--neo-panel)] p-2.5 shadow-[4px_4px_0px_0px_#000] md:shadow-[6px_6px_0px_0px_#000]", className)}>
        {/*
         * 触发按钮：它控制的是「这份列表怎么看」，属于控制而非内容，所以放在所有分类之前。
         *
         * `sticky top-0` 吸的顶是**调用方**那个 `flex-1 overflow-y-auto`（mods-listing-view
         * 里），不是 aside 自己 —— aside 的 overflow 是 visible，内部 `overflow-y-auto` 只包
         * 角色列表、不是本按钮的祖先。所以侧栏滚到哪它都在。
         * 背景用不透明的白：滚动时卡片从下方滑过，靠它整块遮住，不会从缝隙里露出来。
         *
         * ⚠️ 必须显式写 text-black：body 的文字色是 --neo-on-canvas（默认主题下是米白），
         * 只给 bg-white 会变成白底白字、整颗按钮看不见（2026-10-19 用户反馈）。
         */}
        <button
          type="button"
          onClick={(event) => openPicker(event.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={resolvedPickerOpen}
          className="sticky top-0 z-10 flex items-center justify-center gap-1.5 border-[3px] border-black bg-white px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
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
              ? "bg-[var(--neo-accent)] text-black"
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
                  ? "bg-[var(--neo-accent)] text-black"
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
                    ? "bg-[var(--neo-accent)] text-black"
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
        自管模式（后台 / 游戏分站）：抽屉挂在 aside 之外，保持原来行为。
        主站 /mods 是受控模式，抽屉由 mods-listing-view 渲染（工具栏入口要共用）。
      */}
      {!isPickerControlled ? (
        <CharacterPickerDrawer
          open={uncontrolledPickerOpen}
          onOpenChange={(next) => {
            if (next) setUncontrolledPickerOpen(true);
            else closeUncontrolledPicker();
          }}
          allLabel={allLabel}
          allHref={allHref}
          isAllActive={isAllActive}
          items={characters}
          onItemClick={handleUncontrolledItemClick}
        />
      ) : null}
    </>
  );
}
