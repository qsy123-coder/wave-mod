"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import { cn } from "@/lib/utils";

type MobileCharacterDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: string[];
  /** null = 全部 */
  activeCharacter: string | null;
  onSelect: (character: string | null) => void;
};

/**
 * 手机端首页的「全部角色」抽屉。
 *
 * 与 /mods 的 CharacterPickerDrawer 的区别：那边的每一格是**链接**（会导航到
 * `/mods?character=`），这里选完只在首页就地筛选，不跳页 —— 所以用 button + 回调，
 * 选完立刻关抽屉。
 *
 * 复用 sheet.tsx 的遮罩、滑入动画与 body 滚动锁；Esc 监听写在这里，与
 * character-picker-drawer 的做法保持一致（sheet 本身不处理键盘）。
 */
export function MobileCharacterDrawer({
  open,
  onOpenChange,
  characters,
  activeCharacter,
  onSelect,
}: MobileCharacterDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * 打开抽屉时把当前选中的角色滚到可视区中间。
   *
   * 65 个格子在小屏上要滚两三屏；不带这一步的话，用户从横条打开「全部角色」
   * 看到的是列表顶部，根本不知道自己当前选的是哪一个。
   */
  useEffect(() => {
    if (!open) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    const active = scroller.querySelector<HTMLElement>(
      '[data-slot="mobile-character-picker-item"][aria-pressed="true"]',
    );
    if (!active) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset = activeRect.top - scrollerRect.top + scroller.scrollTop;
    const target = offset - (scroller.clientHeight - active.clientHeight) / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [open, activeCharacter]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        customWidth
        showCloseButton={false}
        className="flex w-full flex-col gap-0 bg-[#fff8ef] p-0 text-black"
      >
        <div className="flex shrink-0 items-center justify-between border-b-4 border-black px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black uppercase tracking-[0.14em]">全部角色</h2>
            {characters.length > 0 ? (
              <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-black/50">
                共 {characters.length} 个分类
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭全部角色抽屉"
            className="ml-3 inline-flex size-9 shrink-0 items-center justify-center border-[3px] border-black bg-white text-lg font-black leading-none shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            ✕
          </button>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto p-4"
          style={{ scrollbarWidth: "thin" }}
        >
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}
          >
            <PickerCell
              label="全部"
              active={activeCharacter === null}
              onClick={() => onSelect(null)}
            />
            {characters.map((name) => (
              <PickerCell
                key={name}
                label={name}
                active={activeCharacter === name}
                onClick={() => onSelect(name)}
              />
            ))}
          </div>

          {characters.length === 0 ? (
            <p className="mt-3 text-[11px] font-black text-black/50">角色分类加载中…</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PickerCell({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  // 「全部」没有专属头像，用等大占位块保持行高一致
  const avatarPath = label === "全部" ? null : getCharacterImagePath(label);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      data-slot="mobile-character-picker-item"
      className={cn(
        "flex flex-col items-center gap-1 border-2 border-black p-1.5 text-center shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
        active ? "bg-[#ff7a7a] text-black" : "bg-white text-black/70",
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
          className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#fff8ef] text-sm font-black text-black/55"
        >
          {label.slice(0, 1)}
        </span>
      )}
      <span className="w-full truncate text-[10px] font-black leading-none tracking-[0.02em]">
        {label}
      </span>
    </button>
  );
}
