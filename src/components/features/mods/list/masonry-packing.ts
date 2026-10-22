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

/**
 * 宽高比大于它就算横屏，横跨两列。接近正方的（1.0 上下）不跨，跨了反而怪。
 *
 * 2026-10-22 从 1.1 提到 1.2：**1.1 会把「近方形」也算成横屏**。尤诺分类实测
 * 131 条预览里 83 条是 393×349（比例 1.126），全部被判成横屏 ⇒ 96/131 张都要跨两列。
 * 5 列布局里跨列卡只能两两成对地铺（0-1、2-3），必然空出一整列；而单列卡又只有
 * 35 张，填不满那条缝 —— 用户看到的就是「最左边一直空着一列，要等挺久才有卡」。
 *
 * 1.2 的含义是「5:4 及更宽才算横屏」：真正横着的图照样跨列，近方形回到单列，
 * 5 列能均匀铺满。改这个值等于改全站卡片的版式，动之前先跑 masonry-packing.test.ts。
 */
export const MASONRY_WIDE_RATIO = 1.2;

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

/**
 * 横屏卡跨两列时，允许在较短那一列留下的最大空隙。超过它就把这张卡**降级成单列**。
 *
 * 跨列卡的顶边必须取两列的 `max(bottom)`，较短那列从自己的底到这个顶之间就是洞。
 * 旧版只有「最多延后 3 张」的补救，等不到齐平时照样硬放 —— 2026-10-20 实测手机端
 * 出现过 562px 的洞（接近一整屏），比「横图小一号」难看得多，所以这里封顶。
 */
export const MASONRY_WIDE_MAX_HOLE = 72;

/**
 * 横屏卡占比达到它就切到「横屏为主」的版式。
 *
 * 背景（2026-10-23 绯雪分类）：整类 163/198 张换成横版封面后，5 列里跨两列的卡
 * 只能两两成对铺（0-1、2-3），第 5 列永远填不满 —— 用户看到的是「一列空着」。
 * 横屏为主时改两件事（见 packMasonry 与 evenColumnsForWideList）：
 *   1. 列数取偶数（5 → 4），跨列卡正好铺满整行；
 *   2. 取消 `MASONRY_WIDE_MAX_HOLE` 的硬过滤 —— 那个值是为「混排」定的，
 *      横屏为主时它会锁死在一对列上（那对列底部恒等，其它列判据永远超阈值），
 *      剩余列被饿死后整页高得离谱。
 *
 * 0.65 取「稳」：实测混合样例 8/14 = 57% 仍走老规则，只有整类换过横版封面
 * （绯雪 82%）才切换。
 */
export const MASONRY_WIDE_DOMINANT_SHARE = 0.65;

/** 少于这么多张不判：图片还没加载完就来回切列数，整页会跳 */
export const MASONRY_WIDE_DOMINANT_MIN_ITEMS = 12;

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

/**
 * 这批卡片是不是「横屏为主」。
 *
 * 未知比例（图还没加载）由调用方按 `MASONRY_DEFAULT_RATIO` 传进来，也就是算作竖屏 ——
 * 宁可晚一点切换，也不要在加载过程中在 4/5 列之间来回跳。
 */
export function isWideDominantMasonry(items: readonly MasonryPackItem[]): boolean {
  if (items.length < MASONRY_WIDE_DOMINANT_MIN_ITEMS) return false;
  const wide = items.filter((item) => item.ratio > MASONRY_WIDE_RATIO).length;
  return wide / items.length >= MASONRY_WIDE_DOMINANT_SHARE;
}

/**
 * 横屏为主的列表把奇数列降成偶数列（5 → 4）。
 *
 * 跨两列的卡在偶数列里正好两两铺满；奇数列必然剩一列没东西可放。已是偶数、或只有
 * 一列时原样返回。
 */
