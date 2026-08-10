import { MotionReveal } from "@/components/layout/motion-reveal";
import { tutorialConfig } from "@/features/tutorial/config";
import { TutorialTabs } from "@/features/tutorial/components/tutorial-tabs";
import { VideoHintBanner } from "@/features/tutorial/components/video-hint-banner";
import { getPublishedTutorial } from "@/actions/tutorial/tutorial-actions";
import type { Chapter } from "@/features/tutorial/types";
import type { TutorialFullData, TutorialChapterFull } from "@/features/tutorial-admin/types";

/** Convert database tutorial data to UI Chapter format */
function dbToChapters(data: TutorialFullData): {
  title: string;
  subtitle: string;
  imageBasePath: string;
  chapters: Chapter[];
} {
  const { image_base_path } = data.config;
  return {
    title: data.config.title,
    subtitle: data.config.subtitle,
    imageBasePath: image_base_path,
    chapters: data.chapters.map((ch) => convertChapter(ch, image_base_path)),
  };
}

function convertChapter(
  ch: TutorialChapterFull,
  imageBasePath: string,
): Chapter {
  return {
    id: ch.chapter_key,
    title: ch.title,
    type: ch.type,
    intro: ch.intro ?? undefined,
    video: ch.video_src
      ? { src: ch.video_src, poster: ch.video_poster ?? undefined }
      : undefined,
    images:
      ch.images.length > 0
        ? ch.images.map((img) =>
            // Full COS URL → pass directly; local file → just the filename
            img.url.startsWith("http") ? img.url : img.filename,
          )
        : undefined,
    tools:
      ch.tools.length > 0
        ? ch.tools.map((t) => ({
            name: t.name,
            url: t.url,
            description: t.description ?? undefined,
            required: t.required,
            cloudUrls: {
              baidu: t.cloud_baidu ?? undefined,
              quark: t.cloud_quark ?? undefined,
            },
          }))
        : undefined,
  };
}

export default async function GuidePage() {
  // Try database first, fall back to static config
  let title: string;
  let subtitle: string;
  let imageBasePath: string;
  let chapters: Chapter[];

  try {
    const dbData = await getPublishedTutorial();
    if (dbData) {
      const converted = dbToChapters(dbData);
      title = converted.title;
      subtitle = converted.subtitle;
      imageBasePath = converted.imageBasePath;
      chapters = converted.chapters;
    } else {
      throw new Error("No DB data");
    }
  } catch {
    // Fallback to static config.ts
    title = tutorialConfig.title;
    subtitle = tutorialConfig.subtitle;
    imageBasePath = tutorialConfig.imageBasePath;
    chapters = tutorialConfig.chapters;
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4 py-4 lg:py-6">
      {/* Hero header — compact */}
      <MotionReveal delay={0.04} rotate={-1}>
        <section
          className="inline-block border-4 border-black px-4 py-2.5 shadow-[6px_6px_0px_0px_#000]"
          style={{ background: "var(--neo-secondary)" }}
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-black/60">{subtitle}</p>
          <h1 className="mt-1 text-2xl font-black text-black">{title}</h1>
          <div className="mt-1 flex items-center gap-2 text-2xl font-bold leading-6 text-black/70">
            <span>每节图文教程下方</span>
            <VideoHintBanner />
          </div>
        </section>
      </MotionReveal>

      {/* Tab-based chapter navigation + content */}
      <MotionReveal delay={0.08} y={24} className="flex min-h-0 flex-1 flex-col">
        <TutorialTabs chapters={chapters} imageBasePath={imageBasePath} />
      </MotionReveal>
    </div>
  );
}
