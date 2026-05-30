import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { defaultGameKey } from "@/config/games";
import { LAST_GAME_COOKIE_NAME, getEnabledGameByKey } from "@/lib/games/last-game";

export async function LastGameRedirect() {
  const cookieStore = await cookies();
  const lastGame = getEnabledGameByKey(cookieStore.get(LAST_GAME_COOKIE_NAME)?.value);

  if (lastGame && lastGame.key !== defaultGameKey) {
    redirect(lastGame.nav.home);
  }

  return null;
}
