# Product Requirements Document: 后台管理布局重构

**Version**: 1.0
**Date**: 2026-07-23
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

当前后台管理（`/admin/*`）使用独立的自定义导航栏和列表式布局，与前台（`/mods`）的 `SiteHeader` + `CharacterSidebar` + `ModCard` 网格布局风格不一致。

本次重构将后台页面统一接入前台导航和布局体系：**导航栏复用 `SiteHeader` 组件**（通过 `isAdmin` 切换管理链接），**管理列表改用 ModCard 网格 + 传统分页**，编辑/发布/删除按钮集成到卡片底部操作栏。所有后台页面（管理列表、上传页、编辑页）统一导航栏。

---

## Problem Statement

**当前问题**：
- 后台 `admin/layout.tsx` 自建导航栏，样式和功能与前台 `SiteHeader` 不统一
- 管理列表使用横向详情卡片，与前台 ModCard 网格视觉差异大
- 维护两套导航代码，新增导航功能需改两处

**解决方案**：后台直接复用前台 `SiteHeader` 组件，管理列表改用 `ModCard` 网格 + 传统分页，编辑/发布/删除按钮集成到卡片底部。

**商业影响**：统一 UI 体系 → 降低维护成本；卡片网格预览 → 管理员更快定位 Mod。

---

## Success Metrics

- 后台 /admin/mods 页面视觉风格与前台 /mods 一致
- 管理员能通过网格预览快速识别 Mod 封面
- 编辑/发布/删除操作在卡片底部可直接触发

---

## User Personas

### Primary: 管理员
- **角色**: WaveMod 站点管理员，负责 MOD 的上传、审核、管理
- **目标**: 快速浏览所有 MOD（含草稿），编辑/发布/删除操作便捷
- **痛点**: 后台布局与前台割裂，列表式浏览无法预览封面
- **技术水平**: 中高级

---

## User Stories & Acceptance Criteria

### Story 1: 统一导航栏

**As a** 管理员
**I want to** 后台页面使用跟前台一样的 SiteHeader 导航栏
**So that** 前后台体验一致，游戏切换等功能统一可用

**Acceptance Criteria:**
- [ ] 后台所有页面（`/admin/*`）使用 `SiteHeader` 组件
- [ ] 导航链接显示：上传页面、管理列表、返回前台、退出登录
- [ ] 游戏快捷切换保留在导航栏
- [ ] 导航栏保持 sticky 定位
- [ ] 后台无需登录/注册等前台专用链接

### Story 2: 管理列表网格化

**As a** 管理员
**I want to** 管理列表以 ModCard 网格展示 Mod
**So that** 我能直观预览封面并快速筛选

**Acceptance Criteria:**
- [ ] Mod 以 `ModCard`（`variant="list"`）网格展示
- [ ] 列数：`sm:3 lg:3 xl:4`
- [ ] 左侧保留 `CharacterSidebar` 角色筛选
- [ ] 工具栏保留游戏/状态/排序筛选
- [ ] 支持布局切换（网格/瀑布流，复用前台已有功能）

### Story 3: 卡片操作按钮

**As a** 管理员
**I want to** 在 ModCard 底部直接编辑/发布/删除
**So that** 无需进入详情页即可操作

**Acceptance Criteria:**
- [ ] 每张卡片底部显示：编辑、发布/取消发布、删除按钮
- [ ] 按钮样式匹配 neo-brutalist 风格（小黑边框 + 阴影）
- [ ] 发布切换按钮显示当前状态（已发布/草稿）
- [ ] 删除按钮有确认弹窗
- [ ] 操作后卡片状态即时更新

### Story 4: 传统分页

**As a** 管理员
**I want to** 通过页码翻页浏览 Mod
**So that** 我能精确定位到某一页

**Acceptance Criteria:**
- [ ] 底部显示分页器：上一页、页码、下一页
- [ ] 每页条数可选：20 / 50 / 100
- [ ] URL searchParams 驱动（`?page=2&pageSize=50`）
- [ ] 当前页码高亮

---

## Functional Requirements

### 导航栏重构

- **方案**：`admin/layout.tsx` 中直接使用 `<SiteHeader>` 组件替换现有自定义 header
- **链接**：SiteHeader 已通过 `isAdmin` prop 区分管理链接，无需修改
- **移除**：现有 admin/layout.tsx 中的自定义 header 代码

### 管理列表重构

- **卡片渲染**：用 `ModCard` 替代现有 `AdminModsCards` 列表组件
- **操作按钮**：通过 ModCard 的 `bodyBottom` / `actions` prop 注入编辑/发布/删除按钮
- **分页**：用 `ZenlessModsPagination` 或新建通用分页组件，支持每页条数选择
- **工具栏**：保留 `AdminModsToolbar`（游戏/状态/排序筛选），添加布局切换按钮
- **侧边栏**：保持现有 `CharacterSidebar`（已复用）

### 全部后台页面

- `/admin/mods` → 主要重构目标
- `/admin/upload` → 统一导航栏即可
- `/admin/mods/[id]/edit` → 统一导航栏即可
- `/admin/games/*` → 统一导航栏即可

---

## Technical Constraints

### 实现约束

- `ModCard` 的 `bodyBottom` prop 可注入 ReactNode，用于放置操作按钮
- 分页器可复用 `ZenlessModsPagination` 或提取为通用组件
- `SiteHeader` 已支持 `isAdmin` prop，当前在 `(site)/layout.tsx` 中使用；需要确保 admin layout 中的数据获取方式一致
- `admin/layout.tsx` 中 `requireAdminUser()` 保持不变

### 安全

- 删除操作必须保留服务端二次验证
- `PublishToggleButton` 和 `DeleteModButton` 保持现有逻辑不变

---

## MVP Scope

### Phase 1: MVP
1. admin/layout.tsx 接入 `SiteHeader`
2. `/admin/mods` 改用 `ModCard` 网格
3. 卡片底部集成编辑/发布/删除按钮
4. 传统分页 + 每页条数选择
5. 上传页/编辑页统一导航

### Phase 2: 增强
- 分页器提取为通用组件
- 后台专属主题色切换

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| SiteHeader 在 admin layout 中数据获取路径不同 | 中 | 中 | admin layout 中独立调用 `getCurrentUser()` |
| ModCard 网格中操作按钮交互复杂 | 低 | 低 | 使用已有 `bodyBottom` prop 注入，不修改 ModCard |
| 分页与传统 URL 参数冲突 | 低 | 中 | 清晰定义 page/pageSize 参数 |

---

## Dependencies

- `SiteHeader` → 已支持 `isAdmin` prop
- `ModCard` → 已有 `bodyBottom` / `actions` prop
- `CharacterSidebar` → 后台已复用
- `AdminModsToolbar` → 保持不变
- `PublishToggleButton` / `DeleteModButton` → 保持现有逻辑
- `ZenlessModsPagination` → 可参考或复用

---

*本 PRD 通过交互式需求采集和质量评分（91/100）生成。*
