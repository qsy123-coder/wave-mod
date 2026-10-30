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

import { MODS_PAGE_SIZE } from "@/lib/mods-domain/filter-params";

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
 * 一对列「够齐平」的判据：底部高度差不超过它。
 *
 * 两个用途：
 *   1. 2 列布局里，两列底部高度差不超过它就认为「齐平」，横屏卡可以安全地跨列摆放；
 *   2. 3 列及以上，暂存的横屏卡等到某一对列满足它就立刻放行（见 packMasonry）。
 *
 * 为什么需要一个容忍值：两列底部很难精确相等（每张卡高度由图片比例决定），
 * 追求 0 会让横屏卡无限延后。24px 小于一张卡的最小高度，肉眼上看不出洞。
 *
 * 注意它比 `MASONRY_WIDE_MAX_HOLE` 严得多：24px 是「可以去跨」，72px 是「跨了也还
 * 能接受」—— 暂存期的等待目标用前者，等不到时降级的门槛用后者。
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
 *
 * ⚠️ **所有列数都受这条约束**（2 列、3 列及以上都一样），没有「横屏为主就放宽」的例外。
 * 2026-10-30 用户报的角色分类页正是栽在放开了这条：那一类里有个别封面是超长竖图
 * （比例 0.3 上下、一张卡就 800px 高），它落进某一列后，跨列卡在那一对上取
 * `max(bottom)` 就把另一列**永久**留下几百上千像素的洞 —— 洞里不会再有卡片落进来
 * （后续单列卡只会去更矮的列），整页看着就是「中间一块大空白」。
 *
 * 放宽当初是为了治「整列空到底」（见 MASONRY_WIDE_DOMINANT_SHARE 的历史注释），
 * 现在改由 `packMasonry` 里的「暂存 → 等齐平 → 放行」机制负责：跨列卡先让位，
 * 等单列卡把某一对列填平再跨，等不到（`MASONRY_MAX_WIDE_DELAY` 张后）就降级成单列。
 * 既不留洞，也不会把某一对列喂得过胖。
 */
export const MASONRY_WIDE_MAX_HOLE = 72;

/**
 * 横屏卡占比达到它就切到「横屏为主」的版式：**列数取偶数**（5 → 4，见
 * `evenColumnsForWideList`）。跨两列的卡在偶数列里正好两两铺满整行，奇数列必然剩
 * 一列没东西可放。
 *
 * 背景（2026-10-23 绯雪分类）：整类 163/198 张换成横版封面后，5 列里跨两列的卡
 * 只能两两成对铺（0-1、2-3），第 5 列永远填不满 —— 用户看到的是「一列空着」。
 *
 * 阈值 0.55。曾经是 0.65，但 2026-10-23 实测绯雪的**第一页**只有 58%
 * （整类 82%，分页顺序不是均匀抽样），刚好卡在 0.65 之下，于是 5 列布局原样保留：
 * 最右一列只铺到 1450px、其余列 5500px —— 就是用户报的「留出一整列空的」。
 * 拿首页 48 条真实比例离线跑，各列底部最大落差：4 列 4px / 5 列 4074px / 6 列 3723px。
 *
 * 为什么不再往下压到 0.5：正好 50% 的混合样本在 5 列下只有 232px 落差（不到一张卡），
 * 强行切 4 列反而变成 458px。0.55 只吃掉「横屏明显过半」这一类。
 * （偶数列总高比奇数列大是正常的：列宽变大、每张卡都更高，换来的是没有空列。）
 *
 * ⚠️ 这个判据**只决定列数**，不再影响跨列卡的避洞规则 —— 避洞对所有列数一视同仁。
 */
export const MASONRY_WIDE_DOMINANT_SHARE = 0.55;

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

/**
 * 某个角色的「版式画像」：骨架屏要在**数据到达之前**就画对，只能靠它。
 *
 * 骨架屏渲染时列表还没请求回来（`isPending`），拿不到任何卡片比例 —— 于是只能按
 * 兜底 3/4 画成一版竖屏占位，与最终横屏大卡对不上（2026-10-27 用户报的
 * 「马上就要加载出横屏卡的位置，骨架屏却是竖屏动画」）。
 *
 * `wideRatio` 是该角色横屏封面的**平均**宽高比，用来给占位卡定高。
 */
