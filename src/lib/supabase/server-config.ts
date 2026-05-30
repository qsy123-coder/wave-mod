import "server-only";

const DEFAULT_ADMIN_PHONES = ["15676325715"];

export type ServerSupabaseEnv = {
  adminEmail: string | null;
  adminPhones: string[];
  anonKey: string;
  serviceRoleKey: string | null;
  url: string;
};

function normalizeChinaPhone(rawPhone: string) {
  const compact = rawPhone.replace(/[\s-]/g, "").trim();

  if (/^1\d{10}$/.test(compact)) {
    return compact;
  }

  if (/^86(1\d{10})$/.test(compact)) {
    return compact.slice(2);
  }

  if (/^\+86(1\d{10})$/.test(compact)) {
    return compact.slice(3);
  }

  return "";
}

function getAdminPhones() {
  const configuredPhones = (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map(normalizeChinaPhone)
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ADMIN_PHONES, ...configuredPhones]));
}

export function getServerSupabaseEnv(): ServerSupabaseEnv | null {
  // 增强版：同时支持多种变量名称（兼容 Cloudflare + Vercel）
  const url = 
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();

  const anonKey = 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return {
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    adminPhones: getAdminPhones(),
    anonKey,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    url,
  };
}

export function isAdminIdentity(identity: { email?: string | null; phone?: string | null } | null | undefined, env = getServerSupabaseEnv()) {
  const email = identity?.email?.trim().toLowerCase() || "";
  const phone = normalizeChinaPhone(identity?.phone ?? "");

  return Boolean((email && env?.adminEmail && email === env.adminEmail) || (phone && env?.adminPhones.includes(phone)));
}
