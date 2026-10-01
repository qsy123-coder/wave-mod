"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, type MouseEvent } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import { cn } from "@/lib/utils";

// 只借类型，编译期擦除，不会和 character-sidebar 形成运行时循环依赖
import type { CharacterSidebarItem } from "./character-sidebar";

type ItemClickHandler = (
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  isActive: boolean,
) => void;

type CharacterPickerDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allLabel: string;
  allHref: string;
  isAllActive: boolean;
  /** 顺序与侧栏一致（特殊分类在前，其后角色）；不含「全部」，由本组件补作第一格 */
  items: CharacterSidebarItem[];
  /** 点选回调由 CharacterSidebar 注入（内部复用 handleCardClick + 显式关抽屉 + 回收焦点） */
  onItemClick: ItemClickHandler;
};

/**
 * 角色分类选择抽屉：带遮罩的左抽屉，用 auto-fill 多列网格把全部分类一屏铺开。
 *
 * 侧栏那一条 240px 宽的单列列表装 65 个条目，全列表约 3400px 高，找角色得滚四个屏。
 * 抽屉把同一批条目换成自适应列数的网格，桌面（≥1024px）下一屏可见，不必滚动。
 *
 * 为什么不复刻详情页那个 Action Dock、而是复用 sheet.tsx：遮罩、滑入动画、body
 * 滚动锁、role="dialog"/aria-modal 它都有，customWidth 又允许任意宽度。自己写一套
 * 等于把这四样重造一遍。
 *
 * 为什么 Esc 监听写在这里而不是 sheet.tsx：sheet.tsx 与详情页右抽屉
 * （mod-detail-drawer.tsx）共用，改它会波及详情页。所以本组件自己挂一个局部
 * keydown —— open 为 false 时不挂，卸载即移除，不在 window 上留常驻处理器。
 */
export function CharacterPickerDrawer({
  open,
  onOpenChange,
  allLabel,
  allHref,
  isAllActive,
  items,
  onItemClick,
}: CharacterPickerDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        // 自带宽度：不加 customWidth 会被强制成 w-3/4 sm:max-w-sm，装不下网格
        customWidth
        // 用自绘的 neo 关闭按钮，与 mod-detail-drawer 的做法一致
        showCloseButton={false}
        overlayClassName="bg-black/40"
        className="flex w-full flex-col gap-0 bg-[#fff8ef] p-0 text-black lg:w-[960px]"
      >
        {/* 顶栏：标题 + 右上 ✕。四条关闭路径（遮罩 / Esc / ✕ / 点选角色）都汇入 onOpenChange */}
        <div className="flex shrink-0 items-center justify-between border-b-4 border-black px-4 py-3">
          <h2 className="text-lg font-black uppercase tracking-[0.14em]">全部角色分类</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭抽屉"
            className="inline-flex size-8 shrink-0 items-center justify-center border-[3px] border-black bg-white text-lg font-black leading-none shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            ✕
          </button>
        </div>

        {/* 内容区：条目溢出时才内部滚动（不出现横向滚动 —— auto-fill + minmax 保证）。
            隐藏滚动条，与侧栏的写法一致。 */}
        <div
          data-slot="character-picker-scroll"
          className="min-h-0 flex-1 overflow-y-auto p-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}
          >
            {/* 第一格：全部 */}
            <PickerCell
              label={allLabel}
              href={allHref}
              isActive={isAllActive}
              onItemClick={onItemClick}
            />
            {items.map((item) => (
              <PickerCell
                key={item.label}
                label={item.label}
                href={item.href}
                isActive={item.isActive}
                onItemClick={onItemClick}
              />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * 网格单元：56px 头像 + 名字，不显示数量 —— 信息量直接决定「一屏能不能铺完」，
 * 数量是次要信息，侧栏仍在，需要时可回去看。
 *
 * 无头像时（getCharacterImagePath 返回 null，「全部」和个别没有专属图的新角色）
 * 渲染一个与头像**等大**的占位块。侧栏那种「整块跳过 Image」的写法在单列布局里只是
 * 少个图，在这里会变成一个高度塌陷的空白格，破坏整行的对齐。
 *
 * 名字强制单行（truncate + leading-none）：长名如「滑翔翼,翱翔翼,科考摩托」一旦折行，
 * 行高就不齐，直接推翻「65 项一屏铺完」的算术。完整名走 title 悬停查看。
 */
function PickerCell({
  label,
  href,
  isActive,
  onItemClick,
}: {
  label: string;
  href: string;
  isActive: boolean;
  onItemClick: ItemClickHandler;
}) {
  const avatarPath = getCharacterImagePath(label);

  return (
    <Link
      href={href}
      // 65 个格子默认预取会在慢网络下同时打出几十个请求，抢当前页的带宽 —— 与侧栏同理
      prefetch={false}
      onClick={(event) => onItemClick(event, href, isActive)}
      data-slot="character-picker-item"
      aria-current={isActive ? "page" : undefined}
      title={label}
      className={cn(
        "flex flex-col items-center gap-1 border-2 border-black p-1.5 text-center shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#000]",
        // 按下反馈（按下态在 hover 之后出，Tailwind 的变体顺序保证它赢过 hover 的位移）
        "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
        isActive ? "bg-[#ff7a7a] text-black" : "bg-white text-black/75"
      )}
    >
      {avatarPath ? (
        <Image
          src={avatarPath}
          alt={label}
          width={56}
          height={56}
          unoptimized
          className="size-14 shrink-0 rounded-full border-2 border-black object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#fff8ef] text-sm font-black text-black/50"
        >
          {label.slice(0, 1)}
        </span>
      )}
      <span className="w-full truncate text-[10px] font-black leading-none tracking-[0.04em]">
        {label}
      </span>
    </Link>
  );
}
