import { describe, expect, it } from "vitest";

import {
  MASONRY_CARD_CHROME,
  MASONRY_GAP,
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

  it("两列及以下不跨列（否则等于整行，一行只剩一张卡）", () => {
    for (const columns of [1, 2]) {
      const result = packMasonry(items([LANDSCAPE, LANDSCAPE]), columns, 390);
      expect(result.placements.every((p) => p.span === 1)).toBe(true);
    }
    // 两列时单列宽必须小于容器，证明没有占满整行
    const twoCols = packMasonry(items([LANDSCAPE]), 2, 390);
    expect(twoCols.columnWidth).toBeLessThan(390);
  });

  it("接近正方的图不跨列", () => {
    const nearSquare = (MASONRY_WIDE_RATIO + 1) / 2;
    expect(packMasonry(items([nearSquare]), 5, 1024).placements[0].span).toBe(1);
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
