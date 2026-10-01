"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Heart, Sparkles } from "lucide-react";

import { ModCard } from "@/components/common/mod-card";
import { FavoriteButton } from "@/components/features/mods/detail/favorite-button";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Card, CardContent } from "@/components/ui/card";
import { getDeviceId } from "@/lib/engagement/device";
import type { SiteMod } from "@/lib/mods";

type Props = {
  /** 登录用户在服务端那份收藏；Supabase 网关被锁时通常是空数组 */
  serverMods: SiteMod[];
  signedIn: boolean;
  /** 分站收藏页传入；给了就只展示该游戏的内容 */
  gameKey?: string;
};

/**
 * /favorites 的列表主体。
 *
 * 数据来源有两个，**合并后按 mod id 去重**（服务端那份优先，它才是权威的）：
 *   - 本机收藏：`/api/engagement/favorites` 按匿名设备号返回 id 清单
 *   - 服务端收藏：登录用户由页面在服务端取好，作为 props 传进来
 *
 * 拿不到本机清单时**静默降级**成只显示服务端那份，不报错 —— 收藏页不该因为
 * 一次请求失败就整页白掉。
 */
export function FavoritesClient({ serverMods, signedIn, gameKey }: Props) {
  const [mods, setMods] = useState<SiteMod[]>(serverMods);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const idsResponse = await fetch("/api/engagement/favorites", {
          headers: { "x-device-id": getDeviceId() },
          cache: "no-store",
        });

        const ids = idsResponse.ok ? ((await idsResponse.json()) as { ids?: string[] }).ids ?? [] : [];

        let localMods: SiteMod[] = [];
        if (ids.length > 0) {
          const modsResponse = await fetch(`/api/mods/by-ids?ids=${encodeURIComponent(ids.join(","))}`, {
            cache: "no-store",
          });
          if (modsResponse.ok) {
            localMods = ((await modsResponse.json()) as { mods?: SiteMod[] }).mods ?? [];
          }
        }

        if (cancelled) return;

        const inScope = (mod: SiteMod) => !gameKey || mod.gameKey === gameKey;

        const merged = new Map<string, SiteMod>();
        for (const mod of localMods) if (inScope(mod)) merged.set(mod.id, mod);
        for (const mod of serverMods) if (inScope(mod)) merged.set(mod.id, mod);

        setMods([...merged.values()]);
      } catch {
        if (!cancelled) setMods(serverMods);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
    // serverMods 是服务端一次性传进来的快照，不该随渲染重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && mods.length === 0) {
    return (
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="neo-card-lg h-[420px] animate-pulse bg-[var(--neo-panel)] p-4" />
        ))}
      </div>
    );
  }

  if (mods.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <MotionReveal delay={0.1} y={24} rotate={-1}>
          <Card className="neo-card-lg p-6" style={{ background: "var(--neo-panel)" }}>
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-5 p-0 text-center text-black">
              <div className="flex size-20 items-center justify-center border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000]">
                <Heart className="size-10" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black">收藏夹还是空的</p>
                <p className="max-w-xl text-sm font-bold leading-7 text-black/75">
                  {signedIn
                    ? "去卡片或详情页点一下收藏，这里就会出现你保存的 MOD。"
                    : "去卡片或详情页点一下收藏即可 —— 现在不用登录，收藏会存在这台设备上。"}
                </p>
              </div>
              <Link
                href="/mods?sort=hot"
                className="neo-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-[0.14em]"
              >
                先去挑 MOD
                <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        </MotionReveal>

        <div className="space-y-5">
          <MotionReveal delay={0.14} y={24} rotate={1}>
            <Card className="neo-card-lg p-6" style={{ background: "var(--neo-accent)" }}>
              <CardContent className="space-y-3 p-0 text-black">
                <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]">
                  <Sparkles className="size-4" />
                  关于本机收藏
                </p>
                <ul className="space-y-3 text-sm font-bold leading-7 text-black/80">
                  <li>• 收藏保存在这台设备上，换设备或清空浏览器数据会丢</li>
                  <li>• 不需要注册登录</li>
                  <li>• 站内的收藏数每个访客都会计入</li>
                </ul>
              </CardContent>
            </Card>
          </MotionReveal>
        </div>
      </div>
    );
  }

  return (
    <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {mods.map((mod, index) => (
        <MotionReveal key={mod.id} delay={0.1 + index * 0.04} y={24} rotate={index % 2 === 0 ? -1 : 1}>
          <ModCard
            mod={mod}
            href={`/mods/${mod.id}`}
            linkMode="split"
            className="bg-[var(--neo-panel)] text-black"
            metaBadgeTone="site"
            bodyBottom={
              <div className="flex items-center justify-between pt-1 text-sm font-bold text-black/70">
                <span>{signedIn ? "服务端 + 本机收藏" : "本机收藏"}</span>
                <span className="font-black uppercase tracking-[0.12em] text-black">收藏夹</span>
              </div>
            }
            actions={
              <FavoriteButton
                id={mod.id}
                isFavorited
                isLoggedIn
                favoriteCount={mod.favorites}
                nextPath="/favorites"
                variant="destructive"
                favoriteLabel="收藏 MOD"
                unfavoriteLabel="移出收藏"
              />
            }
          />
        </MotionReveal>
      ))}
    </section>
  );
}
