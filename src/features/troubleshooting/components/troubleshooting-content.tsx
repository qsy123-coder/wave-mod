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
  const qaRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
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

  // Default: all Q&A items expanded
  const allIds = useMemo(
    () => allCategories.flatMap((cat) => cat.questions.map((qa) => qa.id)),
    [allCategories],
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allIds));
  const [activeCategory, setActiveCategory] = useState(categories[0]?.key ?? "");
  // TOC: which categories have their Q&A list expanded (default all)
  const [tocExpanded, setTocExpanded] = useState<Set<string>>(() => new Set());

  const toggleQA = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Scroll spy: track which category heading is closest to the header
  useEffect(() => {
    let rafId = 0;
    const HEADER_OFFSET = 100; // sticky header + some padding

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        let bestKey = categories[0]?.key ?? "";
        let bestDist = Infinity;

        categoryRefs.current.forEach((el, key) => {
          const top = el.getBoundingClientRect().top;
          // Pick the heading closest to HEADER_OFFSET by absolute distance.
          // This avoids the "skip a level" bug that happens when a heading
          // just passed the header and the next heading is still far below —
          // the old algorithm fell back to the very first category.
          const dist = Math.abs(top - HEADER_OFFSET);
          if (dist < bestDist) {
            bestDist = dist;
            bestKey = key;
          }
        });

        setActiveCategory(bestKey);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Fire once to sync initial state
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [categories]);

  const scrollToCategory = useCallback((key: string) => {
    const el = categoryRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const scrollToQA = useCallback((qaId: string) => {
    const el = qaRefs.current.get(qaId);
    if (el) {
      // Expand the Q&A if it's collapsed
      setExpanded((prev) => {
        if (prev.has(qaId)) return prev;
        const next = new Set(prev);
        next.add(qaId);
        return next;
      });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Expand / collapse all
  const allExpanded = expanded.size === allIds.length;
  const toggleAll = useCallback(() => {
    setExpanded(allExpanded ? new Set() : new Set(allIds));
  }, [allExpanded, allIds]);

  // ── Draggable divider ──
  const [sidebarWidth, setSidebarWidth] = useState(340); // px
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartWidth.current = sidebarWidth;
    },
    [sidebarWidth],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current;
      const next = Math.min(400, Math.max(160, dragStartWidth.current + delta));
      setSidebarWidth(next);
    };

    const onMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  return (
    <>
      {/* ── Mobile TOC (outside the neo box, sticky) ── */}
      <div className="sticky top-20 z-10 mb-4 overflow-x-auto pb-2 lg:hidden">
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

      {/* ── Neo box: TOC | divider | content ── */}
      <div
        className="flex border-4 border-black shadow-[6px_6px_0px_0px_#000]"
        style={{ background: "var(--neo-panel)" }}
      >
        {/* Desktop Sidebar TOC */}
        <aside
          className="hidden shrink-0 lg:block"
          style={{ width: `${sidebarWidth}px` }}
        >
          <nav className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-black/40">
              目录
            </p>
            {allCategories.map((cat) => {
              const isTocOpen = tocExpanded.has(cat.key);
              return (
                <div key={cat.key} className="mb-2">
                  <div
                    className={`flex w-full items-center gap-2 border-l-[3px] py-0.5 pl-2 transition ${
                      activeCategory === cat.key
                        ? "border-black"
                        : "border-transparent hover:border-black/20"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setTocExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat.key)) next.delete(cat.key);
                          else next.add(cat.key);
                          return next;
                        })
                      }
                      className="shrink-0 rounded p-0.5 text-black/40 hover:bg-black/10 hover:text-black"
                      aria-label={isTocOpen ? "收起" : "展开"}
                    >
                      <ChevronDown
                        className={`size-3.5 transition-transform ${
                          isTocOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToCategory(cat.key)}
                      className={`text-left text-sm font-black transition ${
                        activeCategory === cat.key
                          ? "text-black"
                          : "text-black/60 hover:text-black"
                      }`}
                    >
                      {cat.label}
                    </button>
                  </div>
                  {isTocOpen && (
                    <div className="ml-4 mt-0.5 space-y-0">
                      {cat.questions.map((qa) => (
                        <button
                          key={qa.id}
                          type="button"
                          onClick={() => scrollToQA(qa.id)}
                          className="block w-full truncate py-0.5 pl-1.5 text-left text-xs font-medium text-black/40 transition hover:text-black/70"
                          title={`${qa.id} · ${qa.title}`}
                        >
                          {qa.id} · {qa.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Draggable divider (desktop) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整宽度"
          onMouseDown={onDividerMouseDown}
          className={`hidden w-2 shrink-0 cursor-col-resize border-r-4 border-black transition-colors lg:block ${
            isDragging ? "bg-[var(--neo-accent)]" : "hover:bg-black/5"
          }`}
        />

        {/* Content Area */}
        <div ref={contentRef} className="min-w-0 flex-1 p-5">
          {/* Expand / collapse all bar */}
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1 border-[2px] border-black px-2.5 py-1 text-[11px] font-black text-black transition hover:bg-[var(--neo-accent)]"
            >
              <ChevronDown
                className={`size-3 transition-transform ${
                  allExpanded ? "rotate-0" : "-rotate-90"
                }`}
              />
              {allExpanded ? "全部收起" : "全部展开"}
            </button>
          </div>

          {allCategories.map((cat, catIdx) => (
            <div
              key={cat.key}
              ref={(el) => {
                if (el) categoryRefs.current.set(cat.key, el);
              }}
              data-cat-key={cat.key}
              className={`scroll-mt-32 ${catIdx > 0 ? "mt-6" : ""}`}
            >
              {/* Category heading */}
              <h2 className="text-lg font-black text-black">{cat.label}</h2>
              {/* Divider */}
              <div className="mt-1.5 border-t-4 border-black" />

              {/* Q&A items */}
              <div className="mt-2">
                {cat.questions.map((qa) => {
                  const isOpen = expanded.has(qa.id);
                  return (
                    <div key={qa.id}>
                      {/* Q&A header — click to toggle */}
                      <button
                        ref={(el) => {
                          if (el) qaRefs.current.set(qa.id, el);
                        }}
                        type="button"
                        onClick={() => toggleQA(qa.id)}
                        className="flex w-full items-center gap-2 py-2 text-left transition hover:bg-black/5"
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

                      {/* Subtle divider between Q&A items */}
                      <div className="border-t border-black/10" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Bottom spacing */}
          <div className="h-4" />
        </div>
      </div>
    </>
  );
}
