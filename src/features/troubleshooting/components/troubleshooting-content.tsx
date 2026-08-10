"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

type CategoryContent = {
  key: string;
  label: string;
  content: string;
  questionCount: number;
};

type Props = {
  categories: CategoryContent[];
};

/** Parsed Q&A item from markdown */
type QAItem = {
  id: string;
  title: string;
  markdown: string;
};

/** Parse a category's markdown into individual Q&A items */
function parseQuestions(md: string): QAItem[] {
  const items: QAItem[] = [];
  // Split by "## Q" headers — each section starts with ## QN · Title
  const parts = md.split(/^## (?=Q\d+)/m);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const headerMatch = trimmed.match(/^(Q\d+)\s*·\s*(.+)$/m);
    if (!headerMatch) continue;
    const id = headerMatch[1];
    const title = headerMatch[2].trim();
    // Remove the header line from the markdown body
    const body = trimmed.slice(headerMatch[0].length).trim();
    items.push({ id, title, markdown: body });
  }
  return items;
}

/** Custom components for react-markdown to apply Neo-brutalism styling */
const markdownComponents: Partial<Components> = {
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 border-[2px] border-black px-1.5 py-0 text-xs font-black text-black no-underline transition hover:bg-[var(--neo-accent)]"
        {...props}
      >
        {children} ↗
      </a>
    );
  },
  blockquote({ children, ...props }) {
    return (
      <blockquote
        className="my-1.5 border-l-4 border-black bg-[var(--neo-muted)]/50 px-3 py-1 text-xs font-bold text-black/70"
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  strong({ children, ...props }) {
    return (
      <strong className="font-black text-black" {...props}>
        {children}
      </strong>
    );
  },
  hr() {
    return <hr className="my-3 border-t-[3px] border-black/20" />;
  },
  ol({ children, ...props }) {
    return (
      <ol className="my-1.5 space-y-0.5 pl-5" style={{ listStyleType: "decimal" }} {...props}>
        {children}
      </ol>
    );
  },
  ul({ children, ...props }) {
    return (
      <ul className="my-1.5 space-y-0.5 pl-5" style={{ listStyleType: "disc" }} {...props}>
        {children}
      </ul>
    );
  },
  li({ children, ...props }) {
    return (
      <li className="text-sm leading-7 text-black/80" {...props}>
        {children}
      </li>
    );
  },
  p({ children, ...props }) {
    return (
      <p className="text-sm leading-7 text-black/80" {...props}>
        {children}
      </p>
    );
  },
  code({ children, ...props }) {
    return (
      <code
        className="border-[2px] border-black bg-[var(--neo-accent)]/30 px-1 py-0 text-xs font-bold text-black"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function TroubleshootingContent({ categories }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState(categories[0]?.key ?? "");
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const contentRef = useRef<HTMLDivElement>(null);

  // Pre-parse all Q&A data
  const allCategories = useMemo(
    () =>
      categories.map((cat) => ({
        ...cat,
        questions: parseQuestions(cat.content),
      })),
    [categories],
  );

  const toggleQA = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Scroll spy: track which category is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCategory((entry.target as HTMLElement).dataset.catKey ?? "");
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    categoryRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [allCategories]);

  const scrollToCategory = useCallback((key: string) => {
    const el = categoryRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div className="flex gap-8">
      {/* ── Desktop Sidebar TOC ── */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <nav className="sticky top-24 space-y-0.5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-black/40">
            目录
          </p>
          {allCategories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => scrollToCategory(cat.key)}
              className={`block w-full border-l-[3px] py-1.5 pl-3 text-left text-xs font-bold transition ${
                activeCategory === cat.key
                  ? "border-black text-black"
                  : "border-transparent text-black/50 hover:border-black/20 hover:text-black/80"
              }`}
            >
              <span className="block truncate">{cat.label}</span>
              <span className="text-[10px] font-medium text-black/30">
                Q1–Q{String(cat.questions.length).padStart(2, "0")}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Mobile TOC ── */}
      <div className="sticky top-20 z-10 -mx-2 overflow-x-auto px-2 pb-2 lg:hidden">
        <div className="flex gap-1.5">
          {allCategories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => scrollToCategory(cat.key)}
              className={`shrink-0 border-[3px] border-black px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                activeCategory === cat.key
                  ? "bg-[var(--neo-accent)]"
                  : "bg-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content Area ── */}
      <div ref={contentRef} className="min-w-0 flex-1 space-y-8">
        {allCategories.map((cat) => (
          <div
            key={cat.key}
            ref={(el) => {
              if (el) categoryRefs.current.set(cat.key, el);
            }}
            data-cat-key={cat.key}
          >
            {/* Category heading */}
            <h2 className="text-lg font-black text-black">{cat.label}</h2>
            {/* Divider */}
            <div className="mt-2 border-t-4 border-black" />

            {/* Q&A items */}
            <div className="mt-3 space-y-1">
              {cat.questions.map((qa) => {
                const isOpen = expanded.has(qa.id);
                return (
                  <div key={qa.id}>
                    {/* Q&A header — click to toggle */}
                    <button
                      type="button"
                      onClick={() => toggleQA(qa.id)}
                      className="flex w-full items-center gap-2 py-2 text-left transition hover:bg-[var(--neo-muted)]/30"
                    >
                      <ChevronDown
                        className={`size-3.5 shrink-0 text-black/50 transition-transform ${
                          isOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                      <span className="text-sm font-black text-black">
                        {qa.id} · {qa.title}
                      </span>
                    </button>

                    {/* Q&A body — collapsible */}
                    {isOpen && (
                      <div className="pb-3 pl-5">
                        <div className="space-y-1 text-sm leading-7 text-black/80">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {qa.markdown}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Subtle divider between Q&A items (not the last one) */}
                    <div className="border-t border-black/10" />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Bottom spacing */}
        <div className="h-8" />
      </div>
    </div>
  );
}
