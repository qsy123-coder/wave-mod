import Link from "next/link";
import { Suspense } from "react";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { UploadForm } from "@/components/features/admin/upload/upload-form";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { getCharacterSuggestions } from "@/lib/mods";

function AdminUploadSkeleton() {
  return <div className="neo-card-lg h-[560px] animate-pulse bg-[var(--neo-panel)]" />;
}

async function AdminUploadContent() {
  await requireAdminUser("/admin/upload");
  const characters = await getCharacterSuggestions();

  return (
    <>
      <UploadForm characters={characters} />

      <MotionReveal delay={0.2} rotate={1}>
        <Link href="/admin/mods" className="neo-button-primary inline-flex w-fit items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]">
          继续查看后台管理列表
        </Link>
      </MotionReveal>
    </>
  );
}

export default function AdminUploadPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-accent)" }}>
          <p className="neo-label text-black/60">Admin Upload</p>
          <h1 className="mt-2 text-4xl font-black text-black">管理员上传表单</h1>
        </section>
      </MotionReveal>

      <Suspense fallback={<AdminUploadSkeleton />}>
        <AdminUploadContent />
      </Suspense>
    </div>
  );
}
