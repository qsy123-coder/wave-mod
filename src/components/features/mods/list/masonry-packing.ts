/**
 * 瀑布流（角色分类 / 列表页）的列分配与卡片尺寸计算。
 *
 * 背景：预览图横竖比例差很多 —— 竖屏多是 9:16（高 ≈ 1.8 × 列宽），
 * 横屏多是 5:4 / 4:3（高 ≈ 0.75 ~ 0.83 × 列宽）。列等宽时，横屏卡片
 * 看起来比竖屏卡片小一大截，所以横屏预览图改成**横跨两列**。
 *
 * 为什么不能继续用 flex 分列：flex 的每一列都是独立容器，卡片跨不过列边界。
 * 因此这里只负责算「每张卡落在第几列、纵坐标多少」，渲染层用绝对定位摆放。
 *
 * 纯函数、不碰 DOM，单测见 masonry-packing.test.ts。
 */

/** 列间距，对应网格的 gap-4 */
export const MASONRY_GAP = 16;

/**
 * 卡片里与预览图无关的固定尺寸：
 * neo-card 边框 4×2 + 卡片内边距 p-2.5 的 10×2 + 预览图自身边框 4×2。
 *
 * ⚠️ 必须与 ModCard 的 class 逐项对上。改了任何一处（padding / border）
 * 都要同步改这里，否则算出高度与真实高度不符，卡片会互相压住。
 */
export const MASONRY_CARD_CHROME = 36;

/** 宽高比大于它就算横屏，横跨两列。接近正方的（1.0 上下）不跨，跨了反而怪 */
export const MASONRY_WIDE_RATIO = 1.1;

/** 图片还没加载、拿不到真实宽高比时的兜底，与 ModCard 内联的 3/4 一致 */
export const MASONRY_DEFAULT_RATIO = 3 / 4;

export type MasonryPackItem = {
  id: string;
  /** 预览图宽高比（宽 / 高） */
  ratio: number;
};

export type MasonryPackOptions = {
  /**
   * 空洞优先（dense）模式。
   *
   * 普通模式只记「每列底部纵坐标」，横屏卡落在两列较低者的底沿 —— 较矮那一列上方
   * 留下的洞永远回不去（2026-10-19 用户在角色分类页看到的空洞就是它）。
   * dense 模式改为维护**已占用区间**：单列卡放进「最早能容纳它的空位」，
   * 横屏卡在相邻列对里找最早能整块放下的位置，于是后续卡片能回填洞。
   *
   * 代价是视觉顺序不再严格等于数据顺序（后出现的卡可能排在洞的位置）。
   * 因此只给角色筛选视图开启，默认视图保持原行为。
   */
  dense?: boolean;
};

export type MasonryPlacement = {
  id: string;
  /** 起始列（从 0 起） */
  column: number;
  /** 1 = 单列；2 = 横跨两列 */
  span: 1 | 2;
  /** 距容器顶部的像素 */
  top: number;
};

export type MasonryPackResult = {
  placements: MasonryPlacement[];
  /** 容器总高度（像素），末尾那一份列间距已经减掉 */
  height: number;
  /** 单列宽度（像素） */
  columnWidth: number;
};

/** 单张卡片（含边框和内边距）在给定宽度下的高度 */
export function masonryCardHeight(width: number, ratio: number): number {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : MASONRY_DEFAULT_RATIO;
  // 极端窄的容器（列宽 < chrome）不能算出负高度
  const innerWidth = Math.max(1, width - MASONRY_CARD_CHROME);
  return innerWidth / safeRatio + MASONRY_CARD_CHROME;
}

/** 第 column 列的左偏移 */
export function masonryColumnLeft(column: number, columnWidth: number): number {
  return column * (columnWidth + MASONRY_GAP);
}

/** 跨 span 列的卡片宽度 */
export function masonrySpanWidth(span: 1 | 2, columnWidth: number): number {
  return span === 2 ? columnWidth * 2 + MASONRY_GAP : columnWidth;
}

/** 一张已摆放卡片在某一列里占用的垂直区间 */
type OccupiedSpan = { top: number; bottom: number };

/**
 * 在已占用区间里找最早能放下 height 高的卡片的起点。
 *
 * 卡片之间至少留 MASONRY_GAP：起点先跳到最后一张卡底部 + 间距，再要求新卡底部
 * 距离下一张卡顶部也至少有间距。区间按 top 升序（由 insertOccupied 保证）。
 */
function earliestStart(occupied: readonly OccupiedSpan[], height: number): number {
  let candidate = 0;
  for (const card of occupied) {
    if (candidate + height <= card.top - MASONRY_GAP) return candidate;
    candidate = Math.max(candidate, card.bottom + MASONRY_GAP);
  }
  return candidate;
}

/** 按 top 有序插入占用区间 */
function insertOccupied(occupied: OccupiedSpan[], top: number, bottom: number) {
  let index = occupied.length;
  for (let i = 0; i < occupied.length; i += 1) {
    if (occupied[i].top > top) {
      index = i;
      break;
    }
  }
  occupied.splice(index, 0, { top, bottom });
}

/** 合并两列各自的占用区间（都已是 top 升序），横屏卡必须同时避开两列 */
function mergeOccupied(left: readonly OccupiedSpan[], right: readonly OccupiedSpan[]): OccupiedSpan[] {
  const merged: OccupiedSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (j >= right.length || (i < left.length && left[i].top <= right[j].top)) {
      merged.push(left[i]);
      i += 1;
    } else {
      merged.push(right[j]);
      j += 1;
    }
  }
  return merged;
}

/** 一列最底下那张卡的底沿（列是空的则为 0）；用于衡量列对两边的落差 */
function lastBottom(occupied: readonly OccupiedSpan[]): number {
  return occupied.length === 0 ? 0 : occupied[occupied.length - 1].bottom;
}

