"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePublicModCaches } from "@/lib/mod-cache";
import { createClient, ensureProfile, getCurrentUser } from "@/lib/supabase/server";

const ratingSchema = z.object({
  modId: z.uuid("无效的 MOD ID。"),
  score: z.coerce.number().int().min(1, "评分最低为 1 分。").max(5, "评分最高为 5 分。"),
});

type RatingRow = {
  score: number;
};

async function syncRatingAggregate(modId: string) {
  const supabaseAdmin = createAdminClient();

  if (!supabaseAdmin) {
    throw new Error("服务端缺少 Supabase Service Role Key，暂时无法同步评分数据。");
  }

  const { data, error } = await supabaseAdmin
    .from("ratings")
    .select("score")
    .eq("mod_id", modId);

  if (error) {
    throw new Error(`读取评分失败：${error.message}`);
  }

  const rows = (data ?? []) as RatingRow[];
  const ratingCount = rows.length;
  const ratingAverage = ratingCount === 0 ? 0 : Number((rows.reduce((sum, row) => sum + row.score, 0) / ratingCount).toFixed(2));

  const { error: updateError } = await supabaseAdmin
    .from("mods")
    .update({
      rating_count: ratingCount,
      rating_average: ratingAverage,
    })
    .eq("id", modId);

  if (updateError) {
    throw new Error(`更新评分聚合失败：${updateError.message}`);
  }
}

export async function rateModAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("请先登录后再评分。");
  }

  await ensureProfile();

  const parsed = ratingSchema.safeParse({
    modId: String(formData.get("modId") ?? ""),
    score: formData.get("score"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "评分参数无效。");
  }

  const supabase = await createClient();
  const { modId, score } = parsed.data;

  const { error } = await supabase.from("ratings").upsert(
    {
      mod_id: modId,
      user_id: user.id,
      score,
    },
    { onConflict: "user_id,mod_id" },
  );

  if (error) {
    throw new Error(`评分失败：${error.message}`);
  }

  await syncRatingAggregate(modId);

  revalidatePublicModCaches(modId);
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/");
  revalidatePath("/mods");
  revalidatePath("/favorites");
}
