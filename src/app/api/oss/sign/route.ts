import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { hmacSha1Base64, utf8ToBase64 } from "@/lib/crypto";
import { buildOssObjectKey } from "@/lib/oss/path";
import {
  buildOssPublicUrl,
  buildOssUploadUrl,
  formatOssFileSize,
  getOssMaxUploadBytes,
  getOssUploadCategory,
  OSS_POLICY_EXPIRES_MS,
  OSS_UPLOAD_METHOD,
  sanitizeOssFilename,
} from "@/lib/oss/shared";
import { getServerOssEnv } from "@/lib/oss/server-config";

const requestSchema = z.object({
  character: z.string().trim().min(1, "请选择角色后再上传。"),
  contentType: z.string().trim().min(1, "缺少文件类型。"),
  fileSize: z.number().int().positive("缺少文件大小。"),
  filename: z.string().trim().min(1, "缺少文件名。"),
  modId: z.string().trim().min(1, "缺少上传标识。"),
});

async function buildFormDataFields({
  accessKeyId,
  bucket,
  contentType,
  maxFileSize,
  objectKey,
}: {
  accessKeyId: string;
  bucket: string;
  contentType: string;
  maxFileSize: number;
  objectKey: string;
}) {
  const expiration = new Date(Date.now() + OSS_POLICY_EXPIRES_MS).toISOString();
  const policy = {
    expiration,
    conditions: [
      { bucket },
      ["eq", "$key", objectKey],
      ["eq", "$Content-Type", contentType],
      ["content-length-range", 0, maxFileSize],
    ],
  };

  // Web Crypto API — 兼容 Node.js 和 Cloudflare Workers
  const encodedPolicy = utf8ToBase64(JSON.stringify(policy));
  const signature = await hmacSha1Base64(
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? "",
    encodedPolicy,
  );

  return {
    OSSAccessKeyId: accessKeyId,
    Signature: signature,
    key: objectKey,
    policy: encodedPolicy,
    success_action_status: "200",
    "Content-Type": contentType,
  };
}

export async function POST(request: Request) {
  await requireAdminUser("/admin/upload");

  const env = getServerOssEnv();

  if (!env) {
    console.error("[oss] missing env", {
      region: Boolean(process.env.ALIYUN_OSS_REGION?.trim()),
      bucket: Boolean(process.env.ALIYUN_OSS_BUCKET?.trim()),
      endpoint: Boolean(process.env.ALIYUN_OSS_ENDPOINT?.trim()),
      accessKeyId: Boolean(process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim()),
      accessKeySecret: Boolean(process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim()),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "missing_oss_env",
        debug: {
          region: Boolean(process.env.ALIYUN_OSS_REGION?.trim()),
          bucket: Boolean(process.env.ALIYUN_OSS_BUCKET?.trim()),
          endpoint: Boolean(process.env.ALIYUN_OSS_ENDPOINT?.trim()),
          accessKeyId: Boolean(process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim()),
          accessKeySecret: Boolean(process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim()),
        },
      },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "上传参数无效。" }, { status: 400 });
  }

  const { character, contentType, fileSize, filename, modId } = parsed.data;
  const uploadCategory = getOssUploadCategory(contentType);

  if (!uploadCategory) {
    return NextResponse.json({ ok: false, error: "当前仅支持 PNG/JPEG/WebP/GIF 图片和 ZIP 压缩包上传。" }, { status: 400 });
  }

  const maxFileSize = getOssMaxUploadBytes(uploadCategory);

  if (fileSize > maxFileSize) {
    return NextResponse.json({ ok: false, error: `${uploadCategory === "image" ? "图片" : "ZIP"}体积超过限制，当前最大允许 ${formatOssFileSize(maxFileSize)}。` }, { status: 400 });
  }

  const safeFilename = sanitizeOssFilename(filename);
  const objectKey = buildOssObjectKey({
    character,
    filename: safeFilename,
    modId,
  });

  return NextResponse.json({
    ok: true,
    method: OSS_UPLOAD_METHOD,
    maxFileSize,
    objectKey,
    publicUrl: buildOssPublicUrl({ bucket: env.bucket, endpoint: env.endpoint, objectKey }),
    uploadFields: await buildFormDataFields({
      accessKeyId: env.accessKeyId,
      bucket: env.bucket,
      contentType,
      maxFileSize,
      objectKey,
    }),
    uploadUrl: buildOssUploadUrl({ bucket: env.bucket, endpoint: env.endpoint }),
  });
}
