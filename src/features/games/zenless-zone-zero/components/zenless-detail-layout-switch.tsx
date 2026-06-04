"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ZenlessDetailLayoutSwitchProps = {
  children: React.ReactNode;
  rightRail: React.ReactNode;
};

type SwitchContextValue = {
  commentsActive: boolean;
};

const SwitchContext = createContext<SwitchContextValue>({ commentsActive: false });

export function useZenlessCommentsActive() {
  return useContext(SwitchContext).commentsActive;
}

export function ZenlessCommentHeroSlot({ children }: { children: React.ReactNode }) {
  const commentsActive = useZenlessCommentsActive();
  return (
    <div className={`grid transition-all duration-500 ease-out ${commentsActive ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function ZenlessDetailLayoutSwitch({ children, rightRail }: ZenlessDetailLayoutSwitchProps) {
  const [commentsActive, setCommentsActive] = useState(false);

  useEffect(() => {
    const syncFromHash = () => setCommentsActive(window.location.hash === "#comments" || window.location.hash === "#mod-comments");
    const handleTabChange = (event: Event) => setCommentsActive((event as CustomEvent<string>).detail === "comments");

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("zenless-detail-tab-change", handleTabChange);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("zenless-detail-tab-change", handleTabChange);
    };
  }, []);

  return (
    <SwitchContext.Provider value={{ commentsActive }}>
      <div className={`relative z-10 mx-auto grid w-full max-w-[1500px] gap-5 px-5 pb-8 pt-[92px] transition-[grid-template-columns] duration-300 lg:px-8 xl:pt-[86px] ${commentsActive ? "xl:grid-cols-[minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)_286px]"}`}>
        <div className={`min-w-0 transition-transform duration-500 ease-out ${commentsActive ? "-translate-y-28 xl:-translate-y-40" : "translate-y-0"}`}>{children}</div>
        <div className={`transition-all duration-300 ease-out ${commentsActive ? "pointer-events-none -translate-y-8 opacity-0 xl:hidden" : "translate-y-0 opacity-100"}`}>{rightRail}</div>
      </div>
    </SwitchContext.Provider>
  );
}
