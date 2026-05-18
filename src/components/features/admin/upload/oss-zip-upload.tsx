"use client";

import { useState } from "react";
import { LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { OSS_MAX_ZIP_BYTES, OSS_UPLOAD_METHOD, OSS_ZIP_CONTENT_TYPES, formatOssFileSize } from "@/lib/oss/shared";

type OssZipUploadProps = {
  defaultCharacter: string;
  onUploaded: (url: string) => void;
};

type OssUploadResult = {
  ok?: boolean;
  error?: string;
  maxFileSize?: number;
  publicUrl?: string;
  uploadFields?: Record<string, string>;
  uploadUrl?: string;
  debug?: unknown;
  method?: string;
};

export function OssZipUpload({ defaultCharacter, onUploaded }: OssZipUploadProps) {
  const [uploadSeed, setUploadSeed] = useState(() => crypto.randomUUID());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");

  const uploadZipToOss = async (file: File) => {
    if (uploadStatus === "uploading") {
      return;
    }

    setUploadStatus("uploading");
    setUploadProgress(0);
    setUploadError("");

    try {
      const selectedCharacter = (document.querySelector('select[name="character"]') as HTMLSelectElement | null)?.value;
      const character = selectedCharacter || defaultCharacter || "unknown";
      const contentType = file.type || "application/zip";
      const signResponse = await fetch("/api/oss/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character,
          contentType,
          fileSize: file.size,
          filename: file.name,
          modId: uploadSeed,
        }),
      });

      const responseText = await signResponse.text();
      const signResult = responseText ? (JSON.parse(responseText) as OssUploadResult) : {};

      if (!signResponse.ok || !signResult.ok || !signResult.uploadUrl || !signResult.publicUrl) {
        const debugMessage = signResult.error === "missing_oss_env"
          ? `OSS 环境变量未配置完整：${JSON.stringify(signResult.debug ?? {})}`
          : signResult.error || "获取 OSS 上传签名失败。";

        throw new Error(debugMessage);
      }

      if ((signResult.method ?? OSS_UPLOAD_METHOD) !== OSS_UPLOAD_METHOD) {
        throw new Error("当前 ZIP 上传仅支持 OSS POST 表单直传。请检查签名接口返回。");
      }

      await new Promise<void>((resolve, reject) => {
        const uploadUrl = signResult.uploadUrl;

        if (!uploadUrl) {
          reject(new Error("缺少 OSS 上传地址。"));
          return;
        }

        const xhr = new XMLHttpRequest();
        xhr.open(OSS_UPLOAD_METHOD, uploadUrl);

        const formData = new FormData();
        Object.entries(signResult.uploadFields ?? {}).forEach(([key, value]) => {
          formData.append(key, value);
        });
        formData.append("file", file);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setUploadProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
        };

        xhr.onerror = () => {
          reject(new Error(`上传到 OSS 失败，请检查 CORS、Bucket 权限或网络连接。当前状态：${xhr.status || 0}`));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }

          reject(new Error(`上传失败，OSS 返回状态码 ${xhr.status}：${xhr.responseText || "无响应体"}`));
        };

        xhr.send(formData);
      });

      onUploaded(signResult.publicUrl);
      setUploadProgress(100);
      setUploadStatus("success");
      setUploadSeed(crypto.randomUUID());
      toast.success("ZIP 已上传到 OSS，下载地址已自动回填。", {
        description: "现在可以直接提交 MOD 表单。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ZIP 上传失败，请稍后再试。";
      setUploadStatus("error");
      setUploadError(message);
      toast.error("ZIP 上传失败", {
        description: message,
      });
    }
  };

  return (
    <div className="border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_#000]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-black">ZIP 上传到 OSS</p>
          <p className="mt-1 text-xs font-bold leading-6 text-black/70">
            支持进度条、错误提示，单个 ZIP 最大 {formatOssFileSize(OSS_MAX_ZIP_BYTES)}，上传完成后自动回填直链。
          </p>
        </div>
        <div className="relative inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] shadow-[6px_6px_0px_0px_#000]">
          {uploadStatus === "uploading" ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          <span>{uploadStatus === "uploading" ? "上传中" : "选择 ZIP"}</span>
          <input
            type="file"
            accept={`.zip,${OSS_ZIP_CONTENT_TYPES.join(",")}`}
            disabled={uploadStatus === "uploading"}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (!file || uploadStatus === "uploading") return;

              if (file.size > OSS_MAX_ZIP_BYTES) {
                const message = `ZIP ${file.name} 超过 ${formatOssFileSize(OSS_MAX_ZIP_BYTES)} 限制。`;
                setUploadStatus("error");
                setUploadError(message);
                toast.error("ZIP 上传失败", { description: message });
                return;
              }

              if (file.type && !OSS_ZIP_CONTENT_TYPES.includes(file.type as (typeof OSS_ZIP_CONTENT_TYPES)[number])) {
                const message = `ZIP ${file.name} 类型不受支持，请上传 .zip 文件。`;
                setUploadStatus("error");
                setUploadError(message);
                toast.error("ZIP 上传失败", { description: message });
                return;
              }

              uploadZipToOss(file);
            }}
          />
        </div>
      </div>
      <div className="mt-4 h-4 overflow-hidden border-4 border-black bg-[#fff8ef]">
        <div className="h-full bg-[#ff7a7a] transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
      </div>
      <div className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-black/75">
        {uploadStatus === "idle"
          ? "等待上传"
          : uploadStatus === "uploading"
            ? `上传进度 ${uploadProgress}%`
            : uploadStatus === "success"
              ? "上传完成，已回填直链"
              : "上传失败"}
      </div>
      {uploadError ? <p className="mt-3 text-sm font-black text-[#c1121f]">{uploadError}</p> : null}
    </div>
  );
}
