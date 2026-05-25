import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";

import { logger } from "@/lib/logger";
import { sendAliyunDysmsOtp } from "@/lib/sms/aliyun-dysms";

type SupabaseSendSmsPayload = {
  user?: {
    phone?: string;
  };
  sms?: {
    otp?: string;
  };
};

function getSmsHookSecret() {
  return process.env.SUPABASE_SEND_SMS_HOOK_SECRET?.trim() || "";
}

function hasAliyunAccessKey() {
  return Boolean(
    (process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) ||
      (process.env.ALIYUN_OSS_ACCESS_KEY_ID && process.env.ALIYUN_OSS_ACCESS_KEY_SECRET),
  );
}

function getDysmsTemplateCode() {
  return process.env.ALIYUN_DYSMS_TEMPLATE_CODE || process.env.ALIYUN_SMS_TEMPLATE_CODE || "";
}

function getDysmsTemplateSource() {
  if (process.env.ALIYUN_DYSMS_TEMPLATE_CODE) {
    return "ALIYUN_DYSMS_TEMPLATE_CODE";
  }

  if (process.env.ALIYUN_SMS_TEMPLATE_CODE) {
    return "ALIYUN_SMS_TEMPLATE_CODE";
  }

  return "missing";
}

function maskConfigValue(value: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 6) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

async function verifySupabaseSendSmsWebhook(request: Request, payloadText: string) {
  const secret = getSmsHookSecret();

  if (!secret) {
    throw new Error("missing_sms_hook_secret");
  }

  const base64Secret = secret.startsWith("v1,whsec_") ? secret.replace("v1,whsec_", "") : secret;
  const webhook = new Webhook(base64Secret);
  const headers = Object.fromEntries(request.headers.entries());

  return webhook.verify(payloadText, headers) as SupabaseSendSmsPayload;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    checks: {
      hookSecret: Boolean(getSmsHookSecret()),
      aliyunAccessKey: hasAliyunAccessKey(),
      dysmsEndpoint: Boolean(process.env.ALIYUN_DYSMS_ENDPOINT || "dysmsapi.aliyuncs.com"),
      dysmsSignName: Boolean(process.env.ALIYUN_DYSMS_SIGN_NAME || process.env.ALIYUN_SMS_SIGN_NAME),
      dysmsTemplateCode: Boolean(getDysmsTemplateCode()),
      dysmsTemplateSource: getDysmsTemplateSource(),
      dysmsTemplatePreview: maskConfigValue(getDysmsTemplateCode()),
      dysmsTemplateLooksStandard: /^SMS_/.test(getDysmsTemplateCode()),
      phoneOtpEnabled: process.env.ENABLE_SUPABASE_PHONE_OTP === "true",
    },
  });
}

export async function POST(request: Request) {
  let payload: SupabaseSendSmsPayload;

  try {
    const payloadText = await request.text();
    payload = await verifySupabaseSendSmsWebhook(request, payloadText);
  } catch (error) {
    logger.warn("[sms] Supabase Send SMS Hook verification failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });

    return NextResponse.json(
      {
        error: {
          http_code: 401,
          message: "SMS hook verification failed.",
        },
      },
      { status: 401 },
    );
  }

  const phone = payload.user?.phone ?? "";
  const otp = payload.sms?.otp ?? "";

  if (!phone || !otp) {
    return NextResponse.json(
      {
        error: {
          http_code: 400,
          message: "Invalid Send SMS Hook payload.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await sendAliyunDysmsOtp(phone, otp);

    logger.info("[sms] Aliyun Dysms OTP sent", {
      bizId: result.bizId,
      requestId: result.requestId,
    });

    return NextResponse.json({});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Aliyun SMS send failed.";

    logger.error("[sms] Aliyun Dysms OTP failed", { message });

    return NextResponse.json(
      {
        error: {
          http_code: 500,
          message,
        },
      },
      { status: 500 },
    );
  }
}
