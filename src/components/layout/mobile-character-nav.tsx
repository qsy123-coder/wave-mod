"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";

import { getCharacterImagePath } from "@/lib/constants/character-images";
import { buildModsFilterHref } from "@/lib/navigation-url";

type MobileCharacterNavProps = {
  /** 抽屉是否打开。**只有打开才去拉清单** —— 不开抽屉时零请求、零成本。 */
  open: boolean;
  /** 点了某个角色之后把抽屉关掉（由 header 传入）。 */
  onNavigate: () => void;
};

type CharactersResponse = { characters: string[] };

/**
 * 三条杠抽屉里的「全部角色分类」网格。**每一项是一个具体角色**，点了进入该角色的
 * 资源列表（`/mods?character=<角色名>`），而不是笼统的 `/mods`。
 *
 * 为什么需要它：`/mods` 的角色侧栏是 `hidden … lg:block`，而那个唯一的
 * `CharacterPickerDrawer` 挂在侧栏内部、跟着一起被隐藏 —— 所以**手机端此前完全没有
 * 按角色浏览的入口**，只能靠搜索。这里补上。
 *
 * 为什么数据走 `/api/characters` 现拉，而不是由 header 服务端下发：
 * `src/components/layout/site-header.tsx` 特意是**同步、不碰数据库**的薄包装 ——
 * 它注释里写明，以前 `await getCurrentUser()` 让所有用到 header 的页面都无法静态化，
 * 正是 2026-09-23 打穿 Vercel 额度的直接原因。角色清单要查库，一旦把它塞进 header 的
 * 渲染路径就会重蹈覆辙，所以改成**客户端在抽屉打开时**去拉。
 */
export function MobileCharacterNav({ open, onNavigate }: MobileCharacterNavProps) {
  const { data, isError } = useQuery({
    enabled: open,
    queryFn: async () => {
      const response = await fetch("/api/characters");
      if (!response.ok) throw new Error("加载角色分类失败。");
      return (await response.json()) as CharactersResponse;
    },
    queryKey: ["mobile-character-nav"],
    // 与 /api/characters 的 s-maxage=300 对齐：同一份清单在 5 分钟内反复开关抽屉
    // 不该反复打服务端（关抽屉时组件会卸载，但 QueryClient 的缓存仍在）。
    staleTime: 5 * 60 * 1000,
  });

  const characters = data?.characters ?? [];

  // 加载中与失败都只占一行，不阻塞抽屉其余部分（搜索、游戏切换、收藏入口照常可用）
  if (isError) {
    return <p className="text-[11px] font-black text-black/50">角色分类加载失败，可直接进「角色分类」页浏览。</p>;
  }
  if (characters.length === 0) {
    return <p className="text-[11px] font-black text-black/50">加载中…</p>;
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}
    >
      {characters.map((name) => (
        <CharacterCell key={name} name={name} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

/**
 * 单个角色格：头像 + 名字，整格是链接。
 *
 * 不 preventDefault、也不自己开骨架屏：点击照常冒泡给 header 上的
 * `handleHeaderNavClick`，页面级骨架屏由那条既有路径统一处理。
 */
function CharacterCell({ name, onNavigate }: { name: string; onNavigate: () => void }) {
  const avatarPath = getCharacterImagePath(name);
  // 复用列表页那套筛选口径（有单测盯着），不自己拼 query 串 —— 参数命名与判等
  // （isCurrentNavigationUrl 的「原地踏步」判定）都靠它保持一致。
  const href = buildModsFilterHref("/mods", { character: name });

  return (
    <Link
      href={href}
      // 64 个格子默认预取会在慢网络下同时打出几十个请求，抢当前页的带宽
      // （同 character-picker-drawer.tsx 的理由）
      prefetch={false}
      onClick={onNavigate}
      data-slot="mobile-character-item"
      title={name}
      className="flex flex-col items-center gap-1 border-2 border-black bg-white p-1.5 text-center shadow-[2px_2px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      {avatarPath ? (
        <Image
          src={avatarPath}
          alt={name}
          width={44}
          height={44}
          unoptimized
          className="size-11 shrink-0 rounded-full border-2 border-black object-cover"
        />
      ) : (
        // 无头像时渲染**等大**的占位块。整块跳过 Image 会让这一格高度塌陷，
        // 破坏整行的对齐（侧栏是单列布局，塌陷看不出来，网格里很明显）。
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#fff8ef] text-sm font-black text-black/50"
        >
          {name.slice(0, 1)}
        </span>
      )}
      <span className="w-full truncate text-[10px] font-black leading-none tracking-[0.04em] text-black/75">
        {name}
      </span>
    </Link>
  );
}
