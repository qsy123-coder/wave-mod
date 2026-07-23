"use client";

import { useCallback, useState } from "react";

import { ModCard } from "@/components/common/mod-card";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { BatchActionBar } from "./batch-action-bar";
import type { AdminMod } from "@/lib/mods";

type AdminModsGridClientProps = {
  mods: AdminMod[];
};

export function AdminModsGridClient({ mods }: AdminModsGridClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <>
      <section className="grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {mods.map((mod, index) => (
          <MotionReveal key={mod.id} delay={0.03 + (index % 8) * 0.02} y={14} rotate={index % 2 === 0 ? -1 : 1}>
            <ModCard
              mod={mod}
              href={`/admin/mods/${mod.id}/edit`}
              linkMode="split"
              variant="list"
              className="bg-[#fff8ef] p-2.5"
              imageAspectClassName="aspect-[5/6] sm:aspect-[4/5]"
              imagePriority={index < 4}
              imageFetchPriority={index < 4 ? "high" : "auto"}
              imageSizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              titleTag="h3"
              showInteractionBar={false}
              showRatingSticker={false}
              showMetaBadges={true}
              showCheckbox
              checkboxChecked={selectedIds.has(mod.id)}
              onCheckboxChange={(checked) => toggleSelect(mod.id, checked)}
              extraMetaBadges={
                <span className={`inline-flex items-center border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-black shadow-[2px_2px_0_0_#000] ${mod.isPublished ? "bg-[#4ade80]" : "bg-[#ffd84f]"}`}>
                  {mod.isPublished ? "已发布" : "草稿"}
                </span>
              }
              bodyBottom={null}
            />
          </MotionReveal>
        ))}
      </section>

      <BatchActionBar
        selectedIds={Array.from(selectedIds)}
        onClearSelection={clearSelection}
      />
    </>
  );
}
