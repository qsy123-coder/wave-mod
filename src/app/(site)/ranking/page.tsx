import { getDefaultGame } from "@/config/games";
import { DefaultGameRankingPage } from "@/features/games/shared/default-game-ranking-page";

export default function RankingPage() {
  return <DefaultGameRankingPage game={getDefaultGame()} />;
}