export function evenColumnsForWideList(columns: number, wideDominant: boolean): number {
  if (!wideDominant || columns < 2 || columns % 2 === 0) return columns;
  return columns - 1;
}

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
  /**
   * 横屏为主 **且列数够多** ⇒ 放宽 `MASONRY_WIDE_MAX_HOLE`（理由见该常量的注释）：
   * 跨列卡把一对列的底部压成相等以后，那对列永远是「最齐平」的一对，硬过滤会让
   * 后面所有横屏卡死守在这里，其余列再也长不高。
   *
   * 2 列不走这条：那里只有一对列，放宽等于「不齐也硬跨」，正是 2026-10-20 那个
   * 562px 大洞的来源。2 列靠上面那段 hold/flush 机制填平，实测洞更小、总高更矮。
   */
  const wideDominant = columns >= 3 && isWideDominantMasonry(items);

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

  /** 跨两列的横屏卡：顶部取这一对列里较深的那个位置（会在这对列的较浅侧留洞）。 */
  const placeWide = (item: MasonryPackItem, column: number) => {
    const top = Math.max(bottoms[column], bottoms[column + 1]);
    const width = masonrySpanWidth(2, columnWidth);
    const height = masonryCardHeight(width, item.ratio);

    placements.push({ id: item.id, column, span: 2, top });
    bottoms[column] = top + height + MASONRY_GAP;
    bottoms[column + 1] = top + height + MASONRY_GAP;
  };

  /**
   * 挑选横屏卡要压住的那一对相邻列。
   *
   * **先看「这一对有多深」，再看两列差**：优先放到当前最低的一对列上，同样深浅时再挑
   * 更齐平的一对、最后取靠左的。两列差超过 `MASONRY_WIDE_MAX_HOLE` 的对直接排除
   * （放进去会在较短那列留下停得下一张卡的大洞）。
   *
   * 为什么不能只按「两列差最小」挑（2026-10-22 尤诺分类的 bug）：
   * 跨列卡摆完之后它压住的两列底部**必然相等**，于是这一对的差值恒为 0，永远是最小值；
   * 只比差值就会一直选中同一对，连续几十张横图全堆在那里 —— 其它列空空如也，
   * 看起来就是「底部卡片全挤在最左边，右边完全没用」。
   * 改按「最低的一对」选，横图会在各对列之间轮转，整块瀑布流的高度也更均衡。
   */
  const findPlacementPair = () => {
    let best: { column: number; gap: number; deepest: number } | null = null;
    for (let column = 0; column <= columns - 2; column += 1) {
      const gap = Math.abs(bottoms[column] - bottoms[column + 1]);
      // 混排时超过阈值的一对列不能放（会在浅的那列留一个停得下整张卡的洞）；
      // 横屏为主时这条会锁死选位，见 wideDominant 的注释
      if (!wideDominant && gap > MASONRY_WIDE_MAX_HOLE) continue;

      const deepest = Math.max(bottoms[column], bottoms[column + 1]);
      // 亚像素比较留容差：底部差几百分之一像素不该让选位在两次重排间跳来跳去
      const shallower = !best || deepest < best.deepest - 0.5;
      const moreLevel =
        !wideDominant && best !== null && Math.abs(deepest - best.deepest) <= 0.5 && gap < best.gap - 0.5;
      /**
       * 横屏为主时的并列处理：两对列一样深就挑**洞更大**的那对。
       * 洞大意味着那一列落后了，正是该补的地方；挑洞小的（混排口径）会一直
       * 挑到同一对列上，落后的列永远追不回来。
       */
      const fillsMore =
        wideDominant && best !== null && Math.abs(deepest - best.deepest) <= 0.5 && gap > best.gap + 0.5;
      if (shallower || moreLevel || fillsMore) best = { column, gap, deepest };
    }
    return best;
  };

  /**
   * 横屏卡：只有存在一对足够齐平的列时才跨两列，否则**降级成单列卡**。
   * 宁可这张图小一号，也不要在列里留一个能停下一张卡的大洞。
   */
  const placeWideOrSingle = (item: MasonryPackItem) => {
    const pair = findPlacementPair();
    if (pair) placeWide(item, pair.column);
    else placeSingle(item);
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
      // 等到这个时候还没齐平的话，就降级成单列，别硬跨着留洞
      placeWideOrSingle(held);
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
        placeWideOrSingle(item);
      } else {
        held = item;
      }
    }

    flushHeld();
  } else {
    // 1 列：没有跨列可言；3 列及以上：横屏卡跨两列但不独占整行，同样受「不留大洞」约束。
    for (const item of items) {
      if (columns >= 2 && item.ratio > MASONRY_WIDE_RATIO) placeWideOrSingle(item);
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
