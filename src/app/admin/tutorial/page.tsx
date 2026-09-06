import { Suspense } from "react";
import { BookOpen } from "lucide-react";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { needsMigration } from "@/actions/tutorial/tutorial-actions";
import { listAllVersions } from "@/actions/tutorial/tutorial-actions";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { TutorialAdminClient } from "@/features/tutorial-admin/components/tutorial-admin-client";

export default async function AdminTutorialPage() {
  await requireAdminUser("/admin/tutorial");

  const migrationNeeded = await needsMigration();
  const versions = migrationNeeded ? [] : await listAllVersions();

  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section
          className="inline-flex items-center gap-3 border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]"
          style={{ background: "var(--neo-secondary)" }}
        >
          <BookOpen className="size-6" />
          <div>
            <p className="neo-label text-black/60">Admin Tutorial</p>
            <h1 className="mt-1 text-4xl font-black text-black">教程管理</h1>
          </div>
        </section>
      </MotionReveal>

      <Suspense
        fallback={
          <div className="border-4 border-black bg-white p-8 text-center shadow-[6px_6px_0px_0px_#000]">
            <p className="text-sm font-bold text-black/60">加载中...</p>
          </div>
        }
      >
        <TutorialAdminClient versions={versions} needsMigration={migrationNeeded} />
      </Suspense>
    </div>
  );
}
