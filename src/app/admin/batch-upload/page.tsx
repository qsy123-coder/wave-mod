import { BatchUploadClient } from "@/components/features/admin/batch-upload/batch-upload-client";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { queryRows } from "@/lib/db/query";

import { dedupKey } from "../../../../scripts/daily-classify.mjs";

export const dynamic = "force-dynamic";

export default async function BatchUploadPage() {
  const [characterRows, modRows] = await Promise.all([
    queryRows<{ character: string }>(
      "select distinct character from public.mods where character is not null order by character",
    ),
    queryRows<{ character: string; title: string }>(
      "select character, title from public.mods",
    ),
  ]);

  const characters = characterRows.map((row) => row.character);
  const existingKeys = modRows.map((row) => dedupKey(row.character, row.title));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-accent)" }}>
          <p className="neo-label text-black/60">Admin Batch Upload</p>
          <h1 className="mt-2 text-4xl font-black text-black">批量上传 MOD</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-black/70">
            夸克 CSV（必填）+ 迅雷 txt（可选）+ 本地预览图文件夹。先解析预览，确认角色和图片后再上传。
            未知角色会被标红，必须修正；本页不会新建角色分类。
          </p>
        </section>
      </MotionReveal>

      <BatchUploadClient characters={characters} existingKeys={existingKeys} />
    </div>
  );
}
