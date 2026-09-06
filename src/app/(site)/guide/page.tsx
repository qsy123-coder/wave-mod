import { tutorialConfig } from "@/features/tutorial/config";
import { TutorialGuideClient } from "@/features/tutorial/components/tutorial-guide-client";
import {
  getTutorialForVersion,
  listVisibleVersions,
  resolveDefaultVersion,
} from "@/actions/tutorial/tutorial-actions";
import type { Chapter, TutorialVersionMeta } from "@/features/tutorial/types";
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

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;

  // 1. 读取可见版本列表 + 解析当前应展示的版本
  const versions: TutorialVersionMeta[] = await listVisibleVersions();

  const explicit = params.v;
  const activeVersion = explicit
    ? versions.find((vv) => vv.id === explicit) ?? null
    : null;
  // 无显式选择：优先默认版本，其次第一个可见版本
  const fallbackVersion = activeVersion ?? (await resolveDefaultVersion());
  const activeVersionId = fallbackVersion?.id ?? versions[0]?.id ?? "";

  // 2. 读取该版本的 published 内容；无则回退 config.ts
  let title: string;
  let subtitle: string;
  let imageBasePath: string;
  let chapters: Chapter[];

  if (activeVersionId) {
    try {
      const dbData = await getTutorialForVersion(activeVersionId);
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
      title = tutorialConfig.title;
      subtitle = tutorialConfig.subtitle;
      imageBasePath = tutorialConfig.imageBasePath;
      chapters = tutorialConfig.chapters;
    }
  } else {
    // 没有任何版本（库未迁移）：走静态 config.ts
    title = tutorialConfig.title;
    subtitle = tutorialConfig.subtitle;
    imageBasePath = tutorialConfig.imageBasePath;
    chapters = tutorialConfig.chapters;
  }

  // 无可见版本时，把静态 config 也作为一个伪版本展示，保证页面不空白
  const displayVersions: TutorialVersionMeta[] =
    versions.length > 0
      ? versions
      : [
          {
            id: "config",
            name: "默认版本",
            is_visible: true,
            is_default: true,
            sort_order: 0,
          },
        ];

  const activeId = versions.length > 0 ? activeVersionId : "config";

  return (
    <TutorialGuideClient
      versions={displayVersions}
      activeVersionId={activeId}
      title={title}
      subtitle={subtitle}
      imageBasePath={imageBasePath}
      chapters={chapters}
    />
  );
}
