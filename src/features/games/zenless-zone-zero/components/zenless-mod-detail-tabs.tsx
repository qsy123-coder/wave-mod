"use client";

import { useEffect, useState } from "react";

type ZenlessDetailTabKey =
  | "description"
  | "installation"
  | "changelog"
  | "comments"
  | "recommended";

type ZenlessModDetailTabsProps = {
  changelog: React.ReactNode;
  comments: React.ReactNode;
  commentsCount: number;
  description: React.ReactNode;
  installation: React.ReactNode;
  recommended: React.ReactNode;
  recommendedCount: number;
};

const tabs: { key: ZenlessDetailTabKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "installation", label: "Installation" },
  { key: "changelog", label: "Changelog" },
  { key: "comments", label: "Comments" },
  { key: "recommended", label: "Recommended" },
];

const hashToTab: Record<string, ZenlessDetailTabKey> = {
  "#description": "description",
  "#installation": "installation",
  "#changelog": "changelog",
  "#comments": "comments",
  "#mod-comments": "comments",
  "#recommended": "recommended",
};

function readTabFromHash() {
  if (typeof window === "undefined") return null;
  return hashToTab[window.location.hash] ?? null;
}

export function ZenlessModDetailTabs({
  changelog,
  comments,
  commentsCount,
  description,
  installation,
  recommended,
  recommendedCount,
}: ZenlessModDetailTabsProps) {
  const [activeTab, setActiveTab] =
    useState<ZenlessDetailTabKey>("description");
  const content: Record<ZenlessDetailTabKey, React.ReactNode> = {
    changelog,
    comments,
    description,
    installation,
    recommended,
  };

  useEffect(() => {
    const syncFromHash = () => {
      const tab = readTabFromHash();
      if (tab) {
        setActiveTab(tab);
        window.dispatchEvent(
          new CustomEvent("zenless-detail-tab-change", { detail: tab }),
        );
      }
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const handleTabChange = (tab: ZenlessDetailTabKey) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
    window.dispatchEvent(
      new CustomEvent("zenless-detail-tab-change", { detail: tab }),
    );
  };

  return (
    <section
      id="mod-details"
      className="mt-6 scroll-mt-24 border-t-4 border-black bg-black/25 p-3 pt-4 shadow-[0_-4px_0px_0px_#000]"
    >
      <div className="flex flex-wrap gap-x-8 gap-y-3 text-[12px] font-black uppercase tracking-[0.18em] text-white/62 sm:text-[13px]">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const suffix =
            tab.key === "comments"
              ? ` (${commentsCount})`
              : tab.key === "recommended"
                ? ` (${recommendedCount})`
                : "";

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`px-2 py-1.5 transition active:translate-x-[2px] active:translate-y-[2px] ${isActive ? "border-2 border-black bg-[#0f172a]/48 text-white shadow-[3px_3px_0px_0px_#000] backdrop-blur-[2px]" : "border-2 border-transparent hover:border-black hover:bg-[#172033]/45 hover:text-white hover:shadow-[3px_3px_0px_0px_#000] hover:backdrop-blur-[2px]"}`}
            >
              {tab.label}
              {suffix}
            </button>
          );
        })}
      </div>
      <div className="mt-4">{content[activeTab]}</div>
    </section>
  );
}
