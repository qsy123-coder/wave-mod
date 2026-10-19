# Product Requirements Document: 手机端瀑布流横屏卡等比放大

**Version**: 1.0
**Date**: 2026-10-19
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

手机端 2 列瀑布流里，竖屏卡（171×约 350 CSS）在视觉重量上明显压过横屏卡（171×约 130 CSS）。原因是 2026-10-19 的 `91123a42` 为了避免「一行只显示一个卡片」，把跨列条件收紧为「至少 3 列才允许跨列」，于是 2 列手机布局下横屏卡不再等比放大。

本次让 2 列的横屏卡恢复为「跨两列 = 358 CSS 宽」，并在打包算法里加入**智能避洞**：横屏卡在两列底部不齐时最多延后 3 张卡片再放，优先把空洞填平。目标是恢复横屏卡的视觉存在感，同时保持瀑布流整体紧凑、不出现明显空白块。

---

## Problem Statement

**Current Situation**

- 手机 2 列瀑布流中所有卡同宽（约 171 CSS）。
- 竖屏预览多为 9:16，卡高约 300–360px；横屏预览多为 4:3/16:9，卡高只有 120–180px。
- 视觉上竖屏卡「又高又大」，横屏卡像缩略图，浏览节奏失衡。

**Proposed Solution**

- 2 列布局下，横屏卡（宽高比 > 1.1）恢复跨两列，宽度 171→358 CSS，高度按比例同步放大。
- 打包器在两列底部高度差超过阈值时，延后横屏卡（最多 3 张），先放入后续竖屏卡把两列填平，再放横屏卡，减少空洞。
- 延后只影响横屏卡自身的出现位置，其它卡片相对顺序不变。

**Business Impact**

- 横屏预览恢复可读性，减少用户因「横屏卡看不清」而滑过的行为。
- 保持瀑布流紧凑，不因放大横屏卡产生大块空白，维持首屏信息密度。

---

## Success Metrics

**Primary KPIs（可量化、上线后 3 天回归）**

1. 手机 390 CSS 视口下，横屏卡渲染宽度 = 容器宽（358px）且高度按原图比例计算，误差 ≤ 2px。
2. 2 列瀑布流中，任意两列底部高度差的**可见空洞** ≤ 40px（逐屏采样 ≥ 20 屏）。
3. 横屏卡因避洞被延后的数量 ≤ 3 张/次，且全局顺序位移 ≤ 3 位。

**Validation**

- 用 CDP 在 390×844 @3x 下量卡片宽度与各列底部坐标。
- 单测覆盖 `packMasonry` 的跨列与延后分支。

---

## User Personas

### Primary: 手机端浏览用户
- **Role**: 在手机上快速浏览新资源的玩家
- **Goals**: 一眼看清每张预览图，快速判断要不要点开
- **Pain Points**: 横屏预览太小，需点开详情才能看清
- **Technical Level**: 普通用户

---

## User Stories & Acceptance Criteria

### Story 1: 横屏卡恢复等比放大

**As a** 手机端用户
**I want to** 在 2 列瀑布流里看到更大的横屏预览
**So that** 不用点进详情页就能看清内容

**Acceptance Criteria:**
- [ ] 390 CSS 视口、2 列布局下，宽高比 > 1.1 的卡片跨两列，宽度 = 容器宽度（约 358px）。
- [ ] 横屏卡高度按原图比例计算（`masonryCardHeight`），不裁切、不拉伸。
- [ ] 宽高比 ≤ 1.1 的卡片仍为单列宽（约 171px）。
- [ ] 1 列布局、3 列及以上布局行为与现在一致（≥3 列原本就跨列）。

### Story 2: 智能避洞

**As a** 手机端用户
**I want to** 瀑布流两列底部保持齐平
**So that** 放大横屏卡后不出现大块空白

**Acceptance Criteria:**
- [ ] 横屏卡待摆放时，若两列底部高度差 ≤ 阈值（`MASONRY_HOLE_TOLERANCE`，建议 24px），立即摆放。
- [ ] 若高度差 > 阈值，且后面仍有单列卡：先放单列卡到较短列，横屏卡延后，最多延后 3 张。
- [ ] 延后预算用尽或后面没有单列卡时，横屏卡照常摆放，不阻塞渲染。
- [ ] 除被延后的横屏卡外，其余卡片相对顺序保持不变。
- [ ] 页面底部不因避洞逻辑多出空白行。

### Story 3: 不能影响桌面

**As a** 桌面端用户
**I want to** 桌面 5 列瀑布流保持现状
**So that** 本次改动不引入桌面回归

