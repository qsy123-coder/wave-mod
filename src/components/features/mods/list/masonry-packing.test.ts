import { describe, expect, it } from "vitest";

import {
  MASONRY_CARD_CHROME,
  MASONRY_GAP,
  MASONRY_HOLE_TOLERANCE,
  MASONRY_MAX_WIDE_DELAY,
  MASONRY_WIDE_MAX_HOLE,
  MASONRY_WIDE_RATIO,
  masonryCardHeight,
  masonryColumnLeft,
  masonrySpanWidth,
  packMasonry,
} from "./masonry-packing";

const PORTRAIT = 9 / 16;
const LANDSCAPE = 4 / 3;

const ids = (count: number) => Array.from({ length: count }, (_, i) => `m${i}`);
const items = (ratios: number[]) => ratios.map((ratio, i) => ({ id: `m${i}`, ratio }));

describe("masonryCardHeight", () => {
  it("竖屏图比横屏高", () => {
    const portrait = masonryCardHeight(236, PORTRAIT);
    const landscape = masonryCardHeight(236, LANDSCAPE);
    expect(portrait).toBeGreaterThan(landscape * 2);
  });

  it("高度 = (宽度 - chrome) / 比例 + chrome", () => {
    expect(masonryCardHeight(236, 0.5)).toBeCloseTo((236 - MASONRY_CARD_CHROME) / 0.5 + MASONRY_CARD_CHROME);
  });

  it("比例非法时退回默认值而不是 NaN / 负高度", () => {
    const fallback = masonryCardHeight(236, 0.75);
    expect(masonryCardHeight(236, 0)).toBeCloseTo(fallback);
    expect(masonryCardHeight(236, Number.NaN)).toBeCloseTo(fallback);
  });
});

describe("masonrySpanWidth / masonryColumnLeft", () => {
  it("跨两列 = 两列宽 + 一个间距", () => {
    expect(masonrySpanWidth(2, 200)).toBe(200 * 2 + MASONRY_GAP);
    expect(masonrySpanWidth(1, 200)).toBe(200);
  });

  it("列左偏移按列宽 + 间距递增", () => {
    expect(masonryColumnLeft(0, 200)).toBe(0);
    expect(masonryColumnLeft(3, 200)).toBe(3 * (200 + MASONRY_GAP));
  });
});

