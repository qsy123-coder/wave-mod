"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getCharacterImagePath } from "@/lib/constants/character-images";
import { cn } from "@/lib/utils";
import { filterCharacterPickerItems, normalizeCharacterSearchQuery } from "./character-picker-filter";

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
 * 2026-11-10 起顶部带一个搜索框：66 个格子一屏铺开解决的是「看全」，但「找某一个」
 * 仍是逐格扫名字 —— 尤其是叫不出全名、只记得一个字的时候。搜索是**纯本地**过滤
 * （清单本来就在手里），不改 URL、不发请求，口径见 character-picker-filter.ts。
 *
 * 为什么不复刻详情页那个 Action Dock、而是复用 sheet.tsx：遮罩、滑入动画、body
 * 滚动锁、role="dialog"/aria-modal 它都有，customWidth 又允许任意宽度。自己写一套
 * 等于把这四样重造一遍。
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        // 自带宽度：不加 customWidth 会被强制成 w-3/4 sm:max-w-sm，装不下网格
        customWidth
        // 用自绘的 neo 关闭按钮，与 mod-detail-drawer 的做法一致
        showCloseButton={false}
        overlayClassName="bg-black/40"
        className="flex w-full flex-col gap-0 bg-[var(--neo-panel)] p-0 text-black lg:w-[960px]"
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

        {/*
          搜索与网格放进同一个子组件，而不是把搜索状态留在抽屉上：
          SheetContent 在关闭动画结束后会卸载子树，搜索词因此**随抽屉一起消失**，
          下次打开永远是干净的。放父组件里就得再写一个「open 变 false 时清空」的
          effect —— 那种写法会被 react-hooks/set-state-in-effect 判为级联渲染。
        */}
        <CharacterPickerBody
          allLabel={allLabel}
          allHref={allHref}
          isAllActive={isAllActive}
          items={items}
          onItemClick={onItemClick}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

type CharacterPickerBodyProps = {
  allLabel: string;
  allHref: string;
  isAllActive: boolean;
  items: CharacterSidebarItem[];
  onItemClick: ItemClickHandler;
  /** Esc 的第二段语义：没有搜索词时关闭整个抽屉 */
  onClose: () => void;
};

/**
 * 抽屉正文：搜索框 + 分类网格。
 *
 * 搜索是纯本地过滤 —— 66 项的清单本来就在 props 里（服务端已算好），不需要请求，
 * 也不该改 URL：它回答的是「列出的哪一项叫什么」，不是筛选资源。
 */
function CharacterPickerBody({
  allLabel,
  allHref,
  isAllActive,
  items,
  onItemClick,
  onClose,
}: CharacterPickerBodyProps) {
  /**
   * `query` 是输入框里的原文，`appliedQuery` 才是喂给过滤器的值 ——
   * 中文输入法合成期间（敲着 `qianxiao` 还没选字）`onChange` 会带着半成品拼音一路触发，
   * 跟着过滤会让整片网格反复闪成「没有找到」。合成结束后才提交，口径与
   * mods-toolbar 的搜索框一致。
   */
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const composingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 打开即聚焦：抽屉的用途就是「找某一个」，让人直接开打 —— 不用先点一下输入框。
  // 本组件挂载 = 抽屉打开（SheetContent 关闭动画结束后会卸载子树），所以空依赖即可。
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // 输入框有文字时按 Esc 先清搜索，再按一次才关抽屉：想清掉搜索却直接把整个抽屉
  // 关掉（重新打开还得再找一遍）是最烦人的那种「顺手」。
  //
  // 为什么不写进 sheet.tsx：那个文件与详情页右抽屉共用，改它会波及详情页。
  // 所以本组件自己挂一个局部 keydown —— 挂载时才挂，卸载即移除，不在 window 上留
  // 常驻处理器。mods-toolbar 的全局 `/`、Esc 监听遇到 role="dialog" 会让路，
  // 不会和这里抢。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (normalizeCharacterSearchQuery(appliedQuery)) {
        event.preventDefault();
        setQuery("");
        setAppliedQuery("");
        searchInputRef.current?.focus();
        return;
      }

      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appliedQuery, onClose]);

  const clearQuery = () => {
    setQuery("");
    setAppliedQuery("");
    searchInputRef.current?.focus();
  };

  const isSearching = normalizeCharacterSearchQuery(appliedQuery) !== "";
  const filteredItems = filterCharacterPickerItems(items, appliedQuery);

  return (
    <>
      {/* 搜索框：固定在顶栏下方、内容滚动区之外 —— 网格滚到下半屏时它仍然可见。

          样式与 mods-toolbar 的搜索框同一套 neo 口径（白底 + 黑边 + 硬阴影），
          不引 input.tsx：那个是 h-14 的大尺寸，塞进抽屉顶栏会把「一屏铺完」撑破。 */}
      <div className="shrink-0 border-b-4 border-black px-4 py-2.5">
        <div
          role="search"
          className="flex w-full items-center gap-2 border-[3px] border-black bg-white px-3 py-2 shadow-[3px_3px_0px_0px_#000]"
        >
          <Search className="size-4 shrink-0 text-black/60" aria-hidden />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // 合成期间只更新输入框文字，不提交过滤（见上方 appliedQuery 的注释）
              if (!composingRef.current) setAppliedQuery(event.target.value);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              setAppliedQuery(event.currentTarget.value);
            }}
            placeholder="搜索角色分类…"
            aria-label="搜索角色分类"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm font-black text-black outline-none placeholder:text-black/40"
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="清空搜索"
              title="清空搜索"
              className="inline-flex size-5 shrink-0 items-center justify-center border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] transition hover:bg-[var(--neo-accent)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <X className="size-3" strokeWidth={4} />
            </button>
          ) : null}
        </div>
      </div>

      {/* 内容区：条目溢出时才内部滚动（不出现横向滚动 —— auto-fill + minmax 保证）。
          隐藏滚动条，与侧栏的写法一致。 */}
      <div
        data-slot="character-picker-scroll"
        className="min-h-0 flex-1 overflow-y-auto p-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {isSearching && filteredItems.length === 0 ? (
          // 空结果必须显式说出来：网格一片空白时，用户分不清是「没这个角色」
          // 还是「抽屉坏了」。
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm font-black">没有找到匹配「{appliedQuery.trim()}」的角色分类</p>
            <button
              type="button"
              onClick={clearQuery}
              className="border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              清空搜索
            </button>
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}
          >
            {/* 第一格：全部。搜索时隐藏 —— 它是「撤销角色筛选」的入口、不是匹配结果，
                铺在结果前面会让人误以为它也命中了搜索词。 */}
            {isSearching ? null : (
              <PickerCell
                label={allLabel}
                href={allHref}
                isActive={isAllActive}
                onItemClick={onItemClick}
              />
            )}
            {filteredItems.map((item) => (
              <PickerCell
                key={item.label}
                label={item.label}
                href={item.href}
                isActive={item.isActive}
                onItemClick={onItemClick}
              />
            ))}
          </div>
        )}
      </div>
    </>
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
        isActive ? "bg-[var(--neo-accent)] text-black" : "bg-white text-black/75"
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
          className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[var(--neo-panel)] text-sm font-black text-black/50"
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
