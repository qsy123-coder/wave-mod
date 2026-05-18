import "server-only";

export type ServerSupabaseEnv = {
  adminEmail: string | null;
  anonKey: string;
  serviceRoleKey: string | null;
  url: string;
};

export function getServerSupabaseEnv(): ServerSupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return {
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    anonKey,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    url,
  };
}
