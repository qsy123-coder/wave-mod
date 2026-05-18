"use client";

import { useMemo, useState } from "react";

import type { SiteMod } from "@/lib/mods";

import { ModActionDrawer } from "./mod-action-drawer";
import { ModRecommendationsSidebar } from "./mod-recommendations-sidebar";

type ModDetailLayoutShellProps = {
  actionPanel: {
    downloadUrl: string;
    downloads: number;
    isFavorited: boolean;
    isLiked: boolean;
    isLoggedIn: boolean;
    likes: number;
    modId: string;
    nextPath: string;
    ratingAverage: number;
    ratingCount: number;
    title: string;
    userRating: number | null;
  };
  children: React.ReactNode;
  recommendedMods: SiteMod[];
  priorityCharacter: string;
};

export function ModDetailLayoutShell({ actionPanel, children, recommendedMods, priorityCharacter }: ModDetailLayoutShellProps) {
  const [expanded, setExpanded] = useState(false);
  const [leftExpanded, setLeftExpanded] = useState(false);

  const contentStyle = useMemo(
    () => ({
      marginLeft: leftExpanded ? "332px" : "108px",
      marginRight: expanded ? "clamp(320px, 25vw, 396px)" : "72px",
      transform: expanded ? "translateX(-4px) scale(0.998)" : "translateX(0px) scale(1)",
    }),
    [expanded, leftExpanded],
  );

  return (
    <>
      <ModActionDrawer {...actionPanel} onExpandedChange={setLeftExpanded} />
      <div className="relative z-10 transition-[margin,transform] duration-300 ease-in-out xl:pr-4" style={contentStyle}>
        {children}
      </div>
      <ModRecommendationsSidebar
        items={recommendedMods}
        collapsedCount={6}
        open={expanded}
        onOpenChange={setExpanded}
        priorityCharacter={priorityCharacter}
      />
    </>
  );
}
