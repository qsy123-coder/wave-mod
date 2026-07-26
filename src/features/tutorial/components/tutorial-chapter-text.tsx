import { ExternalLink } from "lucide-react";

import type { Chapter } from "../types";

type TutorialChapterTextProps = {
  chapter: Chapter;
};

/**
 * Server Component — renders Chapter 00's tools list with intro text.
 * Each tool shows a "必需" or "可选" badge and a download link.
 */
export function TutorialChapterText({ chapter }: TutorialChapterTextProps) {
  const tools = chapter.tools ?? [];

  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Intro text */}
      {chapter.intro && (
        <div
          className="border-4 border-black p-4 shadow-[6px_6px_0px_0px_#000]"
          style={{ background: "var(--neo-panel)" }}
        >
          <p className="text-sm font-bold leading-7 text-black/80">
            {chapter.intro}
          </p>
        </div>
      )}

      {/* Tool list — 2 columns on desktop, 1 on mobile */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {tools.map((tool, index) => {
          const isPlaceholder = tool.url === "#";
          const isRequired = tool.required;
          const bgColors = [
            "var(--neo-accent)",
            "var(--neo-secondary)",
            "var(--neo-muted)",
          ];
          const bg = bgColors[index % bgColors.length];

          return (
            <div
              key={tool.name}
              className="flex items-center justify-between border-4 border-black p-4 shadow-[6px_6px_0px_0px_#000]"
              style={{ background: bg }}
            >
              <div className="flex items-center gap-3">
                {/* Required / Optional badge */}
                <span
                  className="shrink-0 border-[3px] border-black px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0px_0px_#000]"
                  style={{
                    background: isRequired ? "var(--neo-accent)" : "#fff",
                    color: isRequired ? "#000" : "var(--neo-ink)",
                  }}
                >
                  {isRequired ? "必需" : "可选"}
                </span>
                <div>
                  <p className="text-lg font-black text-black">{tool.name}</p>
                  {tool.description && (
                    <p className="mt-1 text-sm font-bold leading-6 text-black/70">
                      {tool.description}
                    </p>
                  )}
                </div>
              </div>
              {isPlaceholder ? (
                <span className="neo-sticker inline-flex shrink-0 items-center gap-1.5 bg-black/10 px-4 py-1.5 text-xs font-bold text-black/50">
                  网盘链接待补充
                </span>
              ) : (
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neo-button-outline inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-black no-underline transition hover:-translate-y-0.5"
                >
                  <ExternalLink className="size-3.5" />
                  官网
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
