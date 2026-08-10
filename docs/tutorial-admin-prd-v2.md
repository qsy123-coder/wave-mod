# Product Requirements Document: 教程管理后台 v2 — 前台布局复用

**Version**: 2.0
**Date**: 2026-08-10
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

v1 方案为教程管理后台设计了独立于前台的编辑界面（表单卡片列表），管理员在后台编辑时看不到前台实际效果。v2 方案改为直接复用 `/guide` 教程页的完整布局（章节 Tab 导航、图文内容、视频灯箱），在此之上叠加编辑控件。管理员看到的就是用户将看到的，真正做到"所见即所得"。

---

## Problem Statement

**v1 痛点**：
- 管理后台编辑界面是一个独立的表单 UI，和用户看到的教程页完全不同
- 管理员无法在编辑时预览实际效果，需要「编辑 → 保存 → 切换到前台看效果 → 回后台继续改」
- 维护两套 UI（前台渲染 + 后台表单）增加了代码复杂度和不一致风险

**v2 解决方案**：
- `/admin/tutorial` **完全复用** `/guide` 的组件树（`TutorialTabs` → `TutorialNav` + `TutorialChapterText` / `TutorialChapterImages`）
- 编辑控件以**叠加层**方式注入：每个可编辑元素旁边出现笔图标、拖拽手柄、工具栏
- 修改后的草稿直接渲染在同一个布局中，不需要"编辑/预览"模式切换

**预期效果**：
- 管理员看到的就是最终效果，零认知负担
- 减少维护成本：只有一套 UI 组件，前台和后台共享

---

## Core Design Decisions

| 决策点 | 方案 |
|--------|------|
| 页面布局 | 完全复用 `/guide` 的 `TutorialTabs` 组件树 |
| 编辑入口 | **独立编辑按钮**：每个可编辑元素（标题、章节名、图片、工具等）旁边有各自的编辑按钮（笔图标），不需要全局开关 |
| 章节排序 | **拖拽 Tab 标签**：直接在真实的 Tab 导航栏上拖动 Tab 来改变章节顺序 |
| 图片管理 | **始终显示工具栏**：每张步骤图片的右上角/左上角始终显示小工具栏（删除、替换、上移、下移） |
| 新增章节 | **Tab 栏末尾 + 按钮**：点击弹出类型选择（文字说明 / 图片教程），新章节插入到末尾 |
| 文字章节编辑 | **点击区域弹出编辑器**：点击文字说明区域或工具列表区域时，弹出内联编辑面板/弹窗 |
| 草稿保存 | **离开时提醒保存**：管理员修改后不会自动保存，离开页面前如果有未保存的修改弹出提醒 |
| 发布草稿 | 顶部固定工具栏中有「发布」按钮，点击后将草稿覆盖为线上版本 |

---

## User Stories & Acceptance Criteria

### Story 1: 在前台布局中编辑标题和配置

**As a** 教程管理员
**I want to** 在教程页面上直接修改标题、副标题
**So that** 所见即所得

**Acceptance Criteria:**
- [ ] 标题和副标题旁边各有一个笔图标（编辑按钮）
- [ ] 点击笔图标后文字变为输入框，可直接修改
- [ ] 失焦或回车确认修改
- [ ] 修改后标记为"有未保存的更改"

### Story 2: 拖拽 Tab 排序章节

**As a** 教程管理员
**I want to** 在 Tab 导航栏上直接拖拽章节标签
**So that** 改变章节顺序，且看到的就是最终效果

**Acceptance Criteria:**
- [ ] 每个 Tab 标签可拖拽（有拖拽手柄）
- [ ] 拖动时其他 Tab 自动让位（视觉反馈）
- [ ] 放手后新顺序立即在页面中生效（草稿状态）
- [ ] 切换章节内容跟随新顺序

### Story 3: 管理步骤图片（图片章节）

**As a** 教程管理员
**I want to** 在图片网格中直接管理步骤图片
**So that** 增删图片直观高效

**Acceptance Criteria:**
- [ ] 每张步骤图片右上角始终显示工具栏（删除、上移、下移按钮）
- [ ] 图片网格末尾有「上传图片」占位卡片（+ 图标）
- [ ] 上传支持 COS 直传（复用现有 COS 上传逻辑）
- [ ] 删除图片有确认提示
- [ ] 工具栏不遮挡图片关键内容（半透明背景）

### Story 4: 编辑文字章节

**As a** 教程管理员
**I want to** 点击文字说明区域或工具列表弹出编辑器
**So that** 可以修改说明文字和工具下载条目

**Acceptance Criteria:**
- [ ] 点击文字说明段落旁边出现编辑按钮，点击弹出编辑弹窗/面板
- [ ] 弹窗中可编辑说明文字（textarea）
- [ ] 弹窗中可增删改工具条目（名称、链接、必装/可选、网盘链接）
- [ ] 关闭弹窗后修改立即反映到页面中

### Story 5: 新增章节

**As a** 教程管理员
**I want to** 在 Tab 栏末尾点击 + 添加新章节
**So that** 教程可以扩展

**Acceptance Criteria:**
- [ ] Tab 栏末尾始终有 + 按钮
- [ ] 点击弹出类型选择：文字说明 / 图片教程
- [ ] 新章节插入到末尾，自动生成章节标识（如 "05"）
- [ ] 新章节内容区域显示空状态占位 + 引导编辑

### Story 6: 草稿保存与发布

**As a** 教程管理员
**I want to** 修改后保存草稿、确认无误后发布
**So that** 线上用户不受编辑过程影响

**Acceptance Criteria:**
- [ ] 页面顶部固定工具栏：[保存草稿] [发布] [放弃修改]
- [ ] 有关闭/离开页面时，如果有未保存修改，弹出确认对话框
- [ ] 保存草稿 → 写入数据库 draft 表，不刷新页面
- [ ] 发布 → 草稿覆盖 published，跳转回到前台 `/guide` 确认效果

