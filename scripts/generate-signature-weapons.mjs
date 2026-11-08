/**
 * 从资源包的 catalog.json 生成「角色 → 专武」映射。
 *
 * 用法：
 *   node scripts/generate-signature-weapons.mjs --catalog="<解压后的 resource-pack/catalog.json>"
 *
 * 映射只包含同时满足以下条件的角色：有 signature_weapon_id，且该武器在
 * catalog 的 weapons 里能查到名字。生成结果提交到仓库，供抽卡成本档案使用。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const arg = process.argv.slice(2).find((item) => item.startsWith("--catalog="));
const catalogPath = arg?.slice("--catalog=".length);

if (!catalogPath) {
  console.error('❌ 缺少 --catalog="<resource-pack/catalog.json>"');
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(resolve(process.cwd(), catalogPath), "utf8"));
const resources = Array.isArray(catalog.resources) ? catalog.resources : [];

const weaponNames = new Map(
  resources
    .filter((item) => item.resource_type === "weapon")
    .map((item) => [Number(item.resource_id), String(item.name)]),
);

const rows = resources
  .filter((item) => item.resource_type === "role" && item.signature_weapon_id)
  .map((item) => ({
    roleId: Number(item.resource_id),
    roleName: String(item.name),
    weaponId: Number(item.signature_weapon_id),
    weaponName: weaponNames.get(Number(item.signature_weapon_id)) ?? "",
  }))
  .filter((item) => Number.isInteger(item.roleId) && Number.isInteger(item.weaponId) && item.weaponName)
  .sort((a, b) => a.roleId - b.roleId);

const lines = [
  "/**",
  " * 角色 → 专武映射。",
  " *",
  " * 由 scripts/generate-signature-weapons.mjs 从资源包 catalog.json 生成，不要手改。",
  " * 数据来源与许可见同目录 NOTICE.md。",
  " */",
  "",
  "export type SignatureWeapon = {",
  "  /** 角色名，仅用于展示与日志 */",
  "  roleName: string;",
  "  /** 专属武器 resourceId */",
  "  weaponId: number;",
  "  /** 专属武器名 */",
  "  weaponName: string;",
  "};",
  "",
  "export const SIGNATURE_WEAPONS: Record<number, SignatureWeapon> = {",
  ...rows.map(
    (item) =>
      `  ${item.roleId}: ${JSON.stringify(
        { roleName: item.roleName, weaponId: item.weaponId, weaponName: item.weaponName },
        null,
        2,
      )
        .replace(/\n/g, "\n  ")
        .replace(/^  \{/, " {")},`,
  ),
  "};",
  "",
];

const target = resolve(process.cwd(), "src/features/gacha/lib/signature-weapons.ts");
writeFileSync(target, lines.join("\n"), "utf8");
console.log(`✅ 写入 ${rows.length} 条映射 → ${target}`);
