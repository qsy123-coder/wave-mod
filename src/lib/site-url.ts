/**
 * 站点的对外绝对地址。
 *
 * 这段逻辑此前只存在于 `actions/auth/auth-actions.ts` 的 `getBaseUrl` 里（那时只有
 * 认证回调需要拼绝对地址）。现在 layout 的 `metadataBase` 与各页 canonical 也要用，
 * 于是抽出来收口 —— 否则很容易出现「auth 跳线上域名、canonical 却拼出 localhost」
 * 这种两套口径，而 canonical 指错域名会直接把权重导到别处。
 *
 * 优先级：`NEXT_PUBLIC_SITE_URL` → Vercel / CF Pages 的部署域名 → localhost。
 * 必须有 fallback：`metadataBase` 是 `new URL(...)`，返回空串会在构建时直接抛。
 *
 * ⚠️ `NEXT_PUBLIC_SITE_URL` 的取值由 Next 的 env 加载顺序决定，而 **`.env.local`
 * 优先于 `.env.production`**（顺序：.env.$(NODE_ENV).local → .env.local →
 * .env.$(NODE_ENV) → .env）。本仓库里 `.env.local` 写的是 `http://localhost:3000`
 * —— 谁把它误传到服务器，线上所有 canonical 和 OG 地址都会变成 localhost，
 * 等于告诉搜索引擎「本站的正版在 localhost」。首尔服务器上只放 `.env.production`
 * （scripts/deploy-hk.sh 会检查其中有 NEXT_PUBLIC_SITE_URL），别加 `.env.local`。
 */
export function getSiteUrl(): string {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  const deploymentUrl = process.env.VERCEL_URL?.trim() || process.env.CF_PAGES_URL?.trim();

  if (deploymentUrl) {
    return deploymentUrl.startsWith("http") ? deploymentUrl : `https://${deploymentUrl}`;
  }

  return "http://localhost:3000";
}