---

## Functional Requirements

### Feature 1: 编辑工具栏（顶部固定）

- 位置：页面顶部，sticky 定位，浮在教程内容上方
- 内容：[保存草稿] [发布] [放弃修改] + 修改状态指示器（"已修改" / "已保存"）
- 样式：Neo-brutalism 风格，与现有设计一致

### Feature 2: 内联字段编辑

- 所有文本字段（标题、副标题、章节名、视频 URL）旁边有笔图标
- 点击切换为输入框，失焦确认
- 修改后字段高亮（例如边框变为 --neo-accent 颜色），表示已修改

### Feature 3: Tab 拖拽排序

- 使用 `@dnd-kit/core` + `@dnd-kit/sortable`
- Tab 标签左侧有拖拽手柄（≡ 图标）
- 拖拽中 Tab 半透明，其他 Tab 平滑让位
- 排序变化实时反映（本地状态更新）

### Feature 4: 步骤图片工具栏

- 每张图片右上角覆盖一个半透明工具栏
- 工具栏按钮：🗑 删除、↑ 上移、↓ 下移
- 图片网格末尾：+ 上传新图片按钮（触发 COS 上传）
- 新上传的图片插入到末尾

### Feature 5: 文字章节编辑器（弹窗）

- 点击文字区域的编辑按钮 → 打开 Modal/Sheet
- 弹窗内容：
  - 说明文字 textarea
  - 工具条目列表（每行：名称、URL、必装开关、网盘链接、删除按钮）
  - 添加工具按钮
  - 确认 / 取消按钮

### Feature 6: 添加章节

- Tab 栏右侧末尾 + 按钮
- 点击弹出下拉菜单：文字说明 / 图片教程
- 选择后创建空章节，页面滚动到新章节位置

### Out of Scope
- 视频文件直接在管理后台上传（还是手动填 COS URL）
- 多语言支持
- 版本历史/回滚

---

## Technical Design

### 组件架构

```
/admin/tutorial/page.tsx (Server Component)
├── 读取草稿数据（draft）或已发布数据（published）
├── 传递给 TutorialAdminPage (Client Component)
│
└── TutorialAdminPage (Client Component)  ← 核心
    ├── AdminToolbar（顶部固定：保存/发布/放弃 + 状态指示）
    ├── 编辑状态上下文 (React Context: isEditing, modifiedFields, etc.)
    │
    ├── Hero Header（标题 + 副标题 + 编辑按钮覆盖）
    │
    └── TutorialTabs（复用前台组件）
        ├── TutorialNav（Tab 栏 + 拖拽支持 + 每个Tab的编辑/删除按钮 + 末尾+按钮）
        └── 章节内容区
            ├── TutorialChapterText（复用 + 编辑按钮 + 点击弹出编辑器弹窗）
            └── TutorialChapterImages（复用 + 图片工具栏覆盖 + 上传占位卡片）
```

### 数据流

```
Supabase draft → Server Component 读取 → Client Component 渲染前台布局
                                              ↓
管理员编辑（修改标题/拖拽Tab/管理图片等）
                                              ↓
本地状态更新（React state / useReducer）
                                              ↓
点击「保存草稿」→ Server Action 写入 DB draft
                                              ↓
点击「发布」→ Server Action 复制 draft → published
```

### 关键改动

1. **`TutorialNav`**：新增 `draggable` / `onReorder` / `onEditChapter` / `onDeleteChapter` / `onAddChapter` props
2. **`TutorialChapterImages`**：新增 `editable` / `onDeleteImage` / `onMoveImage` / `onUploadImage` props
3. **`TutorialChapterText`**：新增 `editable` / `onEditIntro` / `onEditTools` props
4. **新建** `TutorialAdminPage`：状态管理中心，持有所有编辑状态
5. **新建** `AdminToolbar`：顶部操作栏
6. **新建** `TextChapterEditor`：文字章节编辑弹窗

### 前台组件兼容性

所有新增 props 都是**可选的**（`undefined`），确保前台组件不传这些 props 时行为完全不变，零影响。

---

## MVP Scope

### 必须交付
- [ ] AdminToolbar（保存/发布/放弃 + 离开提醒）
- [ ] 标题副标题内联编辑
- [ ] Tab 栏拖拽排序 + 章节编辑/删除按钮
- [ ] Tab 栏末尾 + 按钮（添加章节）
- [ ] 图片工具栏（删除/上移/下移）+ 上传
- [ ] 文字章节编辑弹窗
- [ ] 前台组件 props 扩展（不影响前台行为）
- [ ] 数据迁移（数据库表中已有 `image_base_path` 字段）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Tab 拖拽在移动端体验不佳 | Medium | Low | 移动端降级为上下箭头按钮 |
| 图片工具栏遮挡内容 | Low | Low | 半透明背景 + 小尺寸按钮 |
| 前台组件改动影响现有功能 | Low | High | 所有新 props 可选，不改现有逻辑 |

---

## References

- 前台教程页：`src/app/(site)/guide/page.tsx`
- 核心组件：`src/features/tutorial/components/tutorial-tabs.tsx`
- Tab 导航：`src/features/tutorial/components/tutorial-nav.tsx`
- 图片章节：`src/features/tutorial/components/tutorial-chapter-images.tsx`
- 文字章节：`src/features/tutorial/components/tutorial-chapter-text.tsx`
- 现有 PRD v1：`docs/tutorial-admin-prd.md`

---

*本 PRD 通过交互式需求收集 + 质量评分流程生成（91/100），核心变化是将管理后台从独立编辑 UI 改为复用前台布局 + 叠加编辑能力。*
