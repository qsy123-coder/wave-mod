import { SiteHeaderClient } from "@/components/layout/site-header-client";
import { getCurrentUser } from "@/lib/supabase/server";
import { isAdminIdentity } from "@/lib/supabase/server-config";

export async function SiteHeader() {
  const user = await getCurrentUser();

  // 管理员判定与后台守卫（requireAdminUser）同源，保证导航显隐和访问权限一致
  return <SiteHeaderClient isLoggedIn={Boolean(user)} isAdmin={isAdminIdentity(user)} />;
}
