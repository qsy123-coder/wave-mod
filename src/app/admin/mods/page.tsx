import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { AdminModsListClient } from "@/components/features/admin/mods/admin-mods-list-client";
import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { AdminModsSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import {
  buildAdminModsHref,
  getAdminCharacterCounts,
  parseAdminModsSearchParams,
  sortAdminCharacterNames,
  ADMIN_SPECIAL_CATEGORIES,
  type AdminModsFilters,
} from "@/lib/admin/mods-filters";
import { getAdminMods } from "@/lib/mods";

// ==================== 分页常量 ====================

const PAGE_SIZES = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 100;

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parsePageSize(raw: string | undefined): number {
  const n = Number(raw);
  return PAGE_SIZES.includes(n as (typeof PAGE_SIZES)[number]) ? n : DEFAULT_PAGE_SIZE;
}

// ==================== 侧边栏 ====================

function buildSidebarItems(filters: AdminModsFilters, characterCounts: Record<string, number>) {
  const mergedNames = Array.from(new Set([...Object.keys(characterCounts), ...defaultCharacterSuggestions]));
  const characterNames = sortAdminCharacterNames(mergedNames);

  const specialItems = ADMIN_SPECIAL_CATEGORIES.filter((c) => characterNames.includes(c)).map((c) => ({
    label: c,
    href: buildAdminModsHref({ ...filters, character: c }),
    count: characterCounts[c] ?? 0,
    isActive: c === filters.character,
  }));

  const regularItems = characterNames
    .filter((n) => !ADMIN_SPECIAL_CATEGORIES.includes(n as (typeof ADMIN_SPECIAL_CATEGORIES)[number]))
    .map((name) => ({
      label: name,
      href: buildAdminModsHref({ ...filters, character: name }),
      count: characterCounts[name] ?? 0,
      isActive: name === filters.character,
    }));

  return { specialItems, regularItems, all: [...specialItems, ...regularItems] };
}

// ==================== 分页器 ====================

function AdminPagination({
  currentPage,
  totalPages,
  pageSize,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  buildHref: (page: number, ps?: number) => string;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  const btnBase = "flex size-8 items-center justify-center border-[3px] border-black text-xs font-black shadow-[3px_3px_0_0_#000] transition hover:-translate-y-0.5";

  return (
    <div className="flex items-center justify-center gap-1.5 pt-2">
      {currentPage > 1 ? (
        <Link href={buildHref(currentPage - 1)} className={`${btnBase} bg-white`} aria-label="上一页">
          <ChevronLeft className="size-3.5" />
        </Link>
      ) : (
        <span className={`${btnBase} bg-white opacity-30`}>
          <ChevronLeft className="size-3.5" />
        </span>
      )}

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-1 text-xs font-black">...</span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className={p === currentPage ? `${btnBase} bg-[var(--neo-accent)]` : `${btnBase} bg-white`}
          >
            {p}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link href={buildHref(currentPage + 1)} className={`${btnBase} bg-white`} aria-label="下一页">
          <ChevronRight className="size-3.5" />
        </Link>
      ) : (
        <span className={`${btnBase} bg-white opacity-30`}>
          <ChevronRight className="size-3.5" />
        </span>
      )}

      {/* 每页条数选择 */}
      <div className="ml-4 flex items-center gap-1 border-[3px] border-black bg-white px-2 py-2 shadow-[3px_3px_0_0_#000]">
        {PAGE_SIZES.map((size) => (
          <Link
            key={size}
            href={buildHref(1, size)}
            className={`px-1.5 text-[10px] font-black ${size === pageSize ? "bg-black text-white" : "text-black/55 hover:text-black"}`}
          >
            {size}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ==================== 空状态 ====================

function AdminModsEmpty({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <MotionReveal delay={0.08} y={22} rotate={1}>
      <section className="neo-card-lg bg-[var(--neo-panel)] p-6 text-black">
        <div className="border-4 border-black bg-white px-5 py-6 shadow-[8px_8px_0px_0px_#000]">
          {hasActiveFilters ? (
            <>
              <p className="neo-label text-black/60">筛选结果为空</p>
              <h2 className="mt-2 text-3xl font-black">没有符合当前筛选条件的 MOD。</h2>
              <p className="mt-4 text-sm font-bold leading-7 text-black/75">调整筛选条件或清除全部筛选试试。</p>
              <Link href="/admin/mods" className="neo-button-outline mt-4 inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
                清除筛选
              </Link>
            </>
          ) : (
            <>
              <p className="neo-label text-black/60">管理列表为空</p>
              <h2 className="mt-2 text-3xl font-black">你还没有发布任何 MOD。</h2>
              <p className="mt-4 text-sm font-bold leading-7 text-black/75">去上传页面新增一条内容后，这里会自动显示真实数据库记录。</p>
            </>
          )}
        </div>
      </section>
    </MotionReveal>
  );
}

// ==================== 主内容 ====================

type SearchParams = { character?: string; game?: string; query?: string; sort?: string; status?: string; page?: string; pageSize?: string };

async function AdminModsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminUser("/admin/mods");

  const params = (await searchParams) ?? {};
  const filters = parseAdminModsSearchParams(params);
  const page = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);

  const [mods, fullMods] = await Promise.all([
    getAdminMods(filters),
    filters.character ? getAdminMods({ ...filters, character: undefined }) : Promise.resolve(null),
  ]);

  const characterCounts = getAdminCharacterCounts(fullMods ?? mods);
  const sidebar = buildSidebarItems(filters, characterCounts);
  const totalCount = Object.values(characterCounts).reduce((a, b) => a + b, 0);

  const hasActiveFilters = Boolean(
    filters.gameKey || filters.query || filters.character || (filters.status && filters.status !== "all"),
  );

  // 分页
  const totalPages = Math.max(1, Math.ceil(mods.length / pageSize));
  const start = (page - 1) * pageSize;
  const pagedMods = mods.slice(start, start + pageSize);

  // 构建分页 href（保留筛选条件）
  function buildPageHref(p: number, ps?: number) {
    const nextFilters = { ...filters };
    const resolvedSize = ps ?? pageSize;
    const params = new URLSearchParams();
    if (nextFilters.gameKey) params.set("game", nextFilters.gameKey);
    if (nextFilters.status && nextFilters.status !== "all") params.set("status", nextFilters.status);
    if (nextFilters.sort && nextFilters.sort !== "latest") params.set("sort", nextFilters.sort);
    if (nextFilters.query) params.set("query", nextFilters.query);
    if (nextFilters.character) params.set("character", nextFilters.character);
    if (p > 1) params.set("page", String(p));
    if (resolvedSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(resolvedSize));
    const qs = params.toString();
    return qs ? `/admin/mods?${qs}` : "/admin/mods";
  }

  return (
    <div className="flex gap-6 lg:min-h-0 lg:flex-1">
      {/* 左侧角色边栏：独立滚动，不随右侧 mod 一起滚动 */}
      <div className="hidden w-[240px] shrink-0 flex-col lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto pb-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <CharacterSidebar
            allLabel="全部"
            allHref={buildAdminModsHref({ ...filters, character: undefined })}
            allCount={totalCount}
            isAllActive={!filters.character}
            characters={sidebar.all}
          />
        </div>
      </div>

      {/* 右侧主内容区：独立滚动，顶部筛选卡片 sticky 固定 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pb-4">
        <AdminModsListClient
          filters={filters}
          countLabel={
            <p className="text-xs font-black uppercase tracking-[0.14em] text-black/55">
              共 {mods.length} 条{mods.length !== totalCount ? ` / 分站合计 ${totalCount}` : ""}
              {totalPages > 1 ? ` · 第 ${page}/${totalPages} 页` : ""}
            </p>
          }
          mods={pagedMods}
          pagination={
            <AdminPagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              buildHref={buildPageHref}
            />
          }
          emptyState={<AdminModsEmpty hasActiveFilters={hasActiveFilters} />}
        />
      </div>
    </div>
  );
}

// ==================== 页面入口 ====================

export default function AdminModsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col px-4 pt-5 sm:px-6 lg:h-[calc(100vh-100px)] lg:px-8">
      <Suspense fallback={<AdminModsSkeleton />}>
        <AdminModsContent searchParams={searchParams!} />
      </Suspense>
    </div>
  );
}
