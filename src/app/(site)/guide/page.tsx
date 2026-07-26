import { MotionReveal } from "@/components/layout/motion-reveal";
import { tutorialConfig } from "@/features/tutorial/config";
import { TutorialTabs } from "@/features/tutorial/components/tutorial-tabs";

const { title, subtitle, chapters, imageBasePath } = tutorialConfig;

export default function GuidePage() {
  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col gap-4 py-4 lg:py-6">
      {/* Hero header — compact */}
      <MotionReveal delay={0.04} rotate={-1}>
        <section
          className="inline-block border-4 border-black px-4 py-2.5 shadow-[6px_6px_0px_0px_#000]"
          style={{ background: "var(--neo-secondary)" }}
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-black/60">{subtitle}</p>
          <h1 className="mt-1 text-2xl font-black text-black">{title}</h1>
          <p className="mt-1 text-xs font-bold leading-6 text-black/70">
            教程实时更新，共 00-04 分为了 5 节
          </p>
        </section>
      </MotionReveal>

      {/* Tab-based chapter navigation + content */}
      <MotionReveal delay={0.08} y={24} className="flex min-h-0 flex-1 flex-col">
        <TutorialTabs chapters={chapters} imageBasePath={imageBasePath} />
      </MotionReveal>
    </div>
  );
}
