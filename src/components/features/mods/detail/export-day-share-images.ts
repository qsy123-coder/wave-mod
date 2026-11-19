import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { downloadBlob } from "@/lib/download";
import { buildZipFileName, sanitizeFileName } from "@/lib/share-export-filename";
import type { SiteMod } from "@/lib/mods-domain/types";
import { buildModShareUrl } from "@/lib/mod-share";
import { getSiteUrl } from "@/lib/site-url";

import { ShareModCardContent } from "./share-mod-card";

export type ExportDayResult = { ok: number; failed: number };

/** 离屏渲染主机的固定参考宽度 = 分享面板的 max-w-xl（576px），保证批量图与面板同宽 */
const HOST_WIDTH_PX = 576;

/** 封面加载等待上限：单张图慢/失败时不无限挂起，超时按「能截多少截多少」继续 */
const IMAGE_WAIT_TIMEOUT_MS = 8000;

/**
 * 把某一天的全部 mod 逐张渲染成分享面板 PNG，打进一个 zip 下载。
 *
 * 纯浏览器完成：不落库、不上传。渲染复用 `ShareModCardContent`（与详情页对话框
 * 同一套视觉），在离屏容器里一次渲染 N 张，等所有封面加载完再逐张 `toPng` 截图，
 * 最后用 jszip 打包成一个 `每日更新-YYYY.M.D.zip`。
 *
 * 单张截图失败（封面跨域 / 画布异常）跳过并计数，不中断整批。
 */
export async function exportDayShareImages(mods: SiteMod[], dateKey: string): Promise<ExportDayResult> {
  const [{ toPng }, { default: JSZip }] = await Promise.all([
    import("html-to-image"),
    import("jszip"),
  ]);

  const host = document.createElement("div");
  // 离屏但保持布局（不能 display:none，否则 html-to-image 拿不到尺寸）
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${HOST_WIDTH_PX}px;`;
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);

  const root = createRoot(host);
  const nodes = new Map<number, HTMLDivElement>();

  root.render(
    createElement(
      "div",
      { className: "space-y-6" },
      mods.map((mod, index) =>
        createElement(ShareModCardContent, {
          key: mod.id,
          url: buildModShareUrl(getSiteUrl(), mod.id),
          title: mod.title,
          imageUrl: mod.images[0] ?? mod.coverImage,
          coverPriority: true,
          ref: (node: HTMLDivElement | null) => {
            if (node) nodes.set(index, node);
          },
        }),
      ),
    ),
  );

  try {
    await waitForImages(host, IMAGE_WAIT_TIMEOUT_MS);

    const zip = new JSZip();
    let ok = 0;
    let failed = 0;
    const usedNames = new Set<string>();

    for (let index = 0; index < mods.length; index++) {
      const mod = mods[index];
      const node = nodes.get(index);
      if (!node) {
        failed++;
        continue;
      }

      try {
        const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#fff8ef" });
        const base = sanitizeFileName(`${mod.character}-${mod.title}`);
        let name = `${base}.png`;
        let seq = 1;
        while (usedNames.has(name)) name = `${base}-${seq++}.png`;
        usedNames.add(name);
        zip.file(name, dataUrl.split(",")[1], { base64: true });
        ok++;
      } catch {
        failed++;
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, buildZipFileName(dateKey));
    return { ok, failed };
  } finally {
    root.unmount();
    host.remove();
  }
}

/** 等容器内所有 <img> 加载完（或超时/失败）。二维码是内联 SVG、随挂载同步出，无需等。 */
function waitForImages(container: HTMLElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const images = Array.from(container.querySelectorAll("img"));
    const pending = new Set(images.filter((img) => !img.complete));
    if (pending.size === 0) {
      resolve();
      return;
    }

    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      resolve();
    }

    for (const img of pending) {
      img.addEventListener("load", () => {
        pending.delete(img);
        if (pending.size === 0) finish();
      }, { once: true });
      img.addEventListener("error", () => {
        pending.delete(img);
        if (pending.size === 0) finish();
      }, { once: true });
    }
  });
}
