"use client";

import { useEffect, useRef, useState } from "react";

const COS_TEST_URL =
  "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/chun/be5629a9-b88f-4c2a-95d0-e2a83067719a/preview.webp";

export function DebugCosTest() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      console.log("[DebugCosTest] COS直链加载成功");
      setStatus("ok");
    };
    const onError = () => {
      const msg = `naturalWidth=${img.naturalWidth} complete=${img.complete} src=${img.src}`;
      console.error("[DebugCosTest] COS直链加载失败", msg);
      setStatus("error");
      setErrorMsg(msg);
    };
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    // 如果图片已在缓存中，complete 为 true 且 naturalWidth > 0
    if (img.complete && img.naturalWidth > 0) {
      console.log("[DebugCosTest] COS直链从缓存加载成功");
      setStatus("ok");
    } else if (img.complete && img.naturalWidth === 0) {
      console.error("[DebugCosTest] COS直链 complete=true 但 naturalWidth=0（加载失败）");
      setStatus("error");
    }
    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 4,
        right: 4,
        zIndex: 99999,
        background: "white",
        border: "3px solid black",
        padding: 6,
        fontSize: 10,
        fontFamily: "monospace",
        maxWidth: 320,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 4 }}>COS 直连测试</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={COS_TEST_URL}
        alt=""
        style={{ width: 48, height: 48, border: `3px solid ${status === "ok" ? "green" : status === "error" ? "red" : "orange"}` }}
      />
      <div style={{ marginTop: 4 }}>
        状态:{" "}
        <span style={{ color: status === "ok" ? "green" : status === "error" ? "red" : "orange", fontWeight: 900 }}>
          {status === "ok" ? "✅ 正常" : status === "error" ? "❌ 失败" : "⏳ 加载中..."}
        </span>
      </div>
      {errorMsg ? <div style={{ color: "red", wordBreak: "break-all" }}>{errorMsg}</div> : null}
    </div>
  );
}
