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

/** 就绪轮询间隔与上限：等「refs 齐 + 封面加载完 + 二维码挂载完」，超时按能截多少截多少 */
const READY_POLL_MS = 60;
const READY_TIMEOUT_MS = 10000;

/**
 * 把某一天的全部 mod 逐张渲染成分享面板 PNG，打进一个 zip 下载。
 *
 * 纯浏览器完成：不落库、不上传。渲染复用 `ShareModCardContent`（与详情页对话框
 * 同一套视觉），在离屏容器里一次渲染 N 张，等全部就绪后逐张 `toPng` 截图，
 * 最后用 jszip 打包成一个 `每日更新-YYYY.M.D.zip`。
 *
 * 单张截图失败（封面加载失败 / 画布异常）跳过并计数，不中断整批；
 * 全部失败则抛错（由调用方 toast），**不**下载一个空 zip。
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

  // ⚠️ createRoot 的初次渲染是**异步提交**的：紧接着读 refs / querySelectorAll
  // 会拿到空结果，导致每张都 failed → 空 zip（2026-11-19 上线后复现）。
  // 所以 render 完先轮询等就绪，再截图。
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
    await waitForCardsReady(host, nodes, mods.length, READY_TIMEOUT_MS);

    if (nodes.size === 0) {
      throw new Error("分享卡片渲染失败");
    }

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
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          backgroundColor: "#fff8ef",
          // 卡片只用系统字体（system-ui / Microsoft YaHei），无需内嵌 webfont，
          // 跳过字体嵌入省时间也规避字体 fetch 失败
          skipFonts: true,
        });
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

    if (ok === 0) {
      throw new Error("全部分享图导出失败");
    }

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, buildZipFileName(dateKey));
    return { ok, failed };
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * 等离屏卡片就绪：N 张卡片的 ref 都提交（nodes 齐）、所有封面 `<img>` 加载完、
 * N 个二维码 SVG（动态加载，最后才挂载）都出现在 DOM。三者任一没齐就继续等，
 * 超时直接返回 —— 之后按「能截多少截多少」继续，不强求完美。
 */
async function waitForCardsReady(
  host: HTMLElement,
  nodes: Map<number, HTMLDivElement>,
  expected: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const imagesReady = Array.from(host.querySelectorAll("img")).every((img) => img.complete);
    const qrReady = host.querySelectorAll("[data-qr-code]").length >= expected;
    if (nodes.size >= expected && imagesReady && qrReady) return;
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
}
