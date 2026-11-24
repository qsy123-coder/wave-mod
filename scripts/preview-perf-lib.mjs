/**
 * 预览图验收脚本里的纯逻辑（无网络、无 DOM），单独成文件是为了能进 vitest。
 *
 * 这里最容易写错的是「浏览器到底会挑哪一档」：srcset 候选按 `w` 升序，浏览器取
 * **不小于** 所需设备像素的最小档；`sizes` 的媒体条件按顺序匹配，第一条命中的生效。
 * 挑错档会让验收脚本量到一张用户根本不会请求的图，结论就不可信了。
 */

/** 解析一个 HTML 标签的属性（属性名大小写不敏感） */
export function parseAttrs(tag) {
  const attrs = {};
  const re = /([a-zA-Z0-9:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  return attrs;
}

/**
 * 从 srcset 里挑浏览器会选的那一档：不小于目标设备像素的最小候选；
 * 都太小就取最大档（浏览器同样会放大）。
 *
 * @param {string} srcSet 形如 `url1 640w, url2 960w`
 * @param {number} targetWidth 需要的设备像素
 * @returns {{url: string, width: number} | null}
 */
export function pickSrcsetCandidate(srcSet, targetWidth) {
  const candidates = String(srcSet ?? "")
    .split(",")
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(/\s+/);
      const width = descriptor?.endsWith("w") ? Number(descriptor.slice(0, -1)) : NaN;
      return { url, width };
    })
    .filter((c) => c.url && Number.isFinite(c.width))
    .sort((a, b) => a.width - b.width);

  if (!candidates.length) return null;
  return candidates.find((c) => c.width >= targetWidth) ?? candidates[candidates.length - 1];
}

/**
 * 按 CSS `sizes` + 视口宽度 + DPR 算需要的设备像素。
 *
 * 支持的写法（站内只用这两种）：
 *   `"(max-width: 640px) 100vw, 720px"`
 *   `"56px"` / `"100vw"`
 *
 * 媒体条件按顺序匹配，**第一条命中**的生效；没有命中条件的最后一段是兜底。
 */
export function computeRequiredWidth(sizes, viewportCssWidth, dpr) {
  const parts = String(sizes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let chosen = null;

  for (const part of parts) {
    const m = /^\(max-width:\s*(\d+)px\)\s*(.+)$/.exec(part);
    if (m) {
      if (viewportCssWidth <= Number(m[1])) {
        chosen = m[2].trim();
        break;
      }
      continue;
    }
    // 无条件的兜底段：只有当之前没有任何媒体条件命中时才用
    if (chosen === null) chosen = part;
  }

  if (chosen === null) chosen = "100vw";

  let cssWidth;
  if (chosen.endsWith("vw")) {
    cssWidth = (Number.parseFloat(chosen) / 100) * viewportCssWidth;
  } else if (chosen.endsWith("px")) {
    cssWidth = Number.parseFloat(chosen);
  } else {
    cssWidth = viewportCssWidth;
  }

  return Math.round(cssWidth * dpr);
}

/** 给一个 COS 原图地址拼上宽度档位（与 src/lib/cos/shared.ts 的 withCosImageTransform 同形） */
export function buildThumbUrl(url, width) {
  if (!url || typeof url !== "string") return null;
  if (url.includes("imageMogr2")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}imageMogr2/thumbnail/${width}x%3E/format/webp`;
}
