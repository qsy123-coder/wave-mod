/**
 * 分享图：纯浏览器 canvas 绘制，不上传任何数据。
 *
 * 尺寸按 1080×1350（4:5），手机分享不会被裁；配色沿用站点的奶油底 + 黑描边 +
 * 硬阴影，保证和网页是同一套视觉。
 */

export type ShareCardPool = {
  name: string;
  pity: number;
  hardPity: number;
};

export type ShareCardFiveStar = {
  resourceId: number;
  name: string;
  qualityLevel: number;
};

export type ShareCardPayload = {
  uidMasked: string;
  range: string;
  totalPulls: number;
  fiveStarRate: number;
  averagePity: number | null;
  winRate: number | null;
  pools: ShareCardPool[];
  fiveStars: ShareCardFiveStar[];
};

import { gachaIconUrl } from "./asset-urls";

const WIDTH = 1080;
const HEIGHT = 1350;
const INK = "#000000";
const CREAM = "#fffdf5";
const ACCENT = "#ff6b6b";
const SECONDARY = "#ffd93d";
const MUTED = "#6b5b4f";

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawStatTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  unit: string,
) {
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, x, y, width, 176, 18);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = "700 26px system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  ctx.fillText(label, x + 28, y + 58);

  ctx.fillStyle = INK;
  ctx.font = "900 62px system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  ctx.fillText(value, x + 28, y + 132);

  const valueWidth = ctx.measureText(value).width;
  ctx.fillStyle = MUTED;
  ctx.font = "700 24px system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  ctx.fillText(unit, x + 34 + valueWidth, y + 130);
}

const ICON_TIMEOUT_MS = 4000;

/**
 * 加载 COS 图标。COS 桶已配置 CORS（允许 go.sunnyrose.xyz），所以带
 * `crossOrigin="anonymous"` 画进 canvas 不会污染画布；任何失败都只是少一张图。
 */
function loadIcon(resourceId: number): Promise<HTMLImageElement | null> {
  const url = gachaIconUrl(resourceId);
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), ICON_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}

export async function renderShareCard(payload: ShareCardPayload): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持 canvas");

  const fontStack = "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";

  // 奶油底 + 顶部色带
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = SECONDARY;
  ctx.fillRect(0, 0, WIDTH, 26);

  // 外框
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);

  // 标题
  ctx.fillStyle = INK;
  ctx.font = `900 74px ${fontStack}`;
  ctx.fillText("唤取分析", 72, 156);

  ctx.fillStyle = ACCENT;
  roundedRect(ctx, 72, 182, 220, 46, 23);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `800 26px ${fontStack}`;
  ctx.fillText("WUTHERING WAVES", 92, 214);

  ctx.fillStyle = MUTED;
  ctx.font = `700 28px ${fontStack}`;
  ctx.fillText(`UID ${payload.uidMasked}`, 72, 288);
  ctx.fillText(payload.range, 72, 332);

  // 三块核心指标
  const tileWidth = (WIDTH - 72 * 2 - 24 * 2) / 3;
  const tileY = 380;
  drawStatTile(ctx, 72, tileY, tileWidth, "总唤取", String(payload.totalPulls), "抽");
  drawStatTile(
    ctx,
    72 + tileWidth + 24,
    tileY,
    tileWidth,
    "五星率",
    payload.fiveStarRate.toFixed(1),
    "%",
  );
  drawStatTile(
    ctx,
    72 + (tileWidth + 24) * 2,
    tileY,
    tileWidth,
    "平均出金",
    payload.averagePity === null ? "—" : payload.averagePity.toFixed(1),
    "抽",
  );

  // 不歪率
  ctx.fillStyle = MUTED;
  ctx.font = `700 28px ${fontStack}`;
  ctx.fillText("UP 不歪率", 72, 634);
  ctx.fillStyle = INK;
  ctx.font = `900 44px ${fontStack}`;
  ctx.fillText(payload.winRate === null ? "—" : `${payload.winRate.toFixed(1)}%`, 246, 636);

  // 最近五星（图标按 resourceId 从 COS 取；跨域失败就整排跳过，不影响主图）
  const icons = await Promise.all(payload.fiveStars.slice(0, 6).map((item) => loadIcon(item.resourceId)));
  const availableIcons = icons.filter((icon): icon is HTMLImageElement => icon !== null);

  if (availableIcons.length > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `700 26px ${fontStack}`;
    ctx.fillText("最近五星", 72, 690);

    const iconSize = 64;
    const iconGap = 14;
    availableIcons.forEach((icon, index) => {
      const x = 72 + index * (iconSize + iconGap);
      ctx.drawImage(icon, x, 706, iconSize, iconSize);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, 706, iconSize, iconSize);
    });
  }

  // 卡池垫抽
  ctx.fillStyle = INK;
  ctx.font = `900 36px ${fontStack}`;
  ctx.fillText("各卡池当前垫抽", 72, 810);

  const maxRows = 7;
  const rows = payload.pools.slice(0, maxRows);
  const rowHeight = 54;

  rows.forEach((pool, index) => {
    const y = 848 + index * rowHeight;
    const progress = Math.min(1, pool.pity / pool.hardPity);

    ctx.fillStyle = INK;
    ctx.font = `800 26px ${fontStack}`;
    ctx.fillText(pool.name, 72, y + 24);

    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = `700 24px ${fontStack}`;
    ctx.fillText(`${pool.pity} / ${pool.hardPity}`, WIDTH - 72, y + 24);
    ctx.textAlign = "left";

    // 进度槽
    ctx.fillStyle = "#e7ded2";
    roundedRect(ctx, 72, y + 36, WIDTH - 144, 12, 6);
    ctx.fill();

    if (progress > 0) {
      ctx.fillStyle = progress >= 0.9 ? ACCENT : SECONDARY;
      roundedRect(ctx, 72, y + 36, Math.max(12, (WIDTH - 144) * progress), 12, 6);
      ctx.fill();
    }
  });

  if (payload.pools.length > maxRows) {
    ctx.fillStyle = MUTED;
    ctx.font = `700 22px ${fontStack}`;
    ctx.fillText(`另有 ${payload.pools.length - maxRows} 个卡池未显示`, 72, 848 + maxRows * rowHeight + 8);
  }

  // 页脚
  ctx.fillStyle = INK;
  ctx.font = `800 24px ${fontStack}`;
  ctx.fillText("www.go.sunnyrose.xyz/gacha", 72, HEIGHT - 92);
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${fontStack}`;
  ctx.fillText("数据仅在本机生成，不上传、不保存", 72, HEIGHT - 52);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("生成图片失败"));
    }, "image/png");
  });
}