export type MasonryLayoutHint = {
  wideDominant: boolean;
  wideRatio: number;
  /**
   * **第一页**（默认排序下前 `MODS_PAGE_SIZE` 条）的封面比例，按顺序排。
   *
   * 骨架屏靠它才画得准：整个分类的横屏占比与第一页往往差很多 —— 绯雪整类 82% 横屏，
   * 但「最新」的第一页只有约一半，甚至以竖卡为主。用整类占比去画骨架，就会出现
   * 「骨架两列横卡、落下来却是一屏竖卡」（2026-10-27 用户反馈）。
   *
   * 缺尺寸的条目按兜底 3/4 占位，保证**位置与数量**都与真实第一页一一对应。
   */
  ratios: number[];
};

/** 骨架屏判定「横屏为主」所需的最少样本数；比真布局的 12 张放宽些，样本少时宁可画老样子 */
const HINT_MIN_SAMPLES = 8;

/** 版式画像里要保留多少张第一页的比例 —— 与服务端每页条数一致，骨架才能一一对应 */
const HINT_PAGE_SIZE = MODS_PAGE_SIZE;

/**
 * 由「全库已发布 mod」算出每个角色的版式画像，服务端算一次、随页面下发。
 *
 * 只看**取到封面尺寸**的行（`cover_width/cover_height`）：没尺寸的那些本来就会
 * 回退到实测比例，把它们计入总数会把占比稀释掉。
 *
 * @param keyOf 角色名 → 查表键（默认就是角色名本身）。线上路由里角色名有两种写法
 *   （原始值 / `normalizeCharacterName` 之后的规范名），调用方用这个把它补齐。
 */
