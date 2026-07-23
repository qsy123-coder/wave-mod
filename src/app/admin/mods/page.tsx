import Link from "next/link";
import { Suspense } from "react";
import { Download, Gamepad2, PencilRuler } from "lucide-react";

import { games } from "@/config/games";
import { requireAdminUser } from "@/actions/auth/auth-actions";
import { AdminModsToolbar } from "@/components/features/admin/mods/admin-mods-toolbar";
import { DeleteModButton } from "@/components/features/admin/mods/delete-mod-button";
import { FixCreatorButton } from "@/components/features/admin/mods/fix-creator-button";
import { PublishToggleButton } from "@/components/features/admin/mods/publish-toggle-button";
import { CharacterSidebar } from "@/components/features/mods/list/character-sidebar";
import { AdminModsSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { defaultCharacterSuggestions } from "@/lib/constants/characters";
import {
  buildAdminModsHref,
  getAdminCharacterCounts,
  parseAdminModsSearchParams,
  sortAdminCharacterNames,
  ADMIN_SPECIAL_CATEGORIES,
  type AdminModsFilters,
} from "@/lib/admin/mods-filters";
import { getAdminMods, type AdminMod } from "@/lib/mods";

/** 侧边栏单项：角色名 → href + count + 是否选中（合并完整角色名单，0 数量也显示） */
function buildSidebarItems(filters: AdminModsFilters, characterCounts: Record<string, number>) {
  // 合并实际有用数据的角色 + 完整角色名单，确保删完数据后角色仍显示
  const mergedNames = Array.from(new Set([...Object.keys(characterCounts), ...defaultCharacterSuggestions]));
  const characterNames = sortAdminCharacterNames(mergedNames);

  // 特殊分类（Skins / Other/Misc / UI）
  const specialItems = ADMIN_SPECIAL_CATEGORIES.filter((c) => characterNames.includes(c)).map((c) => ({
    label: c,
    href: buildAdminModsHref({ ...filters, character: c }),
    count: characterCounts[c] ?? 0,
    isActive: c === filters.character,
  }));

  // 普通角色（排除特殊分类名）
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

function AdminModsCards({ mods }: { mods: AdminMod[] }) {
  const gameNameMap = new Map<string, string>(games.map((game) => [game.key, game.name]));

  if (mods.length === 0) return null;

  return (
    <div className="grid gap-4">
      {mods.map((mod, index) => (
        <MotionReveal key={mod.id} delay={0.08 + index * 0.03} y={22} rotate={index % 2 === 0 ? 1 : -1}>
          <article className="neo-card neo-card-lift bg-[var(--neo-panel)] p-4 text-black">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.7fr_auto] lg:items-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-black leading-tight">{mod.title}</h2>
                <p className="text-sm font-bold leading-7 text-black/75">{mod.description}</p>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-black/55">
                  {new Date(mod.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="neo-sticker -rotate-2 bg-[var(--neo-secondary)] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[var(--neo-secondary)]">
                  <Gamepad2 className="mr-1 size-3.5" />{gameNameMap.get(mod.gameKey) ?? mod.gameKey}
                </Badge>
                <Badge className="neo-sticker rotate-1 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-white">
                  {mod.character}
                </Badge>
                <Badge className="neo-sticker rotate-2 bg-[var(--neo-accent)] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-[var(--neo-accent)]">
                  {mod.version}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className={`neo-sticker justify-center px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-inherit ${mod.isPublished ? "bg-[var(--neo-muted)]" : "bg-white"}`}>
                  {mod.isPublished ? "已发布" : "草稿"}
                </Badge>
                <Badge className="neo-sticker justify-center bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-black hover:bg-white">
                  <Download className="mr-1 size-3.5" />下载 {mod.downloads}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Link href={`/admin/mods/${mod.id}/edit`} className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]">
                  <PencilRuler className="size-4" />
                  编辑
                </Link>
                <PublishToggleButton id={mod.id} isPublished={mod.isPublished} title={mod.title} />
                <DeleteModButton id={mod.id} title={mod.title} />
              </div>
            </div>
          </article>
        </MotionReveal>
      ))}
    </div>
  );
}

function AdminModsEmpty({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <MotionReveal delay={0.08} y={22} rotate={1}>
      <section className="neo-card-lg bg-[var(--neo-panel)] p-6 text-black">
        <div className="border-4 border-black bg-white px-5 py-6 shadow-[8px_8px_0px_0px_#000]">
          {hasActiveFilters ? (
            <>
              <p className="neo-label text-black/60">筛选结果为空</p>
              <h2 className="mt-2 text-3xl font-black">没有符合当前筛选条件的 MOD。</h2>
              <p className="mt-4 text-sm font-bold leading-7 text-black/75">
                调整筛选条件或清除全部筛选试试。
              </p>
              <Link
                href="/admin/mods"
                className="neo-button-outline mt-4 inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
              >
                清除筛选
              </Link>
            </>
          ) : (
            <>
              <p className="neo-label text-black/60">管理列表为空</p>
              <h2 className="mt-2 text-3xl font-black">你还没有发布任何 MOD。</h2>
              <p className="mt-4 text-sm font-bold leading-7 text-black/75">
                去上传页面新增一条内容后，这里会自动显示真实数据库记录。
              </p>
            </>
          )}
        </div>
      </section>
    </MotionReveal>
  );
}

type SearchParams = { character?: string; game?: string; query?: string; sort?: string; status?: string };

async function AdminModsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminUser("/admin/mods");

  const params = (await searchParams) ?? {};
  const filters = parseAdminModsSearchParams(params);

  // 角色计数需要不受 character 筛选影响的全量（侧边栏展示每个角色在当前游戏/状态/关键词下的库存）
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

  return (
    <div className="flex gap-6">
      {/* 左侧角色边栏 — 参照 mods-listing.tsx 布局 */}
      <div className="hidden w-[240px] shrink-0 lg:flex">
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <CharacterSidebar
            allLabel="全部"
            allHref={buildAdminModsHref({ ...filters, character: undefined })}
            allCount={totalCount}
            isAllActive={!filters.character}
            characters={sidebar.all}
          />
        </div>
      </div>

      {/* 右侧主内容区 */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-hidden">
        <AdminModsToolbar filters={filters} />
        <p className="text-xs font-black uppercase tracking-[0.14em] text-black/55">
          共 {mods.length} 条{mods.length !== totalCount ? ` / 分站合计 ${totalCount}` : ""}
        </p>
        {mods.length === 0 ? (
          <AdminModsEmpty hasActiveFilters={hasActiveFilters} />
        ) : (
          <AdminModsCards mods={mods} />
        )}
      </div>
    </div>
  );
}

export default function AdminModsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-secondary)" }}>
          <p className="neo-label text-black/60">Admin Mods</p>
          <h1 className="mt-2 text-4xl font-black text-black">后台 MOD 管理列表</h1>
          <div className="mt-4 flex flex-wrap gap-3">
            <FixCreatorButton />
          </div>
        </section>
      </MotionReveal>

      <Suspense fallback={<AdminModsSkeleton />}>
        <AdminModsContent searchParams={searchParams!} />
      </Suspense>
    </div>
  );
}
