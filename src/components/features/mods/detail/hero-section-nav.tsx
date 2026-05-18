"use client";

import { FileText, Image as ImageIcon, MessageSquareMore } from "lucide-react";

type HeroSectionNavProps = {
  compact?: boolean;
};

const navItems = [
  { id: "comments", label: "评论区", icon: MessageSquareMore },
  { id: "gallery", label: "MOD 展示", icon: ImageIcon },
  { id: "details", label: "详细内容", icon: FileText },
] as const;

function scrollToSection(targetId: string) {
  const element = document.getElementById(targetId);
  if (!element) return;

  const top = element.getBoundingClientRect().top + window.scrollY - 96;
  window.scrollTo({ top, behavior: "smooth" });
}

export function HeroSectionNav({ compact = false }: HeroSectionNavProps) {
  const handleNavigate = (target: (typeof navItems)[number]["id"]) => {
    const targetId = target === "gallery" ? "mod-gallery" : target === "details" ? "mod-details" : "mod-comments";
    requestAnimationFrame(() => scrollToSection(targetId));
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "justify-end xl:flex-nowrap" : ""}`}>
      {navItems.map((item, index) => {
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavigate(item.id)}
            className={`inline-flex h-10 items-center gap-1.5 border-4 border-black px-3 text-[10px] font-black uppercase tracking-[0.12em] shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${index % 3 === 0 ? "bg-[#FFD93D]" : index % 3 === 1 ? "bg-white" : "bg-[#C4B5FD]"}`}
            aria-label={`跳转到${item.label}`}
          >
            <Icon className="size-3.5" />
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
