# Product Requirements Document: 修复瀑布流滚动抖动

**Version**: 1.0
**Date**: 2026-07-30
**Author**: Sarah (Product Owner)
**Quality Score**: 94/100

---

## Executive Summary

当前 `/mods` 页面瀑布流模式使用 CSS `columns` 实现。每次无限滚动加载新 mod 后，浏览器为保持列平衡会重新分配所有卡片位置，导致已显示的卡片跳变（跨列移动）。这严重破坏浏览体验——用户视线跟踪的卡片突然消失或跳到其他位置。

本次修复将 CSS columns 替换为基于绝对定位的 JS masonry 方案，确保新内容追加后已有卡片位置完全不变（零抖动），同时保留现有 framer-motion 入场动画。

---

## 问题陈述

**当前情况**: 瀑布流使用 CSS `columns-[220px]` + `[column-fill:balance]`。浏览器在内容变化时重排所有卡片到各列，产生视觉抖动。

**解决方案**: 采用 JS 计算卡片位置（绝对定位或列分配），新卡片插入时不影响已有卡片布局。

**影响范围**: 主 `/mods` 页面的瀑布流模式；网格模式不受影响。

---

## 成功指标

- **零抖动**: 加载新页后，已有卡片位置完全不变（像素级验证）
- **动画保留**: framer-motion `MotionReveal` 入场动画正常工作
- **性能**: 100+ 卡片渲染不卡顿，滚动帧率 ≥ 50fps
- **切换无损**: grid/masonry 工具栏切换流畅，不影响用户体验

---

## 用户故事

### Story 1: 瀑布流浏览无抖动

**作为** mod 浏览者
**我想** 在瀑布流中向下滚动加载更多 mod 时，已经看到的卡片保持不动
**以便** 我不丢失浏览位置，可以连续顺畅地浏览

**验收标准:**
- [ ] 滚动触发加载后，已有卡片水平、垂直位置均不变
- [ ] 新卡片在已有卡片下方自然出现
- [ ] 各列高度可略有差异（不强制平衡）

### Story 2: 保留入场动画

**作为** mod 浏览者
**我想** 新加载的卡片以优雅的方式入场
**以便** 加载体验不生硬，视觉连贯

**验收标准:**
- [ ] 新卡片以 fade-in + 微旋转动画出现
- [ ] 已有卡片动画不重播
- [ ] 动画流畅不卡顿

---

## 功能需求

### 核心功能: JS Masonry 布局

**描述**: 用 JS 计算每张卡片的列归属，消除 CSS columns 的重排问题。

**实现要点:**
- 监听容器宽度变化，计算列数 = `Math.floor(containerWidth / 220)`
- 每列维护高度累加器，新卡片放入当前最短列
- 卡片渲染后更新该列高度
- 新数据追加：已有卡片列归属不变，新卡片从当前列高度继续分配

**边界情况:**
- 窗口 resize：重新计算列数，卡片可能重排（可接受）
- 卡片图片加载后高度变化：需要二次校正位置
- 筛选条件变化导致 mods 数组重置：正常全部重排

**错误处理:**
- 布局计算不影响卡片内容渲染，错误时降级为单列

### 功能: 与现有架构集成

**描述**: 替换 `ModsInfiniteGrid` 中的 masonry 分支，grid 模式保持不变。

**组件关系:**
- `ModsInfiniteGrid` — 唯一需要修改的文件
- `ModCard` — 不变
- `MotionReveal` — 保留，包裹每张卡片
- `ModsToolbar` — 不变，layout toggle 继续工作

### 不包含

- 游戏特定 mod 页面 (`/[game]/mods`) 瀑布流修复（后续版本）
- 图片加载后高度校正（Phase 2）

---

## 技术约束

### 方案选型

推荐 **自实现轻量 masonry**（非第三方库），原因:
- 需求简单（列分配 + 高度追踪），不需要完整 masonry 库
- 零依赖开销，打包体积不受影响
- 完全控制动画时序（先用 framer-motion `layoutId` 或 snapshot 旧位置）
- CSS columns 和 CSS grid 的局限性是此问题的根因，JS 方案最可控

**核心思路:**
```
列数 = Math.floor(containerWidth / columnWidth)
对于已有卡片 → 保持旧列索引 + 旧位置
对于新卡片 → 放入当前最短列
渲染时用 CSS transform 或 grid 定位
```

### 性能

- 列高度计算 O(n)，n 为卡片总数
- 100 张卡片计算耗时 < 1ms
- 使用 `useMemo` 缓存布局计算结果
- 避免 layout thrashing：批量读 DOM，批量写 style

### 集成

- 仅修改 `ModsInfiniteGrid.tsx`
- 保持 `useInfiniteQuery` 数据流不变
- 保持 `IntersectionObserver` sentinel 逻辑不变
- 保持 `ModCard` 和 `MotionReveal` 接口不变

---

## MVP 范围

- `ModsInfiniteGrid.tsx` masonry 分支替换为 JS 布局
- 新卡片位置正确，已有卡片不跳变
- `MotionReveal` 入场动画保留
- Grid 模式不变（CSS grid 继续使用）
- 工具栏 layout toggle 正常

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| 图片加载后高度变化导致位置偏移 | 高 | 中 | 用已知宽高比预计算占位高度；Phase 2 加 ResizeObserver 校正 |
| JS 布局性能劣于 CSS columns | 低 | 中 | 列分配算法 O(n) 极轻量；如遇问题加 `requestAnimationFrame` 节流 |
| 自实现方案 edge case 遗漏 | 中 | 低 | 参考 `masonic` 等成熟库的实现；加单元测试覆盖列分配逻辑 |

---

## 附录

### 术语

- **瀑布流 (Masonry)**: 多列不等高布局，卡片自上而下填充最短列
- **CSS columns**: 浏览器原生多列布局，自动平衡列高
- **重排 (Reflow)**: 浏览器重新计算元素位置和尺寸，常见于 DOM 变化

### 关键文件

- `src/components/features/mods/list/mods-infinite-grid.tsx` — 主要修改目标
- `src/components/common/mod-card.tsx` — 不变
- `src/components/features/mods/list/mods-page-client.tsx` — 不变
