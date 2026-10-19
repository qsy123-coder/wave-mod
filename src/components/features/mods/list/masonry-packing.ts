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
   * 只在两列底沿齐平时才让横屏卡跨列（角色筛选视图用）。
   *
   * 背景：横屏卡横跨两列时，落位取两列中较低者的底沿，较矮那一列上方必然空出
   * 「两列底沿之差」那么高的一段。后续卡片的高度不可控，**填不上就是填不上**
   * （2026-10-19 实测：174px 的洞配 300px+ 的卡片，回填算法也无能为力）。
   *
   * 所以这里换一个思路：只有两列底沿之差 ≤ MASONRY_GAP 时才跨列（此时留下的洞
   * 不超过一个正常间距），否则这张横屏图按**单列**摆放。这样从源头不制造大洞，
   * 且卡片顺序始终与数据顺序一致、追加分页时已有卡片不会移动。
   */
  alignedSpanOnly?: boolean;
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

/**
 * 两列「齐平」的判定容差（像素）。
 *
 * 列宽是小数，两张同比例卡片算出来的高度只在浮点上有一点误差，0.5px 足够吸收。
 * 不能放宽：两列的下一张卡起点每差 1px，横屏卡就会在较矮那列多留 1px 的洞。
 */
const MASONRY_ALIGN_TOLERANCE = 0.5;

/**
 * 找出能让横屏卡落位的相邻列对；没有就返回 null。
 *
 * `alignedOnly` 开启时只接受两列底沿完全对齐的列对 —— 这样横屏卡跨越时，
 * 较矮那一列上方只留下正常的列间距，不会出现填不上的大洞。
 */
function findWideSlot(
  bottoms: readonly number[],
  columns: number,
  alignedOnly: boolean,
): { column: number; top: number } | null {
  let bestColumn = -1;
  let bestTop = Number.POSITIVE_INFINITY;

  for (let column = 0; column <= columns - 2; column += 1) {
    if (alignedOnly && Math.abs(bottoms[column] - bottoms[column + 1]) > MASONRY_ALIGN_TOLERANCE) {
      continue;
    }
    const top = Math.max(bottoms[column], bottoms[column + 1]);
    if (top < bestTop) {
      bestTop = top;
      bestColumn = column;
    }
  }

  return bestColumn === -1 ? null : { column: bestColumn, top: bestTop };
}

/**
 * 按输入顺序把卡片分配到各列。
 *
 * 默认：单列卡进当前最短的列；横屏卡横跨相邻两列、顶部对齐两列较低者的底沿。
 * 横跨会在较矮那列上方留下「两列底沿之差」那么高的洞 —— 后续卡片高度不可控，
 * 能填上是运气，填不上就会一直空着。
 *
 * `options.alignedSpanOnly`（角色筛选视图用）：只有两列底沿完全对齐时才允许
 * 跨列，否则这张横屏图按**单列**摆放。这样从源头保证任何一列都不会出现超过
 * 一个间距的垂直空洞，卡片顺序也始终与输入一致、追加分页时已有卡片不会移动。
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

  // 每列当前的底部纵坐标（最后一张卡下沿 + 间距）
  const bottoms = new Array<number>(columns).fill(0);
  const placements: MasonryPlacement[] = [];

  for (const item of items) {
    const wantsWide = columns >= 2 && item.ratio > MASONRY_WIDE_RATIO;
    // 角色筛选视图：没有齐平的相邻列时，这张横屏卡按单列摆（宁可图小，不留洞）
    const wideSlot = wantsWide
      ? findWideSlot(bottoms, columns, Boolean(options.alignedSpanOnly))
      : null;

    if (wideSlot) {
      // 跨列会同时推进两列：顶部取两列较低者（较高那列会留下一个洞），
      // 所以优先挑「两列底部都尽量浅」的相邻列对。
      const width = masonrySpanWidth(2, columnWidth);
      const height = masonryCardHeight(width, item.ratio);
      placements.push({ id: item.id, column: wideSlot.column, span: 2, top: wideSlot.top });
      bottoms[wideSlot.column] = wideSlot.top + height + MASONRY_GAP;
      bottoms[wideSlot.column + 1] = wideSlot.top + height + MASONRY_GAP;
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
