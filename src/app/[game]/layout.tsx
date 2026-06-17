import { LayoutStyleTransition } from "@/components/layout/layout-style-transition";
import { getGameBySlug } from "@/config/games";
import { ZenlessGlassNav } from "@/features/games/zenless-zone-zero/components/zenless-glass-nav";
import { getLayoutStyle } from "@/lib/layout-style/server";

type GameLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ game: string }>;
};

export default async function GameLayout({ children, params }: GameLayoutProps) {
  const { game: gameSlug } = await params;
  const game = getGameBySlug(gameSlug);
  const layoutStyle = await getLayoutStyle();

  if (!game) return children;

  // 绝区零分站 — 始终使用 ZenlessGlassNav + ZZZ 组件
  if (game.key === "zenless-zone-zero") {
    return (
      <>
        <ZenlessGlassNav game={game} />
        <div className="zzz-skin-scope min-h-screen bg-[#3a2418] bg-[radial-gradient(circle,rgba(0,0,0,0.42)_1.5px,transparent_1.6px),linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:24px_24px,44px_44px,44px_44px] pt-[74px]">
          <LayoutStyleTransition layoutStyle={layoutStyle}>
            {children}
          </LayoutStyleTransition>
        </div>
      </>
    );
  }

  return children;
}
