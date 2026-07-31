import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { buildCosObjectKey, buildCosPublicUrl, COS_STS_DURATION_SECONDS } from "@/lib/cos/shared";
import { getServerCosEnv } from "@/lib/cos/server-config";

const requestSchema = z.object({
  character: z.string().trim().min(1, "请选择角色后再上传。"),
  contentType: z.string().trim().min(1, "缺少文件类型。"),
  fileSize: z.number().int().positive("缺少文件大小。"),
  filename: z.string().trim().min(1, "缺少文件名。"),
  modId: z.string().trim().min(1, "缺少上传标识。"),
});

function buildStsPolicy(appId: string, bucket: string, region: string, objectKey: string) {
  return {
    version: "2.0",
    statement: [
      {
        effect: "allow",
        action: ["name/cos:PutObject"],
        resource: [`qcs::cos:${region}:uid/${appId}:${bucket}/${objectKey}`],
      },
    ],
  };
}

/** 从 bucket 名称中提取 AppId（格式：{name}-{appid}，如 my-bucket-1250000000） */
function extractAppId(bucket: string): string {
  const match = bucket.match(/-(\d{10,})$/);
  if (!match) {
    throw new Error(`无法从 bucket 名称 "${bucket}" 中提取 AppId，预期格式：{name}-{appid}`);
  }
  return match[1];
}

export async function POST(request: Request) {
  await requireAdminUser("/admin/upload");

  const env = getServerCosEnv();

  if (!env) {
    console.error("[cos] missing env", {
      secretId: Boolean(process.env.COS_SECRET_ID?.trim()),
      secretKey: Boolean(process.env.COS_SECRET_KEY?.trim()),
      bucket: Boolean(process.env.COS_BUCKET?.trim()),
      region: Boolean(process.env.COS_REGION?.trim()),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "missing_cos_env",
        debug: {
          secretId: Boolean(process.env.COS_SECRET_ID?.trim()),
          secretKey: Boolean(process.env.COS_SECRET_KEY?.trim()),
          bucket: Boolean(process.env.COS_BUCKET?.trim()),
          region: Boolean(process.env.COS_REGION?.trim()),
        },
      },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "上传参数无效。" },
      { status: 400 },
    );
  }

  const { character, contentType, fileSize, filename, modId } = parsed.data;

  // 仅支持图片类型
  const isImage = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType.trim().toLowerCase());
  if (!isImage) {
    return NextResponse.json(
      { ok: false, error: "COS 仅支持 PNG/JPEG/WebP/GIF 图片上传。" },
      { status: 400 },
    );
  }

  const appId = extractAppId(env.bucket);
  const objectKey = buildCosObjectKey({ character, modId, filename });

  const policy = buildStsPolicy(appId, env.bucket, env.region, objectKey);

  // 动态导入 ESM STS 客户端避免 Turbopack 解析问题
  const { sts } = await import("tencentcloud-sdk-nodejs-sts");

  const StsClient = sts.v20180813.Client;

  const client = new StsClient({
    credential: {
      secretId: env.secretId,
      secretKey: env.secretKey,
    },
    region: env.region,
    profile: {
      httpProfile: { endpoint: "sts.tencentcloudapi.com" },
    },
  });

  try {
    const result = await client.GetFederationToken({
      Name: `cos-upload-${modId}`,
      Policy: JSON.stringify(policy),
      DurationSeconds: COS_STS_DURATION_SECONDS,
    });

    const credentials = result.Credentials!;
    const expiredTime = result.ExpiredTime!;

    // 将 Unix 时间戳转换为秒
    const expiredTimestamp = Math.floor(new Date(expiredTime).getTime() / 1000);
    const startTimestamp = Math.floor(Date.now() / 1000);

    return NextResponse.json({
      ok: true,
      objectKey,
      publicUrl: buildCosPublicUrl({ bucket: env.bucket, region: env.region, objectKey }),
      bucket: env.bucket,
      region: env.region,
      credentials: {
        tmpSecretId: credentials.TmpSecretId!,
        tmpSecretKey: credentials.TmpSecretKey!,
        sessionToken: credentials.Token!,
        startTime: startTimestamp,
        expiredTime: expiredTimestamp,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取 COS 临时密钥失败";
    console.error("[cos] STS error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
