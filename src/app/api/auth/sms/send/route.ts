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
