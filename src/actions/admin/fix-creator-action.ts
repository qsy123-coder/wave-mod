"use server";

import { revalidatePath } from "next/cache";

import { queryOne, queryRows } from "@/lib/db/query";
import { revalidateCreatorProfileCache } from "@/lib/mod-cache";

export type FixCreatorResult = {
  fixed: number;
  error: string;
};

/**
 * 批量补齐所有 created_by 为 NULL 的 MOD。
 *
 * 登录已下线，不再有「当前管理员用户」；改为关联到库里第一个 `role = 'admin'`
 * 的 profiles 记录（历史数据，归档保留）。找不到时不猜、不写。
 */
export async function fixMissingCreatedByAction(): Promise<FixCreatorResult> {
  const adminProfile = await queryOne<{ id: string }>(
    "select id from public.profiles where role = 'admin' order by created_at asc limit 1",
  );

  if (!adminProfile) {
    return { fixed: 0, error: "库中没有 role=admin 的 profiles 记录，无法确定归属。" };
  }

  try {
    const rows = await queryRows<{ id: string }>(
      "update public.mods set created_by = $1 where created_by is null returning id",
      [adminProfile.id],
    );

    if (rows.length === 0) {
      return { fixed: 0, error: "" };
    }

    revalidateCreatorProfileCache(adminProfile.id);
    revalidatePath("/admin/mods");
    revalidatePath("/", "layout");

    return { fixed: rows.length, error: "" };
  } catch (error) {
    return { fixed: 0, error: `更新失败：${error instanceof Error ? error.message : "未知错误"}` };
  }
}
