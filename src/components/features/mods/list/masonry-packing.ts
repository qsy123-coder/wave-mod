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

/**
 * 2 列布局里，两列底部高度差不超过它就认为「齐平」，横屏卡可以安全地跨列摆放。
 *
 * 为什么需要一个容忍值：两列底部很难精确相等（每张卡高度由图片比例决定），
 * 追求 0 会让横屏卡无限延后。24px 小于一张卡的最小高度，肉眼上看不出洞。
 */
export const MASONRY_HOLE_TOLERANCE = 24;

/**
 * 为了让两列齐平，横屏卡最多被延后多少张卡片。
 *
 * 延后是**有代价**的：用户按「最新」浏览时，横屏卡会后移 1–3 张。
 * 2026-10-19 用户确认「合理范围内可以」，所以上限取 3。
 */
export const MASONRY_MAX_WIDE_DELAY = 3;

/** 图片还没加载、拿不到真实宽高比时的兜底，与 ModCard 内联的 3/4 一致 */
export const MASONRY_DEFAULT_RATIO = 3 / 4;

export type MasonryPackItem = {
  id: string;
  /** 预览图宽高比（宽 / 高） */
  ratio: number;
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
 * 按输入顺序把卡片分配到各列：单列卡进当前最短的列，横屏卡横跨相邻两列。
 *
 * 顺序与输入一致（不做 dense 重排），追加下一页时已有卡片只会在列内下沉，
 * 不会被后来的内容插到上面。
 *
 * **2 列的避洞规则**：2 列下横屏卡 = 独占一整行，直接摆放会在较短那列留下
 * 一个洞。这里把横屏卡先暂存，让后续单列卡把两列填平（高度差 ≤ 容忍值）再放，
 * 最多延后 `MASONRY_MAX_WIDE_DELAY` 张。输出顺序仍按输入 id 排列，延后只影响
 * 纵坐标，不影响列表顺序。
 */
export function packMasonry(
  items: MasonryPackItem[],
  columns: number,
  containerWidth: number,
): MasonryPackResult {
  if (columns < 1 || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { placements: [], height: 0, columnWidth: 0 };
  }

  const columnWidth = (containerWidth - (columns - 1) * MASONRY_GAP) / columns;
  // 每列当前的底部纵坐标（最后一张卡下沿 + 间距）
  const bottoms = new Array<number>(columns).fill(0);
  const placements: MasonryPlacement[] = [];

  /** 单列卡：放进当前最短的列。 */
  const placeSingle = (item: MasonryPackItem) => {
    let shortest = 0;
    for (let column = 1; column < columns; column += 1) {
      if (bottoms[column] < bottoms[shortest]) shortest = column;
    }

    const height = masonryCardHeight(columnWidth, item.ratio);
    placements.push({ id: item.id, column: shortest, span: 1, top: bottoms[shortest] });
    bottoms[shortest] += height + MASONRY_GAP;
  };

  /** 跨两列的横屏卡：顶部取相邻列对里较浅的那个位置。 */
  const placeWide = (item: MasonryPackItem) => {
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
  };

  if (columns === 2) {
    const columnGap = () => Math.abs(bottoms[0] - bottoms[1]);

    /**
     * 被暂存的横屏卡。延后计数 `deferred` 只在暂存期间累加单列卡，
     * 放掉之后归零 —— 每次延后都从「最多 3 张」重新算。
     */
    let held: MasonryPackItem | null = null;
    let deferred = 0;

    const flushHeld = () => {
      if (!held) return;
      placeWide(held);
      held = null;
      deferred = 0;
    };

    for (const item of items) {
      const wide = item.ratio > MASONRY_WIDE_RATIO;

      if (!wide) {
        if (held) {
          // 先预测这张单列卡是「缩小」还是「撑大」两列差。会撑大的话说明继续等
          // 只会让洞更深 —— 先把横屏卡放掉，再放这张卡（顺序不变）。
          const shortest = bottoms[0] <= bottoms[1] ? 0 : 1;
          const fillHeight = masonryCardHeight(columnWidth, item.ratio) + MASONRY_GAP;
          const gapAfter = Math.abs(bottoms[1 - shortest] - (bottoms[shortest] + fillHeight));
          if (gapAfter >= columnGap()) {
            flushHeld();
            placeSingle(item);
            continue;
          }
        }

        placeSingle(item);
        if (held) {
          deferred += 1;
          if (deferred >= MASONRY_MAX_WIDE_DELAY || columnGap() <= MASONRY_HOLE_TOLERANCE) {
            flushHeld();
          }
        }
        continue;
      }

      // 连着两张横屏卡时，暂存没有意义（能填洞的只有单列卡），先把上一张放掉，
      // 保持两张横屏卡的前后顺序。
      flushHeld();

      if (columnGap() <= MASONRY_HOLE_TOLERANCE) {
        placeWide(item);
      } else {
        held = item;
      }
    }

    flushHeld();
  } else {
    // 1 列：没有跨列可言；3 列及以上：横屏卡只占两列、不独占整行，沿用即时摆放。
    for (const item of items) {
      if (columns >= 2 && item.ratio > MASONRY_WIDE_RATIO) placeWide(item);
      else placeSingle(item);
    }
  }

  // 延后会让 placements 的顺序与输入不同；按输入顺序重排，保证输出稳定。
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  const ordered = items
    .map((item) => byId.get(item.id))
    .filter((placement): placement is MasonryPlacement => Boolean(placement));

  const height = ordered.length === 0 ? 0 : Math.max(...bottoms) - MASONRY_GAP;

  return { placements: ordered, height, columnWidth };
}
