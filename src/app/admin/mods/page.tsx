import Link from "next/link";
import { Suspense } from "react";
import { Download, Gamepad2, PencilRuler } from "lucide-react";

import { games } from "@/config/games";
import { requireAdminUser } from "@/actions/auth/auth-actions";
import { DeleteModButton } from "@/components/features/admin/mods/delete-mod-button";
import { FixCreatorButton } from "@/components/features/admin/mods/fix-creator-button";
import { PublishToggleButton } from "@/components/features/admin/mods/publish-toggle-button";
import { AdminModsSkeleton } from "@/components/layout/data-skeletons";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Badge } from "@/components/ui/badge";
import { getAdminMods } from "@/lib/mods";

async function AdminModsList() {
  const mods = await getAdminMods();
  const gameNameMap = new Map<string, string>(games.map((game) => [game.key, game.name]));

  if (mods.length === 0) {
    return (
      <MotionReveal delay={0.08} y={22} rotate={1}>
        <section className="neo-card-lg bg-[var(--neo-panel)] p-6 text-black">
          <div className="border-4 border-black bg-white px-5 py-6 shadow-[8px_8px_0px_0px_#000]">
            <p className="neo-label text-black/60">管理列表为空</p>
            <h2 className="mt-2 text-3xl font-black">你还没有发布任何 MOD。</h2>
            <p className="mt-4 text-sm font-bold leading-7 text-black/75">
              去上传页面新增一条内容后，这里会自动显示真实数据库记录。
            </p>
          </div>
        </section>
      </MotionReveal>
    );
  }

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

async function AdminModsContent() {
  await requireAdminUser("/admin/mods");
  return <AdminModsList />;
}

export default function AdminModsPage() {
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
        <AdminModsContent />
      </Suspense>
    </div>
  );
}
