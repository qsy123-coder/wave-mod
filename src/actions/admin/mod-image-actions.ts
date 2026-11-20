"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isCosStorageUrl } from "@/lib/cos/shared";
import { execute, queryOne } from "@/lib/db/query";
import { logger } from "@/lib/logger";
import { revalidatePublicModCaches } from "@/lib/mod-cache";

const replaceImageSchema = z.object({
  modId: z.uuid("无效的 MOD ID"),
  imageIndex: z.number().int().min(0).max(19),
  imageUrl: z.url("图片地址格式不正确"),
});

const replaceVariantImageSchema = z.object({
  modId: z.uuid("无效的 MOD ID"),
  variant: z.string().min(1, "缺少变体名"),
  imageIndex: z.number().int().min(0).max(19),
  imageUrl: z.url("图片地址格式不正确"),
});

export type ReplaceModImageResult = {
  ok: boolean;
  error?: string;
  images?: string[];
};

/**
 * 把某条 mod 的 images[index] 换成新的 COS 图片地址。
 * 只允许 COS 公开地址，避免后台把任意 URL 写进库。
 */
export async function replaceModImageAction(input: unknown): Promise<ReplaceModImageResult> {
  const parsed = replaceImageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数无效" };
  }

  const { modId, imageIndex, imageUrl } = parsed.data;

  if (!isCosStorageUrl(imageUrl)) {
    return { ok: false, error: "只允许写入腾讯云 COS 图片地址" };
  }

  try {
    const row = await queryOne<{ images: string[] | null }>(
      "select images from public.mods where id = $1",
      [modId],
    );

    if (!row) {
      return { ok: false, error: "MOD 不存在" };
    }

    const images = [...(row.images ?? [])];

    if (imageIndex > images.length) {
      return { ok: false, error: "图片序号超出范围" };
    }

    if (imageIndex === images.length) {
      images.push(imageUrl);
    } else {
      images[imageIndex] = imageUrl;
    }

    await execute(
      "update public.mods set images = $1::text[], updated_at = now() where id = $2",
      [images, modId],
    );

    revalidatePublicModCaches(modId);
    revalidatePath("/admin/mods");

    return { ok: true, images };
  } catch (error) {
    logger.error("[admin] replaceModImage failed", {
      modId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      error: `更新图片失败：${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * 把某条 mod 的 `variant_images[variant][imageIndex]` 换成新的 COS 图片地址。
 *
 * 同帖多变体合并卡（见 .mod-groups.json 变体合并）的图存在 `variant_images`，
 * 不在 `images`；后台预览图打码要能覆盖每个变体自己的图，就需要这条动作。
 * 只允许 COS 公开地址，避免后台把任意 URL 写进库。
 */
export async function replaceVariantImageAction(input: unknown): Promise<ReplaceModImageResult> {
  const parsed = replaceVariantImageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数无效" };
  }

  const { modId, variant, imageIndex, imageUrl } = parsed.data;

  if (!isCosStorageUrl(imageUrl)) {
    return { ok: false, error: "只允许写入腾讯云 COS 图片地址" };
  }

  try {
    const row = await queryOne<{ variant_images: Record<string, string[]> | null }>(
      "select variant_images from public.mods where id = $1",
      [modId],
    );

    if (!row) {
      return { ok: false, error: "MOD 不存在" };
    }

    const variantImages: Record<string, string[]> = { ...(row.variant_images ?? {}) };
    const images = [...(variantImages[variant] ?? [])];

    if (imageIndex > images.length) {
      return { ok: false, error: "图片序号超出范围" };
    }

    if (imageIndex === images.length) {
      images.push(imageUrl);
    } else {
      images[imageIndex] = imageUrl;
    }
    variantImages[variant] = images;

    await execute(
      "update public.mods set variant_images = $1::jsonb, updated_at = now() where id = $2",
      [JSON.stringify(variantImages), modId],
    );

    revalidatePublicModCaches(modId);
    revalidatePath("/admin/mods");

    return { ok: true, images };
  } catch (error) {
    logger.error("[admin] replaceVariantImage failed", {
      modId,
      variant,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      error: `更新变体图片失败：${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}
