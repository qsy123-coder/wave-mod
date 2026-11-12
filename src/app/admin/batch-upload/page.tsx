import { BatchUploadClient } from "@/components/features/admin/batch-upload/batch-upload-client";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { queryRows } from "@/lib/db/query";
import { getCharacterAllowlist } from "@/lib/mods";

import { dedupKey } from "../../../../scripts/daily-classify.mjs";

export const dynamic = "force-dynamic";

export default async function BatchUploadPage() {
  // 角色清单走 getCharacterAllowlist（库内 distinct ∪ 站内已登记角色），
  // **不是**纯 distinct —— 否则新角色的第一条 mod 永远提交不了（见该函数注释）。
  const [characters, modRows] = await Promise.all([
    getCharacterAllowlist(),
    queryRows<{ character: string; title: string }>(
      "select character, title from public.mods",
    ),
  ]);

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
