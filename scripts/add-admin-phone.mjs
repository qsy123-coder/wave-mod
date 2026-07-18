/**
 * 合并"手机用户"分身账号到管理员邮箱账号，并给管理员绑定手机号
 *
 * 用法: node scripts/add-admin-phone.mjs
 *
 * 前提:
 *   .env.local 中已配置 SUPABASE_SERVICE_ROLE_KEY 和 ADMIN_EMAIL
 *
 * 背景:
 *   手机号登录曾自动创建了一个仅有手机号的独立账号（分身），
 *   132 个 mod 和部分互动数据挂在它名下。本脚本把它合并进 ADMIN_EMAIL 账号。
 *
 * 步骤（顺序不可调换）:
 *   1. 定位管理员账号（by ADMIN_EMAIL）与分身账号（by phone）
 *   2. 迁移 mods.created_by / comments.user_id（无唯一约束，整体转移）
 *   3. 迁移 favorites / likes / ratings / comment_reactions
 *      —— 有 unique(user_id, xxx) 约束：与管理员已有记录冲突的行跳过（保留管理员的），
 *         冲突行随第 4 步删号级联删除，并重算受影响 mod 的计数器
 *   4. 删除分身 auth 用户（级联删 profiles 及残留冲突行）
 *   5. 手机号绑定到管理员 auth 用户（phone_confirm: true）
 *   6. 同步 public.profiles.phone
 *
 * 幂等性: 分身不存在时跳过合并，只做绑定；已绑定则全部跳过。
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

// 先加载 .env，再加载 .env.local — .env.local 优先（覆盖模式）
config({ path: resolve(process.cwd(), ".env"), override: true });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

// ==================== 配置 ====================

const PHONE = "15676325715"; // 国内手机号（11 位）
const SUPABASE_PHONE = `86${PHONE}`; // Supabase auth 存储格式（不带 +）
const PHONE_VARIANTS = [PHONE, SUPABASE_PHONE, `+86${PHONE}`];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

if (!url || !serviceRoleKey || !adminEmail) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_EMAIL，请检查 .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ==================== 工具函数 ====================

/** 抛出带上下文的 supabase 错误 */
function assertOk(error, context) {
  if (error) {
    throw new Error(`${context}：${error.message}`);
  }
}

/**
 * 迁移带 unique(user_id, keyCol) 约束的互动表：
 * 与 target 已有记录冲突的行跳过（保留 target 的，冲突行随删号级联删除），
 * 其余按主键逐行改 user_id。返回冲突行涉及的 keyCol 值列表。
 */
async function migrateEngagementTable(table, keyCol, sourceId, targetId) {
  const sourceRows = await supabase.from(table).select(`id, ${keyCol}`).eq("user_id", sourceId);
  assertOk(sourceRows.error, `读取 ${table}(source) 失败`);

  if (!sourceRows.data.length) {
    console.log(`${table}: 无数据可迁移`);
    return [];
  }

  const targetRows = await supabase.from(table).select(keyCol).eq("user_id", targetId);
  assertOk(targetRows.error, `读取 ${table}(target) 失败`);

  const targetKeys = new Set(targetRows.data.map((row) => row[keyCol]));
  const movable = sourceRows.data.filter((row) => !targetKeys.has(row[keyCol]));
  const conflicted = sourceRows.data.filter((row) => targetKeys.has(row[keyCol]));

  for (const row of movable) {
    const { error } = await supabase.from(table).update({ user_id: targetId }).eq("id", row.id);
    assertOk(error, `迁移 ${table} 行 ${row.id} 失败`);
  }

  console.log(`${table}: 迁移 ${movable.length} 行，冲突跳过 ${conflicted.length} 行（保留管理员已有记录）`);
  return conflicted.map((row) => row[keyCol]);
}

