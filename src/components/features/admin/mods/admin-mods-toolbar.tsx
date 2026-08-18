"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getEnabledGames } from "@/config/games";
import {
  adminModSortOptions,
  adminModStatusOptions,
  buildAdminModsHref,
  type AdminModsFilters,
} from "@/lib/admin/mods-filters";

type AdminModsToolbarProps = {
  filters: AdminModsFilters;
  /** 渲染在白色筛选卡片右上角的操作按钮（补齐创作者 / 批量选择） */
  rightSlot?: ReactNode;
  /** 渲染在白色筛选卡片第二行的内容（批量处理条） */
  batchRow?: ReactNode;
};

/** 当前是否至少有一个活跃筛选（排除 always-present 默认值） */
function hasActiveFilters(filters: AdminModsFilters) {
  return Boolean(
    filters.gameKey ||
      filters.query ||
      filters.character ||
      (filters.status && filters.status !== "all"),
  );
}

function gameName(key: string) {
  const match = getEnabledGames().find((g) => g.key === key);
  return match ? match.shortName ?? match.name : key;
}

export function AdminModsToolbar({ filters, rightSlot, batchRow }: AdminModsToolbarProps) {
  const router = useRouter();
  const [sortOpen, setSortOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const active = hasActiveFilters(filters);
  const games = getEnabledGames();

  const currentSort = filters.sort ?? "latest";
  const currentStatus = filters.status ?? "all";
  const sortLabel = adminModSortOptions.find((o) => o.value === currentSort)?.label ?? "最新发布";
  const statusLabel = adminModStatusOptions.find((o) => o.value === currentStatus)?.label ?? "全部";
  const gameLabel = filters.gameKey
    ? (games.find((g) => g.key === filters.gameKey)?.shortName ?? filters.gameKey)
    : "全部";

  const isSortActive = currentSort !== "latest";
  const isGameActive = Boolean(filters.gameKey);
  const isStatusActive = currentStatus !== "all";

  const triggerClass = (isActive: boolean) =>
    cn(
      "inline-flex items-center gap-1 border-2 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000]",
      isActive ? "bg-[var(--neo-accent)] text-black" : "bg-white text-black/75",
    );

  const contentClass =
    "w-44 space-y-1.5 rounded-none border-4 border-black bg-white p-1.5 text-black shadow-[6px_6px_0px_0px_#000]";

  const itemClass = (isActive: boolean) =>
    cn(
      "flex w-full items-center justify-between gap-2 border-2 border-black px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] shadow-[2px_2px_0px_0px_#000]",
      isActive ? "bg-black text-white" : "bg-white text-black/75",
    );

  return (
    <div className="space-y-3">
      {/* ====== 白色筛选卡片：排序 / 游戏 / 状态 下拉 + 搜索 + 右上角操作按钮 ====== */}
      <section className="border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000]">
        <div className="flex flex-wrap items-center gap-2">
          {/* 排序 */}
          <DropdownMenu open={sortOpen} onOpenChange={setSortOpen}>
            <DropdownMenuTrigger className={triggerClass(isSortActive)}>
              {sortLabel}
              <ChevronDown className="size-3 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={contentClass}>
              {adminModSortOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  className="cursor-pointer p-0 focus:bg-transparent"
                  onClick={() => {
                    setSortOpen(false);
                    router.push(buildAdminModsHref({ ...filters, sort: opt.value }));
                  }}
                >
                  <div className={itemClass(opt.value === currentSort)}>
                    <span>{opt.label}</span>
                    {opt.value === currentSort ? <span className="text-[10px]">✓</span> : null}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 游戏 */}
          <DropdownMenu open={gameOpen} onOpenChange={setGameOpen}>
            <DropdownMenuTrigger className={triggerClass(isGameActive)}>
              {gameLabel}
              <ChevronDown className="size-3 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={contentClass}>
              <DropdownMenuItem
                className="cursor-pointer p-0 focus:bg-transparent"
                onClick={() => {
                  setGameOpen(false);
                  router.push(buildAdminModsHref({ ...filters, gameKey: undefined }));
                }}
              >
                <div className={itemClass(!filters.gameKey)}>
                  <span>全部</span>
                  {!filters.gameKey ? <span className="text-[10px]">✓</span> : null}
                </div>
              </DropdownMenuItem>
              {games.map((g) => (
                <DropdownMenuItem
                  key={g.key}
                  className="cursor-pointer p-0 focus:bg-transparent"
                  onClick={() => {
                    setGameOpen(false);
                    router.push(buildAdminModsHref({ ...filters, gameKey: g.key }));
                  }}
                >
                  <div className={itemClass(filters.gameKey === g.key)}>
                    <span>{g.shortName ?? g.name}</span>
                    {filters.gameKey === g.key ? <span className="text-[10px]">✓</span> : null}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 状态 */}
          <DropdownMenu open={statusOpen} onOpenChange={setStatusOpen}>
            <DropdownMenuTrigger className={triggerClass(isStatusActive)}>
              {statusLabel}
              <ChevronDown className="size-3 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={contentClass}>
              {adminModStatusOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  className="cursor-pointer p-0 focus:bg-transparent"
                  onClick={() => {
                    setStatusOpen(false);
                    router.push(buildAdminModsHref({ ...filters, status: opt.value }));
                  }}
                >
                  <div className={itemClass(opt.value === currentStatus)}>
                    <span>{opt.label}</span>
                    {opt.value === currentStatus ? <span className="text-[10px]">✓</span> : null}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 关键词搜索 (GET 表单，隐藏 inputs 保留非默认参数) */}
          <form method="GET" action="/admin/mods" className="flex min-w-[200px] flex-1 items-center gap-2">
            {filters.gameKey ? <input type="hidden" name="game" value={filters.gameKey} /> : null}
            {filters.status && filters.status !== "all" ? <input type="hidden" name="status" value={filters.status} /> : null}
            {filters.sort && filters.sort !== "latest" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
            {/* 注意：character 不在 toolbar pills 中提供，但搜索提交后仍需保留（边栏选中） */}
            {filters.character ? <input type="hidden" name="character" value={filters.character} /> : null}
            <input
              type="text"
              name="query"
              defaultValue={filters.query ?? ""}
              placeholder="搜索标题 / 角色 / 描述…"
              className="flex-1 border-2 border-black px-3 py-2 text-xs font-black text-black shadow-[3px_3px_0px_0px_#000] outline-none placeholder:text-black/35"
            />
            <button
              type="submit"
              className="neo-button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em]"
            >
              <Search className="size-3.5" />
              搜索
            </button>
          </form>

          {/* 右上角操作按钮 */}
          {rightSlot ? <div className="flex shrink-0 items-center gap-2">{rightSlot}</div> : null}
        </div>

        {/* 第二行：批量处理条（进入批量选择后出现，空态由组件自行返回 null） */}
        {batchRow}
      </section>

      {/* ====== 激活筛选 chips ====== */}
      {active && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.gameKey && (
            <Link
              href={buildAdminModsHref({ ...filters, gameKey: undefined })}
              className="inline-flex items-center gap-1 border-2 border-black bg-[var(--neo-muted)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000]"
            >
              游戏：{gameName(filters.gameKey)}
              <X className="size-3" />
            </Link>
          )}
          {filters.status && filters.status !== "all" && (
            <Link
              href={buildAdminModsHref({ ...filters, status: "all" })}
              className="inline-flex items-center gap-1 border-2 border-black bg-[var(--neo-muted)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000]"
            >
              状态：{filters.status === "published" ? "已发布" : "草稿"}
              <X className="size-3" />
            </Link>
          )}
          {filters.character && (
            <Link
              href={buildAdminModsHref({ ...filters, character: undefined })}
              className="inline-flex items-center gap-1 border-2 border-black bg-[var(--neo-muted)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000]"
            >
              角色：{filters.character}
              <X className="size-3" />
            </Link>
          )}
          {filters.query && (
            <Link
              href={buildAdminModsHref({ ...filters, query: undefined })}
              className="inline-flex items-center gap-1 border-2 border-black bg-[var(--neo-muted)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000]"
            >
              关键词：{filters.query}
              <X className="size-3" />
            </Link>
          )}
          <Link
            href="/admin/mods"
            className="inline-flex items-center gap-1 border-2 border-black bg-[var(--neo-accent)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[3px_3px_0px_0px_#000]"
          >
            <X className="size-3" />
            清除全部
          </Link>
        </div>
      )}
    </div>
  );
}