/**
 * dense 模式：按输入顺序摆放，但每一张都优先填「最早的可用空位」。
 *
 * - 单列卡：在所有列里找最早能容纳它的空位（不是"最短列"），于是横屏卡留下的洞
 *   会被后续卡片回头填上。
 * - 横屏卡：在每一对相邻列里找最早能整块放下的位置，取最靠上的那对。
 *
 * 代价是视觉顺序可能偏离数据顺序；追加下一页时已有卡片仍不会移动（新卡只填空位），
 * 但可能出现在更早卡片的洞上方 —— 这是 dense 模式有意为之。
 */
function packMasonryDense(
  items: MasonryPackItem[],
  columns: number,
  columnWidth: number,
): MasonryPackResult {
  const occupied: OccupiedSpan[][] = Array.from({ length: columns }, () => []);
  const placements: MasonryPlacement[] = [];
  let maxBottom = 0;

  for (const item of items) {
    const wide = columns >= 2 && item.ratio > MASONRY_WIDE_RATIO;

    if (wide) {
      const height = masonryCardHeight(masonrySpanWidth(2, columnWidth), item.ratio);
      let bestColumn = 0;
      let bestTop = Number.POSITIVE_INFINITY;
      let bestHole = Number.POSITIVE_INFINITY;

      for (let column = 0; column <= columns - 2; column += 1) {
        const top = earliestStart(mergeOccupied(occupied[column], occupied[column + 1]), height);
        // 同一高度时优先「两边落差更小」的列对 —— 横屏卡越过两列时必然在较矮那列
        // 上方留下洞，两列底沿越接近，洞越小。
        const hole =
          Math.max(0, top - lastBottom(occupied[column])) +
          Math.max(0, top - lastBottom(occupied[column + 1]));
        if (top < bestTop || (top === bestTop && hole < bestHole)) {
          bestTop = top;
          bestColumn = column;
          bestHole = hole;
        }
      }

      placements.push({ id: item.id, column: bestColumn, span: 2, top: bestTop });
      insertOccupied(occupied[bestColumn], bestTop, bestTop + height);
      insertOccupied(occupied[bestColumn + 1], bestTop, bestTop + height);
      maxBottom = Math.max(maxBottom, bestTop + height);
      continue;
    }

    const height = masonryCardHeight(columnWidth, item.ratio);
    let bestColumn = 0;
    let bestTop = Number.POSITIVE_INFINITY;
    for (let column = 0; column < columns; column += 1) {
      const top = earliestStart(occupied[column], height);
      if (top < bestTop) {
        bestTop = top;
        bestColumn = column;
      }
    }

    placements.push({ id: item.id, column: bestColumn, span: 1, top: bestTop });
    insertOccupied(occupied[bestColumn], bestTop, bestTop + height);
    maxBottom = Math.max(maxBottom, bestTop + height);
  }

  return {
    placements,
    height: placements.length === 0 ? 0 : maxBottom,
    columnWidth,
  };
}

/**
 * 按输入顺序把卡片分配到各列。
 *
 * 默认（`options.dense` 不开）：单列卡进当前最短的列，横屏卡横跨相邻两列、
 * 顶部对齐两列较低者的底沿。顺序与输入一致，但横屏卡会在较矮那列上方留下洞。
 *
 * `options.dense` 开启时改走 packMasonryDense（角色筛选视图用），允许后续卡片
 * 回填空洞。两种模式的追加行为都保证：已摆放的卡片不会因为新数据而移动。
 */
export function packMasonry(
  items: MasonryPackItem[],
  columns: number,
  containerWidth: number,
  options: MasonryPackOptions = {},
): MasonryPackResult {
  if (columns < 1 || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { placements: [], height: 0, columnWidth: 0 };
  }

  const columnWidth = (containerWidth - (columns - 1) * MASONRY_GAP) / columns;

  if (options.dense) {
    return packMasonryDense(items, columns, columnWidth);
  }

  // 每列当前的底部纵坐标（最后一张卡下沿 + 间距）
  const bottoms = new Array<number>(columns).fill(0);
  const placements: MasonryPlacement[] = [];

  for (const item of items) {
    const wide = columns >= 2 && item.ratio > MASONRY_WIDE_RATIO;

    if (wide) {
      // 跨列会同时推进两列：顶部取两列较低者（较高那列会留下一个洞），
      // 所以优先挑「两列底部都尽量浅」的相邻列对。
      let bestColumn = 0;
      let bestTop = Number.POSITIVE_INFINITY;
      for (let column = 0; column <= columns - 2; column += 1) {
        const top = Math.max(bottoms[column], bottoms[column + 1]);
        if (top < bestTop) {
          bestTop = top;
          bestColumn = column;
        }
      }

      const width = masonrySpanWidth(2, columnWidth);
      const height = masonryCardHeight(width, item.ratio);
      placements.push({ id: item.id, column: bestColumn, span: 2, top: bestTop });
      bottoms[bestColumn] = bestTop + height + MASONRY_GAP;
      bottoms[bestColumn + 1] = bestTop + height + MASONRY_GAP;
      continue;
    }

    let shortest = 0;
    for (let column = 1; column < columns; column += 1) {
      if (bottoms[column] < bottoms[shortest]) shortest = column;
    }

    const height = masonryCardHeight(columnWidth, item.ratio);
    placements.push({ id: item.id, column: shortest, span: 1, top: bottoms[shortest] });
    bottoms[shortest] += height + MASONRY_GAP;
  }

  const height = placements.length === 0 ? 0 : Math.max(...bottoms) - MASONRY_GAP;

  return { placements, height, columnWidth };
}
