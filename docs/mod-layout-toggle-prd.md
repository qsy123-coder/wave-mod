# Product Requirements Document: Mod 布局切换

**Version**: 1.0
**Date**: 2026-07-23
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

角色分类页（`/mods`）当前使用固定宽高比的 CSS Grid 网格布局展示 Mod 卡片。由于 Mod 封面图分辨率不统一（1400px / 1600px 高度等），固定 `aspect-[4/5]` 容器导致部分图片显示不完整。本需求在现有网格布局基础上增加一个**瀑布流自适应布局**选项——参考 `/gallery` 图库页面的布局方式，每张卡片保持图片原始宽高比，行高随内容自然变化。

用户可通过工具栏的切换按钮在两种布局间切换，偏好存入 localStorage 持久化。默认保持现有网格布局，确保现有用户不受影响。

---

## Problem Statement

**当前问题**：Mod 卡片使用统一的 `aspect-[4/5]` 宽高比容器 + `object-cover` 裁剪，导致 1600px 高度图片在垂直方向被裁切，用户无法看到完整封面。

**解决方案**：新增瀑布流布局模式，每张卡片根据图片原始比例自适应高度，消除裁剪问题。同时保留现有网格布局作为默认选项，尊重用户习惯。

**商业影响**：提升 Mod 封面展示质量 → 增加用户浏览时长和点击率；布局偏好数据可为后续 UI 优化提供参考。

---

## Success Metrics

- 新布局模式下 Mod 卡片点击率 ≥ 现有网格布局
- 布局切换按钮点击率（用于衡量功能发现率）
- 无性能退化：瀑布流布局下页面加载/滚动帧率 ≥ 50fps
- 布局偏好留存率（localStorage 持久化有效性）

---

## User Personas

### Primary: Mod 浏览者
- **角色**: 鸣潮玩家，通过角色分类浏览 Mod
- **目标**: 快速预览 Mod 封面，找到喜欢的 Mod 下载
- **痛点**: 部分 Mod 封面被裁切，看不清完整效果
- **技术水平**: 普通用户

---

## User Stories & Acceptance Criteria

### Story 1: 切换布局模式

**As a** Mod 浏览者
**I want to** 在网格布局和瀑布流布局之间切换
**So that** 我可以选择更适合自己的浏览方式

**Acceptance Criteria:**
- [ ] 工具栏区域显示布局切换按钮（两个图标：网格 / 瀑布流）
- [ ] 点击按钮即时切换布局模式
- [ ] 当前激活的布局按钮高亮显示
- [ ] 切换有平滑过渡动画
- [ ] 切换后滚动位置保持不变

### Story 2: 布局偏好持久化

**As a** 回访用户
**I want to** 刷新页面后保持我上次选择的布局
**So that** 我不需要每次都重新切换

**Acceptance Criteria:**
- [ ] 布局选择存入 localStorage
- [ ] 页面加载时读取 localStorage 恢复布局偏好
- [ ] 首次访问（无缓存）默认使用网格布局
- [ ] 清除浏览器数据后回退到默认网格布局

### Story 3: 瀑布流布局浏览

**As a** Mod 浏览者
**I want to** 在瀑布流布局中看到完整的 Mod 封面
**So that** 图片不再被裁切

**Acceptance Criteria:**
- [ ] 卡片保持图片原始宽高比（不再强制 `aspect-[4/5]`）
- [ ] 列数根据视口宽度自动计算（最小卡片宽度 ~220px）
- [ ] 每行高度由该行最高卡片决定，同行卡片垂直居中
- [ ] 保持完整卡片信息（标题、角色、评分、统计）
- [ ] 无限滚动正常加载下一页

---

## Functional Requirements

### 布局切换按钮

- **位置**：Mod 列表工具栏内，排序方式右侧
- **样式**：两个图标按钮——网格图标（当前默认） + 瀑布流图标
- **交互**：点击切换，当前选中按钮高亮

### 网格布局（现有，默认）

- CSS Grid + 固定宽高比卡片
- 列数：sm:3, lg:3, xl:5
- 保持不变，不修改

### 瀑布流布局（新增）

- **列数计算**：`cols = max(1, min(7, floor((viewport - gap) / (220 + gap))))`
- **卡片宽度**：`boxWidth = (viewport - gap - cols * gap) / cols`
- **卡片高度**：根据图片原始宽高比自动计算 `height = boxWidth / aspectRatio + 内容区高度`
- **行高**：同一行取最高卡片高度，其余卡片垂直居中
- **实现方式**：CSS `column-count` 或纯 CSS Grid `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` + `masonry` 或 JS 辅助计算（避免引入 Gallery 的全量命令式 DOM 方案）
- **卡片内容**：保留完整 ModCard（标题、角色标签、评分、浏览/收藏数）

### 状态持久化

- Key: `mod-layout-preference` → 值: `"grid"` | `"masonry"`
- 读取时机：组件挂载时
- 写入时机：用户切换时
- 默认值：`"grid"`

### 适用范围

- 仅主站 `/mods` 角色分类页
- 不包含游戏分站（`/[game]/mods`）

### 无限滚动

- 保持现有分页策略（每页 16 条）
- IntersectionObserver 哨兵逻辑不变
- 瀑布流模式下哨兵位置可能需要调整（因总高度变化）

---

## Technical Constraints

### 性能

- 瀑布流模式下列数上限 7 列，避免过多 DOM 节点
- 使用 CSS-based 方案优先（`grid-template-columns: repeat(auto-fill, ...)`），而非全量 JS 布局计算
- 卡片仍使用 Next.js `Image` 优化加载

### 实现方案

- **推荐方案**：CSS `columns` 或 `grid` + `masonry`（若浏览器支持），辅以轻量 JS 计算行高对齐
- **不推荐**：完整复用 Gallery 的命令式 DOM + 弹簧物理方案——过于复杂且与 React 渲染模型冲突
- 过渡动画使用 CSS `transition` 处理卡片尺寸变化

### 兼容性

- 支持主流浏览器（Chrome, Firefox, Safari, Edge）
- 响应式：移动端列数自动减少

---

## MVP Scope

### Phase 1: MVP
1. 工具栏添加布局切换按钮
2. 实现瀑布流布局（CSS-based）
3. localStorage 持久化
4. 无限滚动兼容瀑布流模式

### Phase 2: 增强
- 布局切换过渡动画优化
- 用户偏好数据分析
- 扩展至游戏分站

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| CSS `masonry` 浏览器兼容性不足 | 中 | 中 | 降级为 JS 辅助计算或用 `columns` 方案 |
| 瀑布流模式下无限滚动触发时机异常 | 低 | 中 | 调整哨兵 margin，充分测试 |
| 图片原始尺寸未知导致高度计算不准 | 中 | 低 | 前端预设 fallback 宽高比（4:5），实际加载后更新 |

---

## Dependencies

- `ModCard` 组件已支持通过 `imageAspectClassName` prop 覆盖宽高比
- `ModsInfiniteGrid` 和 `ModsPageClient` 为客户端组件，可直接添加状态管理
- Gallery 布局逻辑可参考但不可直接复用（命令式 DOM vs React 渲染路径不同）

---

*本 PRD 通过交互式需求采集和质量评分（91/100）生成，确保覆盖业务、功能、UX 和技术维度。*