**Acceptance Criteria:**
- [ ] 桌面（≥768px）5 列布局的卡片宽度、位置与改动前逐像素一致。
- [ ] 现有 `masonry-packing.test.ts` 中桌面相关断言继续通过。

---

## Functional Requirements

### Core Features

**Feature 1: 恢复 2 列跨列**
- Description: `packMasonry` 的 `wide` 条件恢复为 `columns >= 2 && ratio > MASONRY_WIDE_RATIO`。
- Edge cases:
  - 只有 1 列：不跨列（跨列等于整行，无意义）。
  - 全部卡片都是横屏：顺序摆放，每张独占一行，不允许无限延后。
  - 图片比例尚未上报（默认 0.75）：按单列摆放，比例到达后重排。

**Feature 2: 智能避洞（延后策略）**
- Description: 摆放横屏卡前检查两列底部高度差；超阈值时把横屏卡暂存，先放后续单列卡，最多延后 3 张。
- User flow: 顺序遍历 → 遇到横屏卡 → 判断 Δ → 若 Δ 过大则暂存、继续下一条 → 后续单列卡填入较短列 → 重试暂存卡 → 预算用尽强制摆放。
- Edge cases:
  - 连续多张横屏卡：每张独立计算；暂存队列长度上限 3。
  - 触发无限滚动追加数据：已摆放坐标不重算，新数据继续从当前 bottoms 开始。
  - 窗口旋转/列数切换：整体重新打包（现有行为）。

### Out of Scope
- 不裁切、不拉伸预览图。
- 不改变图片源尺寸与清晰度策略（库存预览图 458–750px 的上限维持现状）。
- 不改桌面 5 列布局。
- 不改卡片内部信息区（标题、标签、互动栏）。

---

## Technical Constraints

### Performance
- `packMasonry` 为纯函数，复杂度控制在 O(n × K)，K = 最大延后数（3）。
- 不新增网络请求，不改变图片档位逻辑。

### Integration
- 修改文件：
  - `src/components/features/mods/list/masonry-packing.ts`（打包规则）
  - `src/components/features/mods/list/masonry-packing.test.ts`（单测）
  - `src/components/features/mods/list/mods-infinite-grid.tsx`（如需要，暴露延后参数；默认值写在 packing 模块）
- 影响范围：所有 2 列瀑布流——手机首页、`/mods`、角色页（共用同一打包器）。
- 恢复 `91123a42` 中「2 列不跨列」的注释与单测，改写为本次规则。

### Technology Stack
- 现有 Next.js + TypeScript，无新增依赖。
- 图片宽度 `sizes` 已按布局真实宽度计算（`264b4681`），跨列后自动请求 800 档。

---

## MVP Scope & Phasing

### Phase 1: MVP
- 2 列恢复跨列。
- 延后避洞（阈值 24px、最多 3 张）。
- 单测 + 手机端 CDP 实测。

### Phase 2: 观测与调参
- 上线后观察实际排布；如空洞仍明显，调整阈值/延后上限。
- 如需只作用于首页，再增加开关（本期不做）。

### Future Considerations
- 3 列及以上布局的避洞策略。
- 更高分辨率预览图（需原始文件，当前不在本范围）。

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| 横屏卡跨列后更糊（358 CSS @3x 需 ~1074 设备像素，库存图 ≤750） | 高 | 中 | 用户已接受源图上限；本 PRD 明确记录该副作用 |
| 延后导致用户看到「发布顺序不对」 | 中 | 低 | 最多 3 张；只延后横屏卡；保留其余顺序 |
| 两列高度差很难完全对齐，仍留小空洞 | 高 | 低 | 用 24px 容忍阈值，优先减少大洞而非消灭所有小洞 |
| 影响 `/mods` 与角色页 | 高 | 中 | 共用打包器，需回归三个页面；如需隔离再加开关 |

---

## Dependencies & Blockers

**Dependencies:**
- `mod-card.tsx` 的 `sizes` 已按真实布局宽度计算（已完成）。
- 预览图宽高比通过 `onImageRatioChange` 上报（现有能力）。

**Known Blockers:**
- 无。

---

## Appendix

### Glossary
- **横屏卡**: 预览图宽高比 > 1.1 的卡片。
- **跨列**: 在 N 列瀑布流中占 2 列宽。
- **空洞**: 跨列卡摆放时，较短一列在其底部与跨列卡顶部之间留下的空白。
- **延后**: 横屏卡不按原顺序立即摆放，而是先放后续单列卡。

### References
- 历史提交 `91123a42`（2 列禁用跨列的原因）
- `src/components/features/mods/list/masonry-packing.ts`
- `docs/mobile-home-redesign-prd.md`

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
