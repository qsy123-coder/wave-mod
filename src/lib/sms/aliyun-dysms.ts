import "server-only";

import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { Config } from "@alicloud/openapi-client";
import { RuntimeOptions } from "@alicloud/tea-util";

export type AliyunDysmsConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  signName: string;
  templateCode: string;
};

export type AliyunDysmsSendResult = {
  bizId: string;
  requestId: string;
};

export function normalizeMainlandChinaPhoneForSms(phone: string) {
  const compact = phone.replace(/[\s-]/g, "").trim();

  if (/^1\d{10}$/.test(compact)) {
    return compact;
  }

  if (/^\+86(1\d{10})$/.test(compact)) {
    return compact.slice(3);
  }

  if (/^86(1\d{10})$/.test(compact)) {
    return compact.slice(2);
  }

  if (/^0086(1\d{10})$/.test(compact)) {
    return compact.slice(4);
  }

  return "";
}

export function getAliyunDysmsConfig(): AliyunDysmsConfig | null {
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
  const endpoint = process.env.ALIYUN_DYSMS_ENDPOINT || "dysmsapi.aliyuncs.com";
  const signName = process.env.ALIYUN_DYSMS_SIGN_NAME || process.env.ALIYUN_SMS_SIGN_NAME;
  const templateCode = process.env.ALIYUN_DYSMS_TEMPLATE_CODE || process.env.ALIYUN_SMS_TEMPLATE_CODE;

  if (!accessKeyId || !accessKeySecret || !endpoint || !signName || !templateCode) {
    return null;
  }

  return {
    accessKeyId,
    accessKeySecret,
    endpoint,
    signName,
    templateCode,
  };
}

function createAliyunDysmsClient(config: AliyunDysmsConfig) {
  return new Dysmsapi20170525(
    new Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: config.endpoint,
    }),
  );
}

export async function sendAliyunDysmsOtp(phone: string, otp: string) {
  const normalizedPhone = normalizeMainlandChinaPhoneForSms(phone);
  const normalizedOtp = otp.replace(/\s/g, "").trim();

  if (!normalizedPhone) {
    throw new Error("请输入中国大陆手机号，支持 11 位手机号、+86、86 或 0086 格式。");
  }

  if (!/^\d{4,8}$/.test(normalizedOtp)) {
    throw new Error("Supabase Send SMS Hook 提供的验证码格式不正确。");
  }

  const config = getAliyunDysmsConfig();

  if (!config) {
    throw new Error("阿里云普通短信配置未完整设置，请检查 AccessKey、签名、模板和 endpoint。");
  }

  const client = createAliyunDysmsClient(config);
  const request = new SendSmsRequest({
    phoneNumbers: normalizedPhone,
    signName: config.signName,
    templateCode: config.templateCode,
    templateParam: JSON.stringify({ code: normalizedOtp }),
  });
  const response = await client.sendSmsWithOptions(request, new RuntimeOptions({}));
  const body = response.body;

  if (body?.code !== "OK") {
    throw new Error(body?.message || body?.code || "阿里云普通短信发送失败。");
  }

  return {
    bizId: body.bizId || "",
    requestId: body.requestId || "",
  } satisfies AliyunDysmsSendResult;
}
