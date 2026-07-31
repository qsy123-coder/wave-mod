"use client";

import { useEffect, useState } from "react";

/**
 * 诊断组件：用普通 <img> 标签直接加载 COS 图片，
 * 绕过 Next.js <Image> 组件，显示成功/失败状态。
 * 部署后可用手机直接看到诊断结果。
 */
export function DiagBanner() {
  const [results, setResults] = useState<Array<{ url: string; status: string }>>([]);

  useEffect(() => {
    // 取当前页面可见的 MOD 图片 URL，或者用占位测试
    const imgs = document.querySelectorAll("img[src*='myqcloud'], img[src*='aliyuncs'], img[src*='supabase']");
    const urls = Array.from(imgs).map((img) => (img as HTMLImageElement).src).slice(0, 3);

    if (urls.length === 0) {
      // 页面没有可见图片，说明 Next.js <Image> 根本没生成 <img>
      setResults([{ url: "NO_IMG_TAGS_FOUND", status: "NO_IMG" }]);
      return;
    }

    const testResults = urls.map((url) => {
      const img = new Image();
      img.src = url;
      const result = { url, status: "loading" };
      img.onload = () => {
        setResults((prev) => prev.map((r) => (r.url === url ? { ...r, status: "OK" } : r)));
      };
      img.onerror = () => {
        setResults((prev) => prev.map((r) => (r.url === url ? { ...r, status: "FAIL" } : r)));
      };
      return result;
    });
    setResults(testResults);
  }, []);

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99999,
      background: "#000", color: "#0f0", fontSize: "10px", fontFamily: "monospace",
      padding: "4px 8px", maxHeight: "30vh", overflow: "auto", borderTop: "2px solid #333",
    }}>
      <b>DIAG</b>{" "}
      {results.length === 0 && "scanning..."}
      {results.map((r, i) => (
        <div key={i} style={{ color: r.status === "OK" ? "#0f0" : r.status === "FAIL" ? "#f00" : r.status === "NO_IMG" ? "#ff0" : "#888", wordBreak: "break-all", marginTop: 2 }}>
          [{r.status}] {r.url.slice(0, 80)}...
        </div>
      ))}
    </div>
  );
}
