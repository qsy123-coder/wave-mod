/**
 * 用真实 mod id 探测 金色蔷薇(76d91711) 与 不善女仆(58e579b5) 的原图 PNG。
 */
const SB = "https://xqwzgcxwdwpmkdbmzmve.supabase.co/storage/v1/object/public/mod-assets";
const COS = "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com";
const probes = [
  // 金色蔷薇 modId=76d91711
  ["金色蔷薇 SB mods/aemeath png", `${SB}/mods/aemeath/76d91711-4f57-4056-b79f-3647a02f0fc1/preview.png`],
  ["金色蔷薇 SB mods/aemeath webp", `${SB}/mods/aemeath/76d91711-4f57-4056-b79f-3647a02f0fc1/preview.webp`],
  ["金色蔷薇 COS mods/aemeath png", `${COS}/mods/aemeath/76d91711-4f57-4056-b79f-3647a02f0fc1/preview.png`],
  ["金色蔷薇 COS mods/爱弥斯 png", `${COS}/mods/%E7%88%B1%E5%BC%A5%E6%96%AF/76d91711-4f57-4056-b79f-3647a02f0fc1/preview.png`],
  ["金色蔷薇 COS mods/mod webp现有", `${COS}/mods/mod/c51b6771-c6d9-4162-88b5-8c5fcc29c7e0/preview.webp`],
  // 不善女仆 modId=58e579b5
  ["不善女仆 SB mods/aemeath png", `${SB}/mods/aemeath/58e579b5-4a8e-475f-ae63-34cdda15003c/preview.png`],
];
for (const [label, url] of probes) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    console.log(`${r.ok ? "✅" : "❌"} ${label} -> ${r.status} ${r.headers.get("content-type")} len=${r.headers.get("content-length")}`);
  } catch (e) { console.log(`⚠️ ${label} 异常: ${e.message}`); }
}
