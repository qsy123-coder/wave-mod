# Product Requirements Document: 瀑布流按真实封面比例排版（消除骨架屏方向错误与加载抖动）

**Version**: 1.0
**Date**: 2026-10-27
**Author**: Sarah (Product Owner)
**Quality Score**: 93/100

---

## Executive Summary

角色分类页（`/mods?character=<角色>`）在无缓存状态下，骨架屏结束后卡片会**明显抖动**：先是整版竖屏卡片，图片陆续加载后逐批重排，横屏卡再横跨两列，最后列数还会从 5 列跳到 4 列。同时骨架屏本身**方向是错的** —— 某位置最终落下的是横屏大卡，骨架却是竖屏占位。

根因是同一个：**排版前拿不到图片宽高比**。服务端只有 URL，比例要等图片 `load` 之后由客户端测量，于是瀑布流只能先按兜底 `3/4` 竖屏排一遍，等真实比例回来再重排。

本方案把封面宽高比**存进数据库**，随 API 和兜底快照一起下发。首帧即可用真实比例排版，列数、跨列、每张卡高度一次算对：卡片落地后不再重排，骨架屏也能按该角色的实际横竖占比渲染。修复覆盖全站所有使用瀑布流的列表页（`/mods`、角色分类、游戏分站）。

---

## Problem Statement

**Current Situation**
- `packMasonry` 依赖图片宽高比；首帧 `ratios` 为空 ⇒ 全部按 `MASONRY_DEFAULT_RATIO = 3/4` 打包。
- 图片加载后每 120ms 批量提交比例 ⇒ 整表重排；横屏占比 ≥ 55% 时 `colCount` 由 5 降为 4 ⇒ 第二次大重排。
- `MasonryCardSkeleton` 的高度取自 `["3/4","4/5","5/6","2/3","3/5"]`，**全是竖屏**，且使用比例为空的 5 列。

**Proposed Solution**
- `mods` 表新增封面尺寸字段（宽/高），随 `publicModColumns`、`/api/mods`、兜底快照下发。
- 瀑布流比例来源优先级改为「库内比例 → 实测比例 → 兜底 3/4」。
- 骨架屏按角色的横屏占比提示渲染（横屏为主 ⇒ 偶数列 + 跨两列的大卡）。

**Business Impact**
- 首屏视觉稳定，不再出现「先看一眼错的版式再跳」的观感问题。
- 滚动容器总高度首帧即正确，减少滚动锚定跳变。

---

## Success Metrics

**Primary KPIs**
- 绯雪分类页无缓存硬刷：卡片落地后**位置不再变化**（列数不再 5→4 跳变）。
- 骨架屏卡片数、列数、每张卡的横竖方向与最终卡片一致。

**Validation**
- 线上无缓存硬刷（DevTools 关缓存）逐帧观察 + 首屏截图对比。
- 单测：`masonry-packing.test.ts` 用真实比例直接驱动，验证列数/跨列结果稳定。

---

## User Personas

### Primary: 浏览外观资源的玩家
- **Goals**: 快速浏览某角色的资源，看图决定下载。
- **Pain Points**: 加载时卡片乱跳，眼睛跟不上；骨架屏暗示竖图但出来是横图。
- **Technical Level**: 普通用户，不会关心技术细节，只会觉得「网站卡/晃」。

---

## User Stories & Acceptance Criteria

### Story 1: 首帧版式即终态
**As a** 浏览某角色资源的玩家
**I want to** 骨架屏结束后卡片直接落在最终位置
**So that** 不用经历一次「整版重排」

**Acceptance Criteria:**
- [ ] 无缓存硬刷，卡片出现后位置不再变化（含列数不变）
- [ ] 横屏卡在首帧就横跨两列
- [ ] 库内缺比例的老数据回退到现有行为，不报错

### Story 2: 骨架屏方向正确
**As a** 玩家
**I want to** 骨架屏的横竖方向与即将出现的卡片一致
**So that** 加载过程不显得「错版」

**Acceptance Criteria:**
- [ ] 横屏为主的角色（如绯雪）：骨架为偶数列 + 每张跨两列
- [ ] 竖屏为主的角色：骨架维持现有竖屏形态
- [ ] 未知/混合占比：退回现有形态，不出现新的跳变

---

## Functional Requirements

**Feature 1: 封面尺寸字段**
- `mods.cover_width` / `mods.cover_height`（int，可空），另行记录 `cover_source`（计算该尺寸时对应的封面 URL）用于幂等同步。
- 回填：从 COS 图片元数据（`?imageInfo`）读取；失败（404/451/非 COS 源）留空。
- 新增 `scripts/cover-size.mjs`：算尺寸 + 幂等同步（只处理 `cover_source != images[1]` 的行）。
- 每日上传脚本与换图脚本入库后调用同步。

**Feature 2: 下发链路**
- `publicModColumns` 与 `scripts/mods-snapshot.sql` 增加两列（**只加不改**，JASM 读不到字段不影响）。
- `mapMod` 输出 `coverWidth` / `coverHeight`。

**Feature 3: 排版**
- `packItems` 比例优先级：库内 → 实测 → 3/4。
- 骨架屏按角色横屏占比提示渲染。

**Out of Scope**
- 首页轮播、详情抽屉、后台列表的图片布局。
- 修改 `MASONRY_WIDE_RATIO` / `MASONRY_WIDE_DOMINANT_SHARE` 等版式常量。

---

## Technical Constraints

### Performance
- 首屏 payload 每条多 2 个整数字段；快照 gzip 增量可忽略。
- 回填是一次性离线任务。

### Security
- 无新用户输入；字段仅服务端写入。

### Integration
- **JASM 桌面端**共用兜底快照：**只加字段、不动旧字段**，未知字段会被忽略。
- 兜底快照解码层不做逐行 schema 校验，缺字段即回退。

---

## MVP Scope & Phasing

### Phase 1: MVP
- 建列 + 回填 + 下发 + 排版优先级 + 骨架屏提示。

### Phase 2
- 上传脚本自动写（与 MVP 同步完成，避免产生新的空比例行）。

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| 回填时 COS 请求量大、部分失败 | 中 | 低 | 失败留空，回退现有行为；可重跑 |
| 快照字段变更影响 JASM | 低 | 中 | 只加字段；JASM 不读未知字段 |
| 尺寸与实际渲染比例不符（缺图/占位图） | 低 | 低 | 实测比例仍会覆盖，且不触发重排（同值去重） |

---

## Appendix

### Glossary
- **兜底比例**: 图片比例未知时使用的 `3/4`。
- **横屏为主**: 横屏卡占比 ≥ 55%（`MASONRY_WIDE_DOMINANT_SHARE`）。
