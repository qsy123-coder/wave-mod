import { Flame, Sparkles } from "lucide-react";

import { getDefaultGame } from "@/config/games";
import { getDailyUpdates } from "@/lib/mods";

import { DailyDateSidebar, DailyMobilePills } from "./daily-update-pills";
import { UpdatesGrid } from "./updates-grid";

// 每日更新页：最近 14 天按天分组展示公开 mod，日期倒序，顶部日期胶囊锚点跳转。
// 卡片点击在本页弹出详情抽屉（见 updates-grid.tsx），不再跳转到 /mods/[id]。
//
// 这里原本是 `export const dynamic = "force-dynamic"`，为的是每次请求都用
// getCurrentUser() 算出登录态并逐层传给卡片/抽屉。登录态现在由客户端的
// SessionProvider 补齐（见 updates-grid.tsx），因此改成按时间重验证。
//
// revalidate 300 与 `/api/updates`、`/api/home/lower` 已有的 300 秒缓存一致：
// 「今日更新」的日期标签由 `Date.now()` 派生，必须保持接近实时。
export const revalidate = 300;

const DAYS = 14;

export default async function UpdatesPage() {
  const result = await getDailyUpdates(DAYS, getDefaultGame().key);

  const { days } = result;
  const daysWithMods = days.filter((d) => d.mods.length > 0);
  const totalThisWeek = daysWithMods.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="py-8 text-white">
      {/* 页头 */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-[var(--neo-accent)]" />
            <h1 className="text-2xl font-black uppercase tracking-tight">每日更新</h1>
          </div>
          <p className="mt-1 text-sm font-bold text-white/60">
            最近 {DAYS} 天按日期汇总 · 共 {totalThisWeek} 个 mod 上新
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/60">
          <Flame className="size-4 text-[var(--neo-accent)]" />
          {daysWithMods.length > 0 ? `${daysWithMods[0].fullLabel}` : "今日暂无更新"}
        </div>
      </header>

      {/* 左侧固定日期侧边栏 + 右侧内容（参考角色分类页布局） */}
      <div className="flex gap-6">
        <DailyDateSidebar days={days} />

        <div className="min-w-0 flex-1 space-y-4">
          {/* 移动端降级：横向日期胶囊 */}
          <DailyMobilePills days={days} />

          {/* 卡片网格 + 详情抽屉（client 组件，自己从 SessionProvider 取登录态） */}
          <UpdatesGrid days={days} />
        </div>
      </div>
    </div>
  );
}