export function buildLayoutHints(
  mods: readonly {
    character: string;
    coverHeight?: number | null;
    coverWidth?: number | null;
  }[],
  keyOf: (character: string) => string[] = (character) => [character],
): Record<string, MasonryLayoutHint> {
  // ① 先按**原始角色名**聚合。不能直接按 keyOf 聚合：`反虚化，ui界面，场景…`
  // 归一化之后也叫「UI」，两批混合样本会合成一桶、把 UI 的占比抬过线
  // （2026-10-27 实测：UI 本身 52%，被拉成"横屏为主"，骨架反而画错）。
  const stats = new Map<string, { total: number; wide: number; wideRatioSum: number }>();
  /** 原始角色名 → 默认排序下前 N 条的比例（骨架屏按它逐张摆位） */
  const firstRatios = new Map<string, number[]>();

  for (const mod of mods) {
    const raw = mod.character ?? "";
    if (!raw) continue;

    const width = mod.coverWidth ?? 0;
    const height = mod.coverHeight ?? 0;
    const known = width > 0 && height > 0;
    const ratio = known ? width / height : MASONRY_DEFAULT_RATIO;

    // ① 第一页序列：**顺序即列表顺序**，缺尺寸的用兜底比例占位。
    const seq = firstRatios.get(raw) ?? [];
    if (seq.length < HINT_PAGE_SIZE) {
      seq.push(ratio);
      firstRatios.set(raw, seq);
    }

    // ② 全类统计只看有尺寸的（未知的会把占比稀释掉）
    if (!known) continue;
    const entry = stats.get(raw) ?? { total: 0, wide: 0, wideRatioSum: 0 };
    entry.total += 1;
    if (ratio > MASONRY_WIDE_RATIO) {
      entry.wide += 1;
      entry.wideRatioSum += ratio;
    }
    stats.set(raw, entry);
  }

  /**
   * 每个角色都给提示（哪怕不是横屏为主）：骨架屏要按第一页逐张摆位，
   * 竖屏为主的分类同样需要这份序列。`wideDominant` 只是额外告诉调用方
   * 「列数要取偶数、跨列规则放宽」。
   */
  const hintFor = (raw: string): MasonryLayoutHint | null => {
    const ratios = firstRatios.get(raw);
    if (!ratios || ratios.length === 0) return null;
    const entry = stats.get(raw);
    const wideDominant = Boolean(
      entry && entry.total >= HINT_MIN_SAMPLES && entry.wide / entry.total >= MASONRY_WIDE_DOMINANT_SHARE,
    );
    return {
      wideDominant,
      // 兜底给一个 5:4 附近的保守值，别让占位卡过分扁
      wideRatio: entry && entry.wide > 0 ? entry.wideRatioSum / entry.wide : MASONRY_WIDE_RATIO + 0.2,
      ratios: [...ratios],
    };
  };

  const hints: Record<string, MasonryLayoutHint> = {};
  for (const raw of firstRatios.keys()) {
    const hint = hintFor(raw);
    if (hint) hints[raw] = hint;
  }

  // ② 再补别名键（URL 里可能写的是归一化后的名字）。只在别名**不是**一个真实分类时补，
  // 否则会盖掉那个分类自己的结论 —— 它已经按自己的样本算过了。
  for (const raw of stats.keys()) {
    const hint = hints[raw];
    if (!hint) continue;
    for (const alias of keyOf(raw)) {
      if (!alias || alias === raw || stats.has(alias)) continue;
      hints[alias] = hint;
    }
  }
  return hints;
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
 * **避洞规则（所有列数通用）**：横屏卡跨两列时，顶边必须取这一对列里较深的
 * `max(bottom)`，较短那列就留下一个洞，而且**没人会回头填它**。所以：
 *   - 这一对的落差 > `MASONRY_WIDE_MAX_HOLE` ⇒ 先**暂存**这张卡，让后续单列卡
 *     把某一对列填平（落差 ≤ `MASONRY_HOLE_TOLERANCE`）再放；
 *   - 最多延后 `MASONRY_MAX_WIDE_DELAY` 张，等不到就**降级成单列卡**（图小一号，
 *     但不留洞）；连着来两张横屏卡时暂存没有意义，前一张直接按这个规则落地。
 * 输出顺序仍按输入 id 排列，延后只影响纵坐标，不影响列表顺序。
 *
 * 2 列额外有一条「预测下一张单列卡会把两列差撑大就提前放掉」的优化，见下面的分支。
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
   * 更齐平的一对、最后取靠左的。
   *
   * 为什么不能只按「两列差最小」挑（2026-10-22 尤诺分类的 bug）：
   * 跨列卡摆完之后它压住的两列底部**必然相等**，于是这一对的差值恒为 0，永远是最小值；
   * 只比差值就会一直选中同一对，连续几十张横图全堆在那里 —— 其它列空空如也，
   * 看起来就是「底部卡片全挤在最左边，右边完全没用」。
   * 改按「最低的一对」选，横图会在各对列之间轮转，整块瀑布流的高度也更均衡。
   *
   * ⚠️ **只从偶数下标起跨**（0-1、2-3、4-5），不跨 1-2 / 3-4（2026-10-23 绯雪）：
   * 一旦第一张横图落在 1-2 这种奇数起点，0 列和 1 列的高度差立刻变大，
   * 之后所有横图只能在 1-2 / 3-4 之间来回 —— **最左和最右两种列永远拿不到横图**，
   * 只剩零星单列卡。6 列实测：首尾两列各停在 ~870px，中间四列 4400px。
   * 偶数起点保证「每一对都从干净的两列开始」，边列也能正常长高。
   *
   * ⚠️ 这里**不**按 `MASONRY_WIDE_MAX_HOLE` 预先过滤：过滤掉所有候选就等于「没有候选」，
   * 而调用方需要知道「最浅的那一对差多少」才能决定是等一等还是降级。判据留给调用方。
   * 返回的 `gap` = 这一对两列的内部落差 —— 跨列卡会把它**原样变成一个洞**。
   */
  const findPlacementPair = () => {
    let best: { column: number; gap: number; deepest: number } | null = null;
    for (let column = 0; column <= columns - 2; column += 2) {
      const gap = Math.abs(bottoms[column] - bottoms[column + 1]);
      const deepest = Math.max(bottoms[column], bottoms[column + 1]);
      // 亚像素比较留容差：底部差几百分之一像素不该让选位在两次重排间跳来跳去
      const shallower = !best || deepest < best.deepest - 0.5;
      const moreLevel =
        best !== null && Math.abs(deepest - best.deepest) <= 0.5 && gap < best.gap - 0.5;
      if (shallower || moreLevel) best = { column, gap, deepest };
    }
    return best;
  };

  /**
   * 横屏卡：只有存在一对落差在 `MASONRY_WIDE_MAX_HOLE` 以内的列时才跨两列，
   * 否则**降级成单列卡**。宁可这张图小一号，也不要在列里留一个能停下一张卡的大洞。
   *
   * 这里判断的是**当前**能不能跨；想把「现在跨不了、等几张单列卡就能跨」拖回来时，
   * 用下面的 hold/flush 机制把它暂存起来。
   */
  const placeWideOrSingle = (item: MasonryPackItem) => {
    const pair = findPlacementPair();
    if (pair && pair.gap <= MASONRY_WIDE_MAX_HOLE) placeWide(item, pair.column);
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
  } else if (columns < 2) {
    // 1 列：没有跨列可言，按输入顺序往下堆即可（走暂存反而会让卡片跳到队尾）。
    for (const item of items) placeSingle(item);
  } else {
    /**
     * 3 列及以上：**和 2 列同一套「暂存 → 等齐平 → 放行」机制**（2026-10-30 起）。
     *
     * 以前这里是「挑最浅的一对，差多少都硬跨」：跨列卡顶边取 `max(bottom)`，较短那列
     * 的落差就原样变成一个洞，而且**永久空着** —— 后续单列卡只会去更矮的列，没人回头
     * 填它。常态下洞只有一两百像素还能忍，一旦某一列落进一张超长竖图（实测有的封面
     * 比例 0.3 上下、一张卡 800px 高），洞就变成半屏，用户看到的是「中间一大块空白」。
     *
     * 现在跨列卡先看这一对列的落差：超过 `MASONRY_WIDE_MAX_HOLE` 就暂存，让后面的
     * 单列卡把某一对列填平再跨；`MASONRY_MAX_WIDE_DELAY` 张还等不到，就降级成单列。
     * 代价与 2 列一致：横图在「最新」排序里可能后移 1–3 张（2026-10-19 用户认可）。
     */
    let held: MasonryPackItem | null = null;
    let deferred = 0;

    /** 放掉暂存的横屏卡：现在是齐平的（或等够了）就跨，否则降级成单列。 */
    const flushHeld = () => {
      if (!held) return;
      placeWideOrSingle(held);
      held = null;
      deferred = 0;
    };

    /** 已经有一对列足够齐平、可以立刻跨列了吗 */
    const hasLevelPair = () => {
      const pair = findPlacementPair();
      return Boolean(pair && pair.gap <= MASONRY_HOLE_TOLERANCE);
    };

    for (const item of items) {
      if (item.ratio <= MASONRY_WIDE_RATIO) {
        placeSingle(item);
        if (held) {
          deferred += 1;
          if (deferred >= MASONRY_MAX_WIDE_DELAY || hasLevelPair()) flushHeld();
        }
        continue;
      }

      // 连着两张横屏卡时，暂存没有意义（能填洞的只有单列卡），先把上一张放掉，
      // 保持两张横屏卡的前后顺序。
      flushHeld();

      const pair = findPlacementPair();
      if (pair && pair.gap <= MASONRY_WIDE_MAX_HOLE) placeWide(item, pair.column);
      else held = item;
    }

    flushHeld();
  }

  // 延后会让 placements 的顺序与输入不同；按输入顺序重排，保证输出稳定。
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  const ordered = items
    .map((item) => byId.get(item.id))
    .filter((placement): placement is MasonryPlacement => Boolean(placement));

  const height = ordered.length === 0 ? 0 : Math.max(...bottoms) - MASONRY_GAP;

  return { placements: ordered, height, columnWidth };
}
