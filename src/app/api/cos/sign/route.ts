import { NextResponse } from "next/server";

import { requireAdminUser } from "@/actions/auth/auth-actions";
import { buildCosObjectKey, buildCosPublicUrl, buildTutorialObjectKey, COS_STS_DURATION_SECONDS } from "@/lib/cos/shared";
import { getServerCosEnv } from "@/lib/cos/server-config";

const requestSchema = {
  safeParse(data: unknown) {
    if (!data || typeof data !== "object") return { success: false as const, error: "无效请求体" };
    const d = data as Record<string, unknown>;
    const issues: string[] = [];
    const prefix = (typeof d.prefix === "string" ? d.prefix.trim() : "") || "mods";
    const character = typeof d.character === "string" ? d.character.trim() : "";
    const chapterKey = typeof d.chapterKey === "string" ? d.chapterKey.trim() : "";
    const contentType = typeof d.contentType === "string" ? d.contentType.trim() : "";
    const fileSize = typeof d.fileSize === "number" ? d.fileSize : 0;
    const filename = typeof d.filename === "string" ? d.filename.trim() : "";
    const modId = typeof d.modId === "string" ? d.modId.trim() : "";

    if (!["mods", "tutorial"].includes(prefix)) issues.push("prefix 必须为 mods 或 tutorial。");
    if (prefix === "mods" && !character) issues.push("请选择角色后再上传。");
    if (prefix === "tutorial" && !chapterKey) issues.push("缺少章节标识。");
    if (!contentType) issues.push("缺少文件类型。");
    if (!fileSize) issues.push("缺少文件大小。");
    if (!filename) issues.push("缺少文件名。");
    if (!modId) issues.push("缺少上传标识。");
    if (issues.length > 0) return { success: false as const, error: issues[0] };

    return { success: true as const, data: { prefix, character, chapterKey, contentType, fileSize, filename, modId } };
  },
};

/** 发送 TC3-HMAC-SHA256 签名的请求到腾讯云 STS API */
async function callStsApi(
  crypto: typeof import("node:crypto"),
  secretId: string,
  secretKey: string,
  region: string,
  actionParams: Record<string, unknown>,
) {
  const service = "sts";
  const host = "sts.tencentcloudapi.com";
  const algorithm = "TC3-HMAC-SHA256";

  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const payload = JSON.stringify(actionParams);
  const ct = "application/json; charset=utf-8";

  // Step 1: 构造规范请求
  const canonicalHeaders = `content-type:${ct}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = crypto.createHash("sha256").update(payload).digest("hex");
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;

  // Step 2: 构造待签名字符串
  const hashedCanonical = crypto.createHash("sha256").update(canonicalRequest).digest("hex");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonical}`;

  // Step 3: 计算签名
  const kDate = crypto.createHmac("sha256", `TC3${secretKey}`).update(date).digest();
  const kService = crypto.createHmac("sha256", kDate).update(service).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("tc3_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Step 4: 发送请求
  const res = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Content-Type": ct,
      "X-TC-Action": "GetFederationToken",
      "X-TC-Version": "2018-08-13",
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": region,
      Authorization: authorization,
    },
    body: payload,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[cos] STS API error:", text);
    throw new Error(`STS API 返回 ${res.status}`);
  }

  return res.json();
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
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { prefix, character, chapterKey, contentType, fileSize, filename, modId } = parsed.data;

  const isImage = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
    contentType.trim().toLowerCase(),
  );
  const isVideo =
    prefix === "tutorial" &&
    ["video/mp4", "video/webm", "video/x-matroska", "video/quicktime"].includes(
      contentType.trim().toLowerCase(),
    );
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { ok: false, error: prefix === "tutorial"
        ? "仅支持 PNG/JPEG/WebP/GIF 图片和 MP4/WebM/MKV/MOV 视频上传。"
        : "COS 仅支持 PNG/JPEG/WebP/GIF 图片上传。" },
      { status: 400 },
    );
  }

  const objectKey =
    prefix === "tutorial"
      ? buildTutorialObjectKey({ chapterKey, modId, filename })
      : buildCosObjectKey({ character, modId, filename });

  // 从 bucket 名称提取 appId（格式 {name}-{appid}）
  const match = env.bucket.match(/-(\d{10,})$/);
  const appId = match ? match[1] : "";

  // STS 权限策略：仅允许上传到指定对象
  const policyObj = {
    version: "2.0",
    statement: [
      {
        effect: "allow",
        action: ["name/cos:PutObject"],
        resource: [`qcs::cos:${env.region}:uid/${appId}:${env.bucket}/${objectKey}`],
      },
    ],
  };

  try {
    const crypto = await import("node:crypto");

    const result = await callStsApi(crypto, env.secretId, env.secretKey, env.region, {
      Name: `cos-upload-${modId}-${Date.now()}`,
      Policy: JSON.stringify(policyObj),
      DurationSeconds: COS_STS_DURATION_SECONDS,
    });

    const response = result?.Response;
    if (response?.Error) {
      return NextResponse.json(
        { ok: false, error: response.Error.Message as string },
        { status: 500 },
      );
    }

    const credentials = response?.Credentials;
    const expiredTime = response?.ExpiredTime;
    if (!credentials || !expiredTime) {
      return NextResponse.json({ ok: false, error: "STS 返回数据不完整" }, { status: 500 });
    }

    const expiredTimestamp = Math.floor(expiredTime as number);
    const startTimestamp = Math.floor(Date.now() / 1000);

    return NextResponse.json({
      ok: true,
      objectKey,
      publicUrl: buildCosPublicUrl({ bucket: env.bucket, region: env.region, objectKey }),
      bucket: env.bucket,
      region: env.region,
      credentials: {
        tmpSecretId: credentials.TmpSecretId,
        tmpSecretKey: credentials.TmpSecretKey,
        sessionToken: credentials.Token,
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