describe("packMasonry", () => {
  it("空列表返回空布局", () => {
    const result = packMasonry([], 5, 1024);
    expect(result.placements).toHaveLength(0);
    expect(result.height).toBe(0);
    // 列宽照算：调用方要拿它铺骨架/占位
    expect(result.columnWidth).toBeCloseTo((1024 - MASONRY_GAP * 4) / 5);
  });

  it("容器宽度未知时不出布局（渲染层拿它当「还没量到」）", () => {
    expect(packMasonry(items([PORTRAIT]), 5, 0).placements).toHaveLength(0);
  });

  it("竖屏卡按顺序铺满每一列", () => {
    const result = packMasonry(items(Array(5).fill(PORTRAIT)), 5, 1024);
    expect(result.placements.map((p) => p.column)).toEqual([0, 1, 2, 3, 4]);
    expect(result.placements.every((p) => p.span === 1)).toBe(true);
    expect(result.placements.every((p) => p.top === 0)).toBe(true);
  });

  it("新卡片落到当前最短的列", () => {
    // 前 5 张铺满一列各一张（等高），第 6 张应该回到第 0 列顶部下方
    const result = packMasonry(items(Array(6).fill(PORTRAIT)), 5, 1024);
    const sixth = result.placements[5];
    const first = result.placements[0];
    expect(sixth.column).toBe(0);
    expect(sixth.top).toBeCloseTo(first.top + masonryCardHeight(result.columnWidth, PORTRAIT) + MASONRY_GAP);
  });

  it("横屏卡横跨两列，宽度等于跨列宽，顶部对齐较浅的那列", () => {
    const ratios = [PORTRAIT, PORTRAIT, LANDSCAPE];
    const result = packMasonry(items(ratios), 3, 620);
    const wide = result.placements[2];

    expect(wide.span).toBe(2);
    expect(wide.column).toBe(0);
    // 三列各只有一张竖屏卡，底部相同 ⇒ 横屏卡接在它们下面
    const portraitHeight = masonryCardHeight(result.columnWidth, PORTRAIT);
    expect(wide.top).toBeCloseTo(portraitHeight + MASONRY_GAP);
    expect(masonrySpanWidth(wide.span, result.columnWidth)).toBeCloseTo(
      result.columnWidth * 2 + MASONRY_GAP,
    );
  });

  it("两列齐平时横屏卡跨两列（占满整行），宽度等于容器宽", () => {
    // 两张横屏卡：第一张落下后两列底部相同 ⇒ 第二张可以安全跨列
    const result = packMasonry(items([LANDSCAPE, LANDSCAPE]), 2, 390);
    const [first, second] = result.placements;

    expect(first.span).toBe(2);
    expect(second.span).toBe(2);
    expect(masonrySpanWidth(second.span, result.columnWidth)).toBeCloseTo(390);
  });

  it("两列不齐时横屏卡降级成单列，不在列顶留空", () => {
    // 第一张竖屏落左列后，右列还是空的；此时跨列会在右上角空出一整张卡
    const result = packMasonry(items([PORTRAIT, LANDSCAPE]), 2, 390);
    const wide = result.placements[1];

    expect(wide.span).toBe(1);
    expect(wide.top).toBe(0);
    expect(wide.column).toBe(1);
    expect(result.placements[0].span).toBe(1);
  });

  it("多列时横屏卡优先落到最低的一对列上", () => {
    // 5 列：前 3 张竖屏占住 0/1/2 列，最空的相邻列对是 3/4
    const result = packMasonry(items([PORTRAIT, PORTRAIT, PORTRAIT, LANDSCAPE]), 5, 1024);
    const wide = result.placements[3];

    expect(wide.span).toBe(2);
    expect(wide.column).toBe(3);
  });

  it("多列时连续横屏卡在各对列间轮转，不会全堆在同一对列（2026-10-22 尤诺分类）", () => {
    // 跨列卡压过的两列底部必然相等 ⇒ 只按「两列差最小」选会永远选中同一对，
    // 几十张横图全挤在左边、右侧整片空白。这里钉住「会轮转」这个行为。
    const result = packMasonry(items(Array(10).fill(LANDSCAPE)), 5, 1024);
    const usedColumns = new Set(result.placements.map((p) => p.column));

    expect(usedColumns.size).toBeGreaterThanOrEqual(2);

    let run = 1;
    let longest = 1;
    for (let i = 1; i < result.placements.length; i += 1) {
      run = result.placements[i]!.column === result.placements[i - 1]!.column ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(2);
  });

  it("一列时不跨列（跨列等于整行，无意义）", () => {
    const result = packMasonry(items([LANDSCAPE]), 1, 300);
    expect(result.placements[0].span).toBe(1);
  });

  it("两列避洞：横屏卡等竖屏卡把另一列填平后再放", () => {
    // m0 竖屏铺满左列 → 右列空出一整张卡的高度；m1 横屏先暂存；
    // m2 竖屏落进右列最低点，两列齐平后才放 m1。
    const result = packMasonry(items([PORTRAIT, LANDSCAPE, PORTRAIT]), 2, 390);
    const [first, wide, filler] = result.placements;
    const portraitHeight = masonryCardHeight(result.columnWidth, PORTRAIT);

    expect(filler.column).toBe(1);
    expect(filler.top).toBe(0);
    expect(wide.span).toBe(2);
    expect(wide.top).toBeCloseTo(portraitHeight + MASONRY_GAP);
    expect(first.top).toBe(0);
  });

  it("两列避洞：填进去反而更不齐时立即放横屏卡，不会越填越歪", () => {
    // 左列先垫很高，后面的单列卡比剩余缺口矮：第二张再填就会 overshoot。
    const tallPortrait = PORTRAIT * 1.4;
    const result = packMasonry(items([tallPortrait, LANDSCAPE, PORTRAIT, PORTRAIT]), 2, 390);
    const wide = result.placements[1];
    const tallHeight = masonryCardHeight(result.columnWidth, tallPortrait);

    // 横屏卡只等了 1 张单列卡就放（第二张单列卡会把它撑得更不齐）
    const othersBefore = result.placements.filter(
      (p) => p.span === 1 && p.top < wide.top,
    );
    expect(othersBefore.length).toBeLessThanOrEqual(MASONRY_MAX_WIDE_DELAY);
    expect(wide.top).toBeGreaterThan(0);
    expect(wide.top).toBeGreaterThanOrEqual(tallHeight);
  });

  it("两列避洞：连续横屏卡先降级铺满空列，两列齐平后再跨列", () => {
    const result = packMasonry(items([PORTRAIT, LANDSCAPE, LANDSCAPE, LANDSCAPE]), 2, 390);

    expect(result.placements.every((p, i) => p.id === `m${i}`)).toBe(true);
    // 第一张横屏卡遇到两列差（右列还是空的）⇒ 降级成单列，落在右列顶部
    expect(result.placements[0].top).toBe(0);
    expect(result.placements[1].span).toBe(1);
    expect(result.placements[1].top).toBe(0);
    // 后续总有一张横屏卡在两列齐平后跨列
    expect(result.placements.some((p) => p.span === 2)).toBe(true);
  });

  it("两列避洞：输出顺序仍与输入一致（只是纵坐标延后）", () => {
    const result = packMasonry(
      items([PORTRAIT, LANDSCAPE, PORTRAIT, LANDSCAPE, PORTRAIT]),
      2,
      390,
    );
    expect(result.placements.map((p) => p.id)).toEqual(ids(5));
    // 延后不会让任何两个单列卡重叠
    const byColumn = new Map<number, typeof result.placements>();
    for (const placement of result.placements) {
      if (placement.span !== 1) continue;
      const list = byColumn.get(placement.column) ?? [];
      list.push(placement);
      byColumn.set(placement.column, list);
    }
    for (const list of byColumn.values()) {
      for (let i = 1; i < list.length; i += 1) {
        const prev = list[i - 1];
        const current = list[i];
        const prevHeight = masonryCardHeight(result.columnWidth, PORTRAIT);
        expect(current.top).toBeGreaterThanOrEqual(prev.top + prevHeight + MASONRY_GAP - 1e-6);
      }
    }
    expect(MASONRY_HOLE_TOLERANCE).toBeGreaterThan(0);
  });

  it("接近正方的图不跨列", () => {
    const nearSquare = (MASONRY_WIDE_RATIO + 1) / 2;
    expect(packMasonry(items([nearSquare]), 5, 1024).placements[0].span).toBe(1);
  });

  it("近方形（尤诺常见的 393×349 ≈ 1.126）不算横屏", () => {
    // 这类图若跨两列，5 列会被迫空出一整列；见 MASONRY_WIDE_RATIO 的注释
    expect(packMasonry(items([393 / 349]), 5, 1024).placements[0].span).toBe(1);
  });

  it("5:4 及更宽才算横屏，跨两列", () => {
    expect(packMasonry(items([5 / 4]), 5, 1024).placements[0].span).toBe(2);
  });

  it("近方形为主的列表在 5 列下能铺满所有列（尤诺分类回归）", () => {
    const ratios = Array.from({ length: 20 }, (_, i) => (i % 4 === 0 ? PORTRAIT : 393 / 349));
    const result = packMasonry(items(ratios), 5, 1024);

    expect(result.placements.every((p) => p.span === 1)).toBe(true);
    expect(new Set(result.placements.map((p) => p.column)).size).toBe(5);
  });

  it("容器高度 = 最高列的底部减去末尾间距", () => {
    const result = packMasonry(items(Array(7).fill(PORTRAIT)), 3, 700);
    const singleHeight = masonryCardHeight(result.columnWidth, PORTRAIT);
    // 7 张：3 / 2 / 2 分配，最高列 3 张
    expect(result.height).toBeCloseTo(singleHeight * 3 + MASONRY_GAP * 2);
  });

  it("同一列里的卡片不重叠（单列）", () => {
    const result = packMasonry(items(Array(9).fill(PORTRAIT)), 3, 700);
    const byColumn = new Map<number, typeof result.placements>();
    for (const placement of result.placements) {
      const list = byColumn.get(placement.column) ?? [];
      list.push(placement);
      byColumn.set(placement.column, list);
    }
    for (const list of byColumn.values()) {
      for (let i = 1; i < list.length; i += 1) {
        const prev = list[i - 1];
        const current = list[i];
        const prevHeight = masonryCardHeight(result.columnWidth, PORTRAIT);
        expect(current.top).toBeGreaterThanOrEqual(prev.top + prevHeight + MASONRY_GAP - 1e-6);
      }
    }
  });

  it("横向也不越界：跨列卡的左偏移 + 宽度不超过容器", () => {
    const containerWidth = 1024;
    const result = packMasonry(items([PORTRAIT, LANDSCAPE, PORTRAIT, LANDSCAPE]), 5, containerWidth);
    for (const placement of result.placements) {
      const left = masonryColumnLeft(placement.column, result.columnWidth);
      const width = masonrySpanWidth(placement.span, result.columnWidth);
      expect(left + width).toBeLessThanOrEqual(containerWidth + 1e-6);
    }
  });

  it("输出的 id 与输入一一对应且顺序不变", () => {
    const result = packMasonry(items([PORTRAIT, LANDSCAPE, PORTRAIT]), 4, 900);
    expect(result.placements.map((p) => p.id)).toEqual(ids(3));
  });
});

describe("packMasonry 不留大洞", () => {
  /**
   * 返回同列相邻两张卡之间最大的空隙。
   *
   * 洞只可能由横屏卡跨列产生：它的顶边取两列的 `max(bottom)`，较短那列从自己的底
   * 到这个顶之间就空出来一块。2026-10-20 线上实测手机端出现过 562px 的洞。
   */
  const maxHole = (ratios: number[], columns: number, containerWidth: number) => {
    const result = packMasonry(items(ratios), columns, containerWidth);
    const byColumn = new Map<number, { top: number; height: number }[]>();

    for (const placement of result.placements) {
      const ratio = ratios[Number(placement.id.slice(1))]!;
      const width = masonrySpanWidth(placement.span, result.columnWidth);
      const height = masonryCardHeight(width, ratio);
      // 跨列卡同时占据它压住的那几列
      for (let column = placement.column; column < placement.column + placement.span; column += 1) {
        const list = byColumn.get(column) ?? [];
        list.push({ top: placement.top, height });
        byColumn.set(column, list);
      }
    }

    let worst = 0;
    for (const list of byColumn.values()) {
      list.sort((a, b) => a.top - b.top);
      for (let i = 1; i < list.length; i += 1) {
        const hole = list[i]!.top - (list[i - 1]!.top + list[i - 1]!.height) - MASONRY_GAP;
        worst = Math.max(worst, hole);
      }
    }
    return worst;
  };

  // 取自 2026-10-20 线上真实比例：心-琳琅 1.61 / 丰汝肥屯 2.86 / 心-圣诞 0.5 …
  const REAL_RATIOS = [1.61, 2.94, 2.35, 2.56, 0.5, 0.53, 0.7, 0.63, 2.0, 1.34, 0.47, 2.35, 0.66, 1.61];

  it("手机 2 列：竖图横图混排不留超过阈值的洞", () => {
    expect(maxHole(REAL_RATIOS, 2, 360)).toBeLessThanOrEqual(MASONRY_WIDE_MAX_HOLE + 1e-6);
  });

  it("桌面 5 列：同样不留大洞", () => {
    expect(maxHole(REAL_RATIOS, 5, 1128)).toBeLessThanOrEqual(MASONRY_WIDE_MAX_HOLE + 1e-6);
  });

  it("全是横图时也不会集体留洞", () => {
    const wide = Array.from({ length: 12 }, (_, i) => 1.6 + (i % 3) * 0.4);
    expect(maxHole(wide, 2, 360)).toBeLessThanOrEqual(MASONRY_WIDE_MAX_HOLE + 1e-6);
  });

  it("横图夹在竖图中间（最难对齐的情况）", () => {
    const ratios = [0.5, 0.9, 2.8, 0.55, 0.52, 2.9, 0.48, 0.6, 1.7, 0.5];
    expect(maxHole(ratios, 2, 360)).toBeLessThanOrEqual(MASONRY_WIDE_MAX_HOLE + 1e-6);
  });
});
