import "server-only";

import Dypnsapi20170525, {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from "@alicloud/dypnsapi20170525";
import Credential from "@alicloud/credentials";
import { Config } from "@alicloud/openapi-client";
import { RuntimeOptions } from "@alicloud/tea-util";

export type AliyunDypnsConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  signName: string;
  templateCode: string;
};

export type AliyunDypnsSendResult = {
  bizId: string;
  requestId: string;
};

export function normalizeMainlandChinaPhone(phone: string) {
  const compact = phone.replace(/[\s-]/g, "").trim();

  if (/^1\d{10}$/.test(compact)) {
    return compact;
  }

  if (/^\+86(1\d{10})$/.test(compact)) {
    return compact.slice(3);
  }

  return "";
}

export function getAliyunDypnsConfig(): AliyunDypnsConfig | null {
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
  const endpoint = process.env.ALIYUN_DYPNS_ENDPOINT || process.env.ALIYUN_SMS_ENDPOINT || "dypnsapi.aliyuncs.com";
  const signName = process.env.ALIYUN_DYPNS_SIGN_NAME || process.env.ALIYUN_SMS_SIGN_NAME;
  const templateCode = process.env.ALIYUN_DYPNS_TEMPLATE_CODE || process.env.ALIYUN_SMS_TEMPLATE_CODE;

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

function createAliyunDypnsClient(config: AliyunDypnsConfig) {
  const credential = new Credential();

  return new Dypnsapi20170525(
    new Config({
      credential,
      endpoint: config.endpoint,
    }),
  );
}

export async function sendAliyunDypnsVerifyCode(phone: string, min = "5") {
  const normalizedPhone = normalizeMainlandChinaPhone(phone);

  if (!normalizedPhone) {
    throw new Error("请输入中国大陆手机号，支持 11 位手机号或 +86 格式。");
  }

  const config = getAliyunDypnsConfig();

  if (!config) {
    throw new Error("阿里云短信配置未完整设置，请检查 AccessKey、签名、模板和 endpoint。");
  }

  const client = createAliyunDypnsClient(config);
  const request = new SendSmsVerifyCodeRequest({
    phoneNumber: normalizedPhone,
    signName: config.signName,
    templateCode: config.templateCode,
    templateParam: JSON.stringify({ code: "##code##", min }),
  });
  const response = await client.sendSmsVerifyCodeWithOptions(request, new RuntimeOptions({}));
  const body = response.body;

  if (!body?.success || body.code !== "OK" || !body.model?.bizId) {
    throw new Error(body?.message || body?.code || "阿里云短信验证码发送失败。");
  }

  return {
    bizId: body.model.bizId,
    requestId: body.model.requestId || body.requestId || "",
  } satisfies AliyunDypnsSendResult;
}

export async function verifyAliyunDypnsCode(phone: string, smsCode: string) {
  const normalizedPhone = normalizeMainlandChinaPhone(phone);
  const normalizedCode = smsCode.replace(/\s/g, "").trim();

  if (!normalizedPhone) {
    throw new Error("请输入中国大陆手机号，支持 11 位手机号或 +86 格式。");
  }

  if (!/^\d{4,8}$/.test(normalizedCode)) {
    throw new Error("请输入正确的短信验证码。");
  }

  const config = getAliyunDypnsConfig();

  if (!config) {
    throw new Error("阿里云短信配置未完整设置，请检查 AccessKey、签名、模板和 endpoint。");
  }

  const client = createAliyunDypnsClient(config);
  const request = new CheckSmsVerifyCodeRequest({
    phoneNumber: normalizedPhone,
    verifyCode: normalizedCode,
  });
  const response = await client.checkSmsVerifyCodeWithOptions(request, new RuntimeOptions({}));
  const body = response.body;

  if (!body?.success || body.code !== "OK" || body.model?.verifyResult !== "PASS") {
    throw new Error(body?.message || body?.code || "阿里云短信验证码校验失败。");
  }

  return true;
}
