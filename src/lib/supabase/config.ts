export type PublicSupabaseEnv = {
  anonKey: string;
  url: string;
};

export function getPublicSupabaseEnv(): PublicSupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return {
    anonKey,
    url,
  };
}
