import Link from "next/link";
import { Search, X } from "lucide-react";

import { getEnabledGames } from "@/config/games";
import {
  adminModSortOptions,
  adminModStatusOptions,
  buildAdminModsHref,
  type AdminModsFilters,
} from "@/lib/admin/mods-filters";

type AdminModsToolbarProps = {
  filters: AdminModsFilters;
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

export function AdminModsToolbar({ filters }: AdminModsToolbarProps) {
  const active = hasActiveFilters(filters);
  const games = getEnabledGames();
  const currentSort = filters.sort as string ?? "latest";
  const currentStatus = filters.status as string ?? "all";

  return (
    <div className="space-y-3">
      {/* ====== 排序 / 游戏 / 状态 pills ====== */}
      <section className="border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000] space-y-3">
        {/* 排序 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-black/55 min-w-[3em]">
            排序
          </span>
          {adminModSortOptions.map((opt) => (
            <Link
              key={opt.value}
              href={buildAdminModsHref({ ...filters, sort: opt.value })}
              className={`border-2 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] ${
                opt.value === currentSort
                  ? "bg-[var(--neo-accent)] text-black"
                  : "bg-white text-black/75"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* 游戏 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-black/55 min-w-[3em]">
            游戏
          </span>
          <Link
            href={buildAdminModsHref({ ...filters, gameKey: undefined })}
            className={`border-2 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] ${
              !filters.gameKey
                ? "bg-[var(--neo-accent)] text-black"
                : "bg-white text-black/75"
            }`}
          >
            全部
          </Link>
          {games.map((g) => (
            <Link
              key={g.key}
              href={buildAdminModsHref({ ...filters, gameKey: g.key })}
              className={`border-2 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] ${
                filters.gameKey === g.key
                  ? "bg-[var(--neo-accent)] text-black"
                  : "bg-white text-black/75"
              }`}
            >
              {g.shortName ?? g.name}
            </Link>
          ))}
        </div>

        {/* 状态 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-black/55 min-w-[3em]">
            状态
          </span>
          {adminModStatusOptions.map((opt) => (
            <Link
              key={opt.value}
              href={buildAdminModsHref({ ...filters, status: opt.value })}
              className={`border-2 border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] ${
                opt.value === currentStatus
                  ? "bg-[var(--neo-accent)] text-black"
                  : "bg-white text-black/75"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* 关键词搜索 (GET 表单，隐藏 inputs 保留非默认参数) */}
        <form method="GET" action="/admin/mods" className="flex items-center gap-2">
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
