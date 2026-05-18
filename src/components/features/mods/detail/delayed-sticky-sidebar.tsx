"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type DelayedStickySidebarProps = {
  children: React.ReactNode;
  commentsSelector?: string;
  topOffset?: number;
  topOffsetClassName?: string;
};

export function DelayedStickySidebar({
  children,
  commentsSelector = "[data-comments-panel]",
  topOffset = 96,
  topOffsetClassName = "xl:top-24",
}: DelayedStickySidebarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isStickyActive, setIsStickyActive] = useState(false);

  useEffect(() => {
    const updateStickyState = () => {
      if (window.innerWidth < 1280) {
        setIsStickyActive(false);
        return;
      }

      const commentsPanel = document.querySelector<HTMLElement>(commentsSelector);
      const container = containerRef.current;

      if (!commentsPanel || !container) {
        setIsStickyActive(false);
        return;
      }

      const commentsRect = commentsPanel.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const isShortComments = commentsRect.height <= viewportHeight - topOffset - 24;

      if (isShortComments) {
        setIsStickyActive(commentsRect.bottom <= viewportHeight - 24);
        return;
      }

      setIsStickyActive(containerRect.top <= topOffset);
    };

    updateStickyState();
    window.addEventListener("scroll", updateStickyState, { passive: true });
    window.addEventListener("resize", updateStickyState);

    return () => {
      window.removeEventListener("scroll", updateStickyState);
      window.removeEventListener("resize", updateStickyState);
    };
  }, [commentsSelector, topOffset]);

  return (
    <div ref={containerRef} className={cn(isStickyActive && "xl:sticky", isStickyActive && topOffsetClassName)}>
      {children}
    </div>
  );
}
