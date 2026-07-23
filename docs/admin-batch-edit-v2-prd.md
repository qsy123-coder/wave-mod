# Product Requirements Document: 批量编辑 v2 — 独立表单模式

**Version**: 1.0
**Date**: 2026-07-23
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

当前批量编辑（v1）是"填写公共字段 → 应用到所有选中 Mod"，只能批量设相同值。v2 重新设计为**独立表单模式**：每个选中 Mod 加载完整字段数据，管理员逐 Mod 独立编辑（含图片上传/替换/删除），底部统一「保存全部」一次性提交。

---

## Problem Statement

**当前问题**：v1 批量编辑只能给所有 Mod 设相同的值，无法独立修改每个 Mod 的不同字段（如给 A 换封面、给 B 改角色名、给 C 加图片）。

**解决方案**：左侧 Tab 列表切换 Mod → 右侧完整编辑表单（复用 UploadForm 字段结构）→ 底部「保存全部 N 个 MOD」。

---

## User Stories

### Story 1: 独立编辑每个 Mod

**As a** 管理员
**I want to** 在批量编辑中独立修改每个 Mod 的不同字段
**So that** 我能一次性完成多个 Mod 的不同修改

**Acceptance Criteria:**
- [ ] 左侧列出所有已选 Mod（封面缩略图 + 标题 + 角色）
- [ ] 点击左侧 Mod 切换右侧编辑表单
- [ ] 右侧表单加载该 Mod 的全部当前字段值
- [ ] 包含所有字段：游戏、标题、角色、描述、下载链接、网盘链接、视频链接、作者链接、预览图（含上传/删除）、XXMI 说明、NSFW
- [ ] 切换 Mod 时保留已修改但未保存的数据
- [ ] 有修改的 Mod 在左侧显示标记（如黄色圆点）

### Story 2: 统一提交

**As a** 管理员
**I want to** 编辑完多个 Mod 后点击一个按钮一次性保存
**So that** 不用逐个提交

**Acceptance Criteria:**
- [ ] 底部固定栏显示「保存全部 N 个 MOD」按钮
- [ ] 点击后逐 Mod 提交修改
- [ ] 显示提交进度（已处理 N/M）
- [ ] 完成后汇总成功/失败结果
- [ ] 失败的 Mod 显示具体错误原因

---

## Functional Requirements

### 布局

```
┌──────────────────────────────────────────────┐
│  Header: 批量编辑 N 个 MOD          [关闭] │
├──────────────┬───────────────────────────────┤
│ 左侧 Tab 列表 │  右侧编辑表单（全字段）        │
│ (260px)      │                               │
│              │  游戏  [select]               │
│  ┌─────────┐ │  标题  [input]                │
│  │ 封面缩略 │ │  角色  [input+datalist]        │
│  │ 标题     │ │  描述  [textarea]             │
│  │ 角色     │ │  下载  [input+OSS上传]        │
│  └─────────┘ │  网盘  [textarea]             │
│  ┌─────────┐ │  视频  [input]                │
│  │ ...      │ │  作者  [input]                │
│  └─────────┘ │  预览图 [textarea+预览+上传]    │
│              │  XXMI  [textarea+默认模板]     │
│              │  NSFW  [checkbox]             │
├──────────────┴───────────────────────────────┤
│  Footer: [取消] [保存全部 N 个 MOD]           │
└──────────────────────────────────────────────┘
```

### 左侧 Tab 列表

- 每个已选 Mod 显示：封面缩略图（48x48）、标题（截断）、角色名
- 当前选中项高亮（黑底白字或 accent 色）
- 有未保存修改的项显示黄色圆点标记
- 列表可滚动

### 右侧编辑表单

- 复用 `UploadForm` 核心字段布局（12 个字段）
- 通过 `getUploadFormValuesFromMod()` 加载字段值回填
- 图片管理完整可用：粘贴 URL + 预览删除 + Supabase Storage 上传
- 每个 Mod 的表单状态独立管理（修改切换时不丢失）

### 数据管理

- 使用 `Map<modId, FormValues>` 存储每个 Mod 的表单数据
- 切换 Mod 时保存当前表单状态到 Map，加载新 Mod 的表单状态
- 只有实际修改过的 Mod 才提交（diff 对比原始值）

### 提交

- 调用 Server Action `batchUpdateModsIndividually(updates: {id, fields}[])`
- 逐 Mod 更新，返回成功/失败汇总
- 显示进度

---

## Technical Constraints

### 实现

- 复用 `UploadForm` 组件（传入 `mode="batch-edit"` 或通过 props 控制）
- 表单状态：`useRef<Map<string, FormValues>>` 避免重渲染丢失
- 图片上传：每个 Mod 独立 Supabase Storage 路径

### 性能

- 批量编辑上限 20 个 Mod（防止内存/性能问题）
- 图片预览使用懒加载

---

## MVP Scope

### Phase 1
1. 左侧 Tab 列表 + 切换
2. 右侧完整编辑表单（复用 UploadForm）
3. 表单状态独立管理
4. 底部「保存全部」+ 进度 + 结果汇总

---

## Dependencies

- `UploadForm` — 复用现有组件
- `getUploadFormValuesFromMod` — 字段加载回填
- `batchGetModDetails` — 已有
- `batchUpdateMods` Server Action — 已有，需扩展支持逐 Mod 不同字段

---

*本 PRD 通过交互式需求采集和质量评分（91/100）生成。*
