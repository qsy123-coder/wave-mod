import { Suspense } from "react";

import { getEditableMod } from "@/actions/admin/edit-mod-actions";
import { getUploadFormValuesFromMod } from "@/constants/upload-defaults";
import { UploadForm } from "@/components/features/admin/upload/upload-form";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { getCharacterSuggestions } from "@/lib/mods";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function AdminEditSkeleton() {
  return <div className="neo-card-lg h-[560px] animate-pulse bg-[var(--neo-panel)]" />;
}

async function AdminEditModContent({ params }: PageProps) {
  const { id } = await params;
  const mod = await getEditableMod(id);
  const characters = await getCharacterSuggestions();

  if (!mod) {
    notFound();
  }

  return (
    <UploadForm
      characters={characters}
      mode="edit"
      modId={mod.id}
      formValues={getUploadFormValuesFromMod(mod)}
    />
  );
}

export default function AdminEditModPage({ params }: PageProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-muted)" }}>
          <p className="neo-label text-black/60">Admin Edit</p>
          <h1 className="mt-2 text-4xl font-black text-black">编辑 MOD 信息</h1>
        </section>
      </MotionReveal>

      <Suspense fallback={<AdminEditSkeleton />}>
        <AdminEditModContent params={params} />
      </Suspense>
    </div>
  );
}
