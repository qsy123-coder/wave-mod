import { createClient } from "@supabase/supabase-js";

import { getServerSupabaseEnv } from "@/lib/supabase/server-config";
import type { Database } from "@/types/supabase";

export function createAdminClient() {
  const env = getServerSupabaseEnv();

  if (!env?.serviceRoleKey) {
    return null;
  }

  return createClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
