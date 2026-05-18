import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "@/lib/supabase/config";
import type { Database } from "@/types/supabase";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const env = getPublicSupabaseEnv();

  if (!env) {
    throw new Error("Supabase 环境变量未配置完整，请检查 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。");
  }

  browserClient = createBrowserClient<Database>(env.url, env.anonKey);

  return browserClient;
}
