import { SiteHeaderClient } from "@/components/layout/site-header-client";
import { getCurrentUser } from "@/lib/supabase/server";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return <SiteHeaderClient isLoggedIn={Boolean(user)} />;
}
