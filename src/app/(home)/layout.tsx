import { Suspense } from "react";

import { DailyTicker } from "@/components/common/daily-ticker";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteHeaderSkeleton } from "@/components/layout/site-header-skeleton";
import { getDailyUpdates } from "@/lib/mods";

// 近期新上的角色（最近 3 天发布过 mod 的角色名，去重）——仅首页顶部滚动通知使用
async function HomeTopBar() {
  const result = await getDailyUpdates(3);
  const seen = new Set<string>();
  const characters: string[] = [];
  for (const day of result.days) {
    for (const mod of day.mods) {
      const c = mod.character?.trim();
      if (c && !seen.has(c)) {
        seen.add(c);
        characters.push(c);
      }
    }
  }
  return <DailyTicker characters={characters} />;
}

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px]">
      {/* 通知条嵌在 sticky header 首行：桌面显示，移动端隐藏 */}
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader topBar={<Suspense fallback={null}><HomeTopBar /></Suspense>} />
      </Suspense>
      {/* header 为 sticky（含顶部通知条），main 用负 margin 上提，使 snap 容器铺满视口：
          桌面 header 高 = 导航行(~74px) + 通知条(30px)；移动端通知条隐藏，故仅 74px */}
      <main className="w-full">
        {children}
      </main>
    </div>
  );
}
