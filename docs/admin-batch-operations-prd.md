# Product Requirements Document: 后台批量操作

**Version**: 1.0
**Date**: 2026-07-23
**Author**: Sarah (Product Owner)
**Quality Score**: 92/100

---

## Executive Summary

当前后台管理列表（`/admin/mods`）仅支持逐张卡片操作（编辑/发布/删除），管理员处理大量 Mod 时效率低下。

本次新增批量操作功能：**卡片左上角复选框勾选** → **底部固定操作栏** → **批量上线/下线/删除/编辑**。批量编辑通过 Modal 弹窗加载所有已选 Mod 的表单数据，支持修改标题、描述、角色名、版本、游戏、NSFW 等全部字段。后端逐条处理并汇总成功/失败结果。

---

## Problem Statement

**当前问题**：
- 只能逐张卡片操作，无法批量处理
- 批量上线/下线/删除需要逐张点击
- 批量分类迁移时需逐张编辑

**解决方案**：添加卡片勾选 + 底部批量操作栏 + Modal 批量编辑表单 + Server Action 批量 API。

**商业影响**：管理效率大幅提升，支持 Mod 批量分类迁移、批量审核发布。

---

## Success Metrics

- 批量操作完成时间 ≤ 逐张操作时间的 20%
- 批量 API 成功处理 ≥ 50 条 Mod
- 失败时正确汇总错误信息并反馈

---

## User Personas

### Primary: 管理员
- **角色**: WaveMod 站主，负责上传、分类、审核所有 MOD
- **目标**: 快速批量分类、批量发布/下线、批量清理
- **痛点**: 逐张操作效率低，无法批量迁移分类
- **技术水平**: 中高级

---

## User Stories & Acceptance Criteria

### Story 1: 勾选 Mod

**As a** 管理员
**I want to** 通过复选框勾选多张 Mod 卡片
**So that** 我可以选择批量操作的目标

**Acceptance Criteria:**
- [ ] 每张 ModCard 左上角显示复选框
- [ ] 勾选后卡片有视觉高亮（边框或背景色变化）
- [ ] 工具栏显示「全选当前页」，点击勾选/取消本页全部
- [ ] 跨页保留已勾选的 Mod（翻页不清空）
- [ ] 底部显示「已选 N 个 MOD」

### Story 2: 批量上线/下线

**As a** 管理员
**I want to** 一键切换多个 Mod 的发布状态
**So that** 我可以快速批量审核发布

**Acceptance Criteria:**
- [ ] 底部操作栏提供「批量上线」和「批量下线」按钮
- [ ] 点击后弹出确认对话框
- [ ] 提交后逐条处理，显示进度
- [ ] 完成后汇总：成功 N、失败 N（含失败原因）
- [ ] 操作完成后页面刷新，卡片状态更新

### Story 3: 批量删除

**As a** 管理员
**I want to** 一键删除多个 Mod
**So that** 我可以快速清理不需要的内容

**Acceptance Criteria:**
- [ ] 底部操作栏提供「批量删除」按钮（红色/警示色）
- [ ] 点击后弹出二次确认：「确认删除 N 个 MOD？此操作不可撤销」
- [ ] 确认后逐条删除，显示进度
- [ ] 完成后汇总结果
- [ ] 页面刷新

### Story 4: 批量编辑

**As a** 管理员
**I want to** 批量修改多个 Mod 的字段
**So that** 我可以快速迁移分类或修正信息

**Acceptance Criteria:**
- [ ] 底部操作栏提供「批量编辑」按钮
- [ ] 点击打开 Modal 弹窗
- [ ] Modal 左侧显示已选 Mod 列表（缩略图 + 标题）
- [ ] Modal 右侧显示可编辑字段（留空 = 不修改）：
  - 标题、描述（textarea）
  - 角色名（下拉选择）
  - 版本、游戏版本
  - 游戏分站（下拉选择）
  - NSFW 开关
  - 下载链接
- [ ] 提交时仅更新非空字段
- [ ] 完成后汇总结果

---

## Functional Requirements

### 勾选机制

- 复选框位于每张 ModCard 左上角，`z-20` 层级
- 勾选状态由客户端 state 管理（`Set<string>` 存储 modId）
- 支持「全选当前页」——选中当前分页所有项
- 跨页保留：翻页时不清空 `Set`，已勾选的项在新页卡片上恢复勾选状态
- 底部栏显示已选数量

### 批量操作栏

- 定位：`fixed bottom-0`，横跨内容区宽度
- 样式：neo-brutalist 黑边框 + 阴影
- 内容：已选数量 + 批量编辑 / 批量上线 / 批量下线 / 批量删除 按钮
- 仅在 `selectedCount > 0` 时显示
- 「取消选择」按钮清除所有勾选

### 批量编辑 Modal

- 触发：「批量编辑」按钮
- 布局：左右分栏
  - 左：已选 Mod 列表（可滚动，最多显示 10 个，超出显示「+N more」）
  - 右：编辑表单
- 表单字段（全部可选，留空 = 不修改）：
  - title（input）
  - description（textarea）
  - character（下拉，来自角色名单）
  - version（input）
  - gameKey（下拉，来自游戏配置）
  - nsfw（checkbox）
  - downloadUrl（input）
- 提交：POST 到 Server Action，逐条更新非空字段
- 结果：Modal 内显示成功/失败汇总

### 批量 API

- Server Action：`batchUpdateMods(ids, fields)` / `batchPublishMods(ids, isPublished)` / `batchDeleteMods(ids)`
- 逐条处理，try-catch 每条
- 返回：`{ success: number; failed: { id: string; title: string; error: string }[] }`
- 前端汇总显示

### 安全

- 所有批量操作需 `requireAdminUser`
- 删除操作二次确认
- 批量 API 在服务端逐条验证权限

---

## Technical Constraints

### 实现

- 勾选状态：React `useState<Set<string>>` + 跨页保留
- 底部栏：`position: fixed; bottom: 0`
- 批量编辑 Modal：使用现有 shadcn/ui `Dialog` 组件
- Server Action：`"use server"` 函数，逐条处理 + 结果汇总

### 性能

- 批量操作限最多 100 条（防止超时）
- Modal 内表单延迟加载（打开时才渲染）

---

## MVP Scope

### Phase 1: MVP
1. 卡片复选框 + 全选当前页
2. 跨页保留勾选
3. 底部批量操作栏
4. 批量上线/下线
5. 批量删除
6. 批量编辑 Modal + 表单

### Phase 2: 增强
- 批量操作进度条
- 撤销功能（批量下线后恢复）
- 快捷键支持（Shift+Click 范围选择）

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| Server Action 批量超时 | 中 | 中 | 限 100 条/次，逐条异步处理 |
| 跨页勾选状态丢失 | 低 | 中 | 使用 `Set<string>` 存储 ID，翻页不清空 |
| 批量编辑误操作 | 中 | 高 | 留空=不修改，二次确认提交 |

---

## Dependencies

- `ModCard` — 需添加 `showCheckbox` prop
- `shadcn/ui Dialog` — 批量编辑 Modal
- 现有 `PublishToggleButton` / `DeleteModButton` — 单卡片操作保留

---

*本 PRD 通过交互式需求采集和质量评分（92/100）生成。*
