export const COS_MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

export const COS_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** STS 临时密钥有效期（秒），COS 上传最长 1800-7200 秒 */
export const COS_STS_DURATION_SECONDS = 1800;

/**
 * 图片对象的缓存策略。**故意不用 immutable**：对象键没有内容哈希，换图是原地覆盖
 * 同一个键（见 scripts/reupload-mod-image.mjs），永久缓存会让换掉的图再也刷不出来。
 * 与 next.config.ts 里 character-imgs 的策略一致，也对应 docs/mods-image-optimization-prd.md:148。
 *
 * 一周 + 一天 stale-while-revalidate：正常浏览完全命中缓存，换图一周内自然过期；
 * 过期后也是先返回缓存、后台校验，用户侧看不到延迟。
 *
 * 通过 STS 直传的脚本无法 import TS，在 scripts/upload-daily-by-date.mjs 里复制了一份，
 * 改这里要同步改那边。
 */
export const COS_IMAGE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";

/**
 * 构建 COS 公开访问 URL。
 * 格式：https://{bucket}.cos.{region}.myqcloud.com/{objectKey}
 */
export function buildCosPublicUrl({
  bucket,
  region,
  objectKey,
}: {
  bucket: string;
  region: string;
  objectKey: string;
}) {
  // 兼容已带 appid 后缀的 bucket（如 my-bucket-1234567890）
  const b = bucket.trim();
  const r = region.trim();
  return `https://${b}.cos.${r}.myqcloud.com/${objectKey}`;
}

/**
 * 判断 URL 是否是腾讯云 COS 的公开对象地址
 */
export function isCosStorageUrl(url: string): boolean {
  return url.includes(".cos.") && url.includes(".myqcloud.com/");
}

/**
 * 数据万象（COS 图片处理）的尺寸档位。
 *
 * 站里所有图都是 2560×1600 原图直出 —— `next.config.ts` 的 `images.unoptimized: true`
 * 配一个恒等 loader（见 src/lib/image-loader.ts），等于没有任何按屏适配：列表卡位显示
 * 170 CSS px、榜单位 28px、首页 hero 位 270×492，拿到的都是同一张 452KB 的图。
 * 2026-10-16 实测：手机冷启动首页要下 2480KB，其中图片占 1898KB（76%）。
 *
 * COS 的数据万象是开着的，加 query 参数就能现场缩图（同一张图实测）：
 *   原图 452KB → 1280px 71KB / 800px 36KB / 320px 10KB
 * 变换后的响应带 `Cache-Control: max-age=604800`，浏览器缓存 7 天，不会每次回源重算。
 *
 * 分档按「那个位的实际显示宽度」取，不按组件名取。宁可先量一眼再填。
 */
export const COS_IMG_THUMB = 320;
export const COS_IMG_CARD = 800;
export const COS_IMG_HERO = 1280;

/**
 * 给 COS 图片 URL 拼上「缩到 width 宽」的处理参数。
 *
 * ⚠️ **只在渲染层用，不要把结果写回数据库。** 库里 `images` 的值被好几处按精确字符串比较：
 * `isPlaceholderImage` 的 `===`（src/lib/mods-domain/preview-image.ts）、
 * `getZenlessGallery` 的按 URL 去重、后台把 images join 成 textarea 回填、
 * 以及 scripts/*.mjs 里的占位图判据。改了数据这些判定会**静默**失效。
 *
 * 非 COS 地址原样返回：Supabase Storage、mappers.ts 的 unsplash 兜底图、本地
 * /character-imgs 的 host 都不支持 imageMogr2。
 *
 * 幂等：已经带 imageMogr2 的 URL 再调一次不会重复叠加。
 */
export function withCosImageTransform<T extends string | null | undefined>(url: T, width: number): T {
  if (!url || !isCosStorageUrl(url) || url.includes("imageMogr2")) {
    return url;
  }

  // 已有的查询串要留着（比如 mod-card 失败重试拼的 `_retry=`）：实测
  // `?imageMogr2/thumbnail/800x&_retry=123` 与调换顺序的结果完全一致，COS 只挑自己认识的参数。
  const separator = url.includes("?") ? "&" : "?";

  // `%3E` 就是 `>`，**不能省**：不带它时 thumbnail 会**放大**小图 ——
  // 实测把 2560×1600 的图请求成 `thumbnail/4000x` 真的返回了 4000×2500。
  // 带上 `>` 等于「只在比 width 大时才缩」，小图不会被撑大。
  return `${url}${separator}imageMogr2/thumbnail/${width}x%3E/format/webp` as T;
}

/**
 * 构建 COS 对象路径（与 Supabase Storage 路径结构保持一致）。
 * 格式：mods/{safe-char}/{modId}/{filename}
 */
export function buildCosObjectKey({
  character,
  modId,
  filename,
}: {
  character: string;
  modId: string;
  filename: string;
}) {
  const safeChar =
    character
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "mod";

  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
  const base =
    (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

  return `mods/${safeChar}/${modId}/${base || "mod-image"}${ext}`;
}

/**
 * 构建教程图片的 COS 对象路径。
 * 格式：tutorial/{chapter-key}/{modId}/{filename}
 */
export function buildTutorialObjectKey({
  chapterKey,
  modId,
  filename,
}: {
  chapterKey: string;
  modId: string;
  filename: string;
}) {
  const safeChapter = chapterKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10) || "00";

  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
  const base =
    (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

  return `tutorial/${safeChapter}/${modId}/${base || "step-image"}${ext}`;
}

export function formatCosFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10}GB`;
  }

  return `${Math.round(bytes / 1024 / 1024)}MB`;
}
