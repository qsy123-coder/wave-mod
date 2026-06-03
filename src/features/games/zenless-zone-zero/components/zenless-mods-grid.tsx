import type { GameConfig } from "@/config/games";
import type { SiteMod } from "@/lib/mods";
import { ZenlessModsCard } from "./zenless-mods-card";
import { ZenlessModsMotionItem } from "./zenless-mods-motion";

export function ZenlessModsGrid({ game, mods }: { game: GameConfig; mods: SiteMod[] }) {
  if (!mods.length) {
    return (
      <div className="border-4 border-black bg-white p-8 text-center text-black shadow-[8px_8px_0_0_#000]">
        <p className="text-2xl font-black">暂无匹配的绝区零 MOD</p>
        <p className="mt-3 text-sm font-bold text-black/65">尝试清空筛选，或等待管理员上传更多代理人 MOD。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {mods.slice(0, 10).map((mod, index) => (
        <ZenlessModsMotionItem key={mod.id} delay={index * 0.035} lift={16} rotate={index % 2 === 0 ? -0.4 : 0.4}>
          <ZenlessModsCard game={game} index={index} mod={mod} />
        </ZenlessModsMotionItem>
      ))}
    </div>
  );
}

export function ZenlessModsPagination() {
  return (
    <div className="flex items-center justify-center gap-2 pt-1">
      {[1, 2, 3, 4, 5].map((page) => <span key={page} className={`flex size-9 items-center justify-center border-4 border-black text-xs font-black shadow-[4px_4px_0_0_#000] ${page === 1 ? "bg-[var(--neo-accent)]" : "bg-white"}`}>{page}</span>)}
      <span className="border-4 border-black bg-[var(--neo-secondary)] px-3 py-2 text-xs font-black shadow-[4px_4px_0_0_#000]">119</span>
    </div>
  );
}
