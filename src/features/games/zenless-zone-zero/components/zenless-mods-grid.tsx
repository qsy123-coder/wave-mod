import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import type { GameConfig } from "@/config/games";
import type { SiteMod } from "@/lib/mods";
import { ZenlessModsCard } from "./zenless-mods-card";

export function ZenlessModsGrid({ game, mods }: { game: GameConfig; mods: SiteMod[] }) {
  if (!mods.length) {
    return (
      <div className="border-4 border-black bg-white p-8 text-center text-black shadow-[8px_8px_0_0_#000]">
        <p className="text-2xl font-black">暂无匹配的绝区零 MOD</p>
        <p className="mt-3 text-sm font-bold text-black/65">尝试清空筛选，或等待管理员上传更多代理人 MOD。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4">
      {mods.slice(0, 12).map((mod, index) => (
        <MotionReveal key={mod.id} delay={0.28 + index * 0.035} y={24} rotate={index % 2 === 0 ? -1 : 1}>
          <ZenlessModsCard game={game} index={index} mod={mod} />
        </MotionReveal>
      ))}
    </div>
  );
}

/** 构建保留筛选条件的翻页链接 */
function buildPageHref(
  page: number,
  basePath: string,
  filters: { character?: string; query?: string; sort?: string },
) {
  const params = new URLSearchParams();
  if (filters.character) params.set("character", filters.character);
  if (filters.query) params.set("query", filters.query);
  if (filters.sort && filters.sort !== "hot") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** 生成页码列表，0 表示省略号 */
function getPageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: number[] = [1];

  if (currentPage > 3) pages.push(0);

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (currentPage < totalPages - 2) pages.push(0);

  pages.push(totalPages);
  return pages;
}

const pageBtn =
  "flex size-7 items-center justify-center border-[3px] border-black text-[10px] font-black shadow-[3px_3px_0_0_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";
const pageBtnActive = `bg-[var(--neo-accent)] ${pageBtn}`;
const pageBtnInactive = `bg-white ${pageBtn}`;

type PaginationProps = {
  basePath: string;
  character?: string;
  currentPage: number;
  query?: string;
  sort?: string;
  totalPages: number;
};

export function ZenlessModsPagination({
  basePath,
  character,
  currentPage,
  query,
  sort,
  totalPages,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const filters = { character, query, sort };
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1.5 pt-0">
      {/* 上一页 */}
      {currentPage > 1 ? (
        <Link
          href={buildPageHref(currentPage - 1, basePath, filters)}
          className={pageBtnInactive}
          aria-label="上一页"
        >
          <ChevronLeft className="size-3.5" />
        </Link>
      ) : (
        <span className={`${pageBtnInactive} opacity-30`}>
          <ChevronLeft className="size-3.5" />
        </span>
      )}

      {/* 页码 */}
      {pages.map((page, index) => {
        if (page === 0) {
          return (
            <span key={`ellipsis-${index}`} className="px-1 text-[10px] font-black">
              ...
            </span>
          );
        }
        return (
          <Link
            key={page}
            href={buildPageHref(page, basePath, filters)}
            className={page === currentPage ? pageBtnActive : pageBtnInactive}
          >
            {page}
          </Link>
        );
      })}

      {/* 下一页 */}
      {currentPage < totalPages ? (
        <Link
          href={buildPageHref(currentPage + 1, basePath, filters)}
          className={pageBtnInactive}
          aria-label="下一页"
        >
          <ChevronRight className="size-3.5" />
        </Link>
      ) : (
        <span className={`${pageBtnInactive} opacity-30`}>
          <ChevronRight className="size-3.5" />
        </span>
      )}
    </div>
  );
}