/** 按实际行数重算指定 mod 的收藏/点赞/评分计数器（冲突行被级联删除后修正漂移） */
async function recountMod(modId) {
  const [favorites, likes, ratings] = await Promise.all([
    supabase.from("favorites").select("id", { count: "exact", head: true }).eq("mod_id", modId),
    supabase.from("likes").select("id", { count: "exact", head: true }).eq("mod_id", modId),
    supabase.from("ratings").select("score").eq("mod_id", modId),
  ]);
  assertOk(favorites.error, `重算 favorites(${modId}) 失败`);
  assertOk(likes.error, `重算 likes(${modId}) 失败`);
  assertOk(ratings.error, `重算 ratings(${modId}) 失败`);

  const ratingCount = ratings.data.length;
  const ratingAverage = ratingCount
    ? Math.round((ratings.data.reduce((sum, row) => sum + row.score, 0) / ratingCount) * 100) / 100
    : 0;

  const { error } = await supabase
    .from("mods")
    .update({
      favorites_count: favorites.count ?? 0,
      likes_count: likes.count ?? 0,
      rating_count: ratingCount,
      rating_average: ratingAverage,
    })
    .eq("id", modId);
  assertOk(error, `更新 mods(${modId}) 计数器失败`);

  console.log(`mods ${modId}: 计数器已重算`);
}

// ==================== 主流程 ====================

async function main() {
  // 1. 定位两个账号
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assertOk(error, "查询用户失败");

  const adminUser = data.users.find((u) => u.email?.toLowerCase() === adminEmail);

  if (!adminUser) {
    throw new Error(`未找到管理员账号（email = ${adminEmail}）`);
  }

  const sourceUser = data.users.find((u) => u.id !== adminUser.id && PHONE_VARIANTS.includes(u.phone ?? ""));

  console.log(`管理员账号: ${adminUser.email} (id: ${adminUser.id})，当前 phone: ${adminUser.phone || "（未绑定）"}`);
  console.log(sourceUser ? `分身账号: id ${sourceUser.id}，phone ${sourceUser.phone}` : "分身账号: 不存在（跳过合并）");

  // 2-4. 合并分身账号
  if (sourceUser) {
    const sourceId = sourceUser.id;
    const targetId = adminUser.id;

    // 2. 无唯一约束的表：整体转移
    const movedMods = await supabase.from("mods").update({ created_by: targetId }).eq("created_by", sourceId).select("id");
    assertOk(movedMods.error, "迁移 mods.created_by 失败");
    console.log(`mods: 迁移 ${movedMods.data.length} 行`);

    const movedComments = await supabase.from("comments").update({ user_id: targetId }).eq("user_id", sourceId).select("id");
    assertOk(movedComments.error, "迁移 comments 失败");
    console.log(`comments: 迁移 ${movedComments.data.length} 行`);

    // 3. 有唯一约束的互动表：冲突跳过，记录受影响 mod 以便重算计数器
    const conflictedModIds = new Set([
      ...(await migrateEngagementTable("favorites", "mod_id", sourceId, targetId)),
      ...(await migrateEngagementTable("likes", "mod_id", sourceId, targetId)),
      ...(await migrateEngagementTable("ratings", "mod_id", sourceId, targetId)),
    ]);
    await migrateEngagementTable("comment_reactions", "comment_id", sourceId, targetId); // 无计数器，无需重算

    // 4. 删除分身（级联删 profiles 与残留冲突行）
    const deleted = await supabase.auth.admin.deleteUser(sourceId);
    assertOk(deleted.error, "删除分身账号失败");
    console.log(`分身账号 ${sourceId} 已删除（残留冲突行已级联清理）`);

    // 冲突行被级联删除后计数器会漂移，按真实行数重算
    for (const modId of conflictedModIds) {
      await recountMod(modId);
    }
  }

  // 5. 手机号绑定到管理员 auth 用户
  if (adminUser.phone === SUPABASE_PHONE) {
    console.log("auth 上已绑定该手机号，跳过 auth 更新。");
  } else {
    const updated = await supabase.auth.admin.updateUserById(adminUser.id, {
      phone: SUPABASE_PHONE,
      phone_confirm: true,
    });
    assertOk(updated.error, "auth 绑定手机号失败");
    console.log(`auth 绑定成功: phone = ${updated.data.user.phone}`);
  }

  // 6. 同步 profiles.phone
  const { error: profileError } = await supabase.from("profiles").update({ phone: SUPABASE_PHONE }).eq("id", adminUser.id);
  assertOk(profileError, "profiles 同步失败");

  // 回读验证
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("id, email, phone, role, display_name")
    .eq("id", adminUser.id)
    .single();
  assertOk(readError, "回读 profiles 失败");

  const { count: modCount } = await supabase.from("mods").select("id", { count: "exact", head: true }).eq("created_by", adminUser.id);

  console.log("profiles:", profile);
  console.log(`管理员名下 mods: ${modCount}`);
  console.log("✅ 合并 + 手机号绑定完成。此后手机号/邮箱登录命中同一个管理员账号。");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
