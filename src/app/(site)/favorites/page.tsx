import Link from "next/link";
import { ArrowRight, LogOut } from "lucide-react";

import { signOutUser } from "@/actions/auth/auth-actions";
import { FavoritesClient } from "@/components/features/mods/favorites/favorites-client";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { getFavoriteMods, type SiteMod } from "@/lib/mods";

/**
 * 我的收藏。
 *
 * 不再要求登录：游客看到的是**本机收藏**（按匿名设备号存在服务端计数器里），
 * 登录用户看到的是「服务端收藏 ∪ 本机收藏」。
 *
 * `getFavoriteMods()` 未登录时返回 null，所以它同时充当「是否登录」的判据；
 * Supabase 抖动时它内部已经降级成空数组，这里再兜一层 try/catch，
 * 保证收藏页在任何情况下都打得开 —— 它不该因为第三方网关挂了而整页报错。
 */
export default async function FavoritesPage() {
  let serverMods: SiteMod[] = [];
  let signedIn = false;

  try {
    const favorites = await getFavoriteMods();
    signedIn = favorites !== null;
    serverMods = favorites ?? [];
  } catch {
    // 按游客视角继续：本机收藏照常可用
  }

  return (
    <div className="flex flex-col gap-8 py-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={1}>
        <section
          className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]"
          style={{ background: "var(--neo-muted)" }}
        >
          <p className="neo-label text-black/60">我的收藏</p>
          <h1 className="mt-2 text-4xl font-black text-black">你收藏的 MOD</h1>
          <p className="mt-2 text-sm font-bold text-black/70">收藏保存在这台设备上，不需要登录。</p>
        </section>
      </MotionReveal>

      <div className="flex flex-wrap items-center gap-3">
        {signedIn ? (
          <form
            action={async () => {
              "use server";
              await signOutUser("/");
            }}
          >
            <button
              type="submit"
              className="neo-button-outline inline-flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-[0.14em]"
            >
              <LogOut className="size-4" />
              退出登录
            </button>
          </form>
        ) : null}
        <Link
          href="/mods?sort=hot"
          className="neo-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]"
        >
          继续挑选 MOD
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <FavoritesClient serverMods={serverMods} signedIn={signedIn} />
    </div>
  );
}
