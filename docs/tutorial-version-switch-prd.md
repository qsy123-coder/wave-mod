# Product Requirements Document: 教程版本切换

**Version**: 1.0
**Date**: 2026-09-06
**Author**: Sarah (Product Owner)
**Quality Score**: 93/100

---

## Executive Summary

当前 `/guide`（先看我）教程页在全站只维护**一份**发布教程：`tutorial_configs.id` 被 `check (id in ('published','draft'))` 锁死为「一发布 + 一草稿」。当安装方式发生变化（例如不同游戏客户端版本、不同的 MOD 管理工具流程）时，只能整体覆盖替换旧的，无法并存，也没有办法让访客自行选择自己适用的一套安装说明。

本方案把教程升级为**多版本并存**：每个版本是一份完整独立的教程（自带标题/副标题/章节/图片/工具），访客在 `/guide` 顶部通过下拉/分段按钮在**可见**版本间切换；后台可对版本做**全量管理**（新建、改名、排序、显示/隐藏、设默认、编辑章节、发布）。每个版本保留独立的 `draft → published` 发布流程。

---

## Problem Statement

**当前痛点**：
- 全站只有一份发布教程，安装方式变化只能覆盖旧内容，无法保留历史/并存多个流程
- 不同游戏版本或不同用户偏好（JASM 流 / XXMI 流 / 手动流）无法在一页里共存
- 没有给访客「选一份适合自己的教程」的能力

**解决方案**：
- 引入「版本」作为教程的顶层维度，版本下挂 `published` / `draft` 两份配置
- `/guide` 顶部提供版本切换器，默认显示标记的默认版本，记忆访客上次选择
- `/admin/tutorial` 升级为版本管理入口：维护版本元数据 + 编辑每个版本的章节 + 逐版本发布

**预期效果**：
- 一份页面承载多套安装教程，访客按需切换
- 后台无需覆盖式替换，可平行维护多版本
- 保留每版本独立的预演（draft）与发布（published）机制

---

## Core Design Decisions

| 决策点 | 方案 |
|--------|------|
| 版本关系 | 每个版本是**完整独立**的教程，自带 title/subtitle/chapters，互不影响 |
| 版本元数据 | `名称 + 排序 + 可见(V) + 默认(D) + 描述` |
| 发布模型 | 每版本独立一份 `draft`（编辑）→ 复制为 `published`（发布），沿用现有 publish 语义 |
| 访客默认 | 标记一个默认版本，首次访问展示它；已访问则记忆上次选择（localStorage） |
| 切换器 UI | 头部**分段按钮组**（版本少）或**下拉**（版本多），均为 neo-brutalism 风格，选中高亮 |
| 数据模型 | 新增 `tutorial_versions` 表存元数据；`tutorial_configs` 改为以 `version_id` 关联、带 `status`，去掉 `'published'/'draft'` 文本 id 约束 |
| 只显示可见 | 访客切换器只列 `is_visible = true` 的版本；隐藏版本仅后台可编辑 |

---

## User Stories & Acceptance Criteria

### Story 1: 访客切换教程版本

**As a** 访客
**I want to** 在教程页顶部选择一份自己适用的教程版本
**So that** 看到符合我安装方式的完整教程内容

**Acceptance Criteria:**
- [ ] `/guide` 头部有一组版本切换控件（分段按钮或下拉），列出所有可见版本
- [ ] 当前选中版本高亮标识
- [ ] 切换后下方整个教程内容（章节 Tab + 内容区）替换为所选版本的章节
- [ ] 版本切换控件在移动端可用（下拉或可滚动的分段条）
- [ ] 切换为「文字」/「图片」类型混排的版本时，章节渲染正常
- [ ] 切换过程有轻微过渡，不整页刷新

### Story 2: 默认版本与记忆行为

**As a** 访客
**I want to** 首次打开默认看到版本标记指定的教程，之后记住我的选择
**So that** 不用每次都重选

**Acceptance Criteria:**
- [ ] 首次访问无记忆时，展示 `is_default = true` 的版本
- [ ] 无任何默认标记时，回退到 `sort_order` 最前的可见版本
- [ ] 无可见版本时，页面展示空态提示（不崩溃）
- [ ] 用户主动选择后写入 localStorage，下次访问优先使用该版本
- [ ] 记忆的版本若已被隐藏/删除，自动回退到默认版本
- [ ] 读取/写入 localStorage 有 try/catch，隐私模式下不报错

### Story 3: 后台管理版本元数据

**As a** 教程管理员
**I want to** 新建、改名、排序、显示/隐藏、标记默认、删除版本
**So that** 平行维护多套教程

**Acceptance Criteria:**
- [ ] `/admin/tutorial` 顶部有版本管理区（列表 + 新增按钮）
- [ ] 每个版本行显示：名称、排序值、可见徽标、默认徽标、描述、操作按钮
- [ ] 可改名称、描述、排序、可见状态
- [ ] 可将某版本设为默认（设置时自动清除其他版本的默认标记）
- [ ] 可删除版本（含其 published/draft 配置级联）
- [ ] 至少保留一个版本，不允许删除最后一个版本

### Story 4: 后台编辑各版本章节

**As a** 教程管理员
**I want to** 选中一个版本后编辑其章节，逐版本保存草稿、发布
**So that** 各版本内容互不干扰

**Acceptance Criteria:**
- [ ] 选中版本后，章节编辑区加载该版本的 `draft`（无则回退 `published`）
- [ ] [保存草稿] 写入该版本自己的 draft，不覆盖其他版本
- [ ] [发布] 将该版本 draft 复制为该版本 published
- [ ] 后台切换版本时，未保存的修改有确认提示

### Story 5: 迁移与兼容

**As a** 系统
**I want to** 将现有单版本数据无损迁入多版本结构，且现有 `/guide` 行为不变
**So that** 不影响存量访客

**Acceptance Criteria:**
- [ ] 迁移脚本把当前 `published` config 创建为一个默认可见版本，原章节/图片/工具完整保留
- [ ] 迁移后 `/guide` 显示该版本，与改造前视觉一致
- [ ] 无数据库版本时仍能回退到 `config.ts` 静态配置（现有 fallback 保留）
- [ ] 迁移可重入（重复执行不会产生重复版本）

---

## Functional Requirements

### Feature 1: 版本数据结构

- `tutorial_versions` 表字段：`id`、`name`、`description`、`sort_order`、`is_visible`、`is_default`、`created_at`、`updated_at`
- `tutorial_configs` 改为：`id`（uuid）、`version_id`（FK → tutorial_versions）、`status`（`'published' | 'draft'`）、`title`、`subtitle`、`image_base_path`、`updated_at`
- 约束：`unique(version_id, status)` —— 每个版本最多一份 published + 一份 draft
- `tutorial_chapters` / `tutorial_images` / `tutorial_tools` 表结构不变，继续以 `config_id` 关联

### Feature 2: 公开读取

- `listVisibleVersions()`：返回 `is_visible = true` 的版本元数据（按 `sort_order` 排序），含默认标记
- `getTutorialForVersion(versionId)`：读取指定版本的 `published` 配置（章节 + 图片 + 工具）
- RLS：游客只能读关联到 `is_visible = true` 的版本且 `status = 'published'` 的数据；管理员全量

### Feature 3: 后台管理（`/admin/tutorial`）

- 版本列表 + 新增版本
- 行内/弹窗编辑：名称、描述、排序、可见、默认
- 删除版本（含级联）
- 选中版本 → 编辑章节 → 保存草稿 / 发布（沿用现有 `TutorialTabs` 编辑能力，作用于该版本的 draft）

### Feature 4: 前台切换器（`/guide`）

- 顶部版本切换器：分段按钮（默认）或下拉（版本多时）
- 当前选中高亮，切换替换内容
- localStorage 记忆 + 默认版本回退逻辑

### Out of Scope
- 版本历史 / 时间线回滚（只保留 published / draft 两态）
- 教程内容的多语言
- 视频在后台直接上传（仍手动填 COS URL，沿用现状）

---

## Technical Design

### 数据模型（SQL 迁移）

新增 `supabase/add_tutorial_versions.sql`，包含：

1. `tutorial_versions` 表 + 索引 + updated_at 触发器 + RLS
2. 改造 `tutorial_configs`：去掉 `id in ('published','draft')` 文本约束，改为 `id uuid default gen_random_uuid()` + `version_id` FK + `status` 字段 + `unique(version_id, status)`
3. 重写 4 张表的 RLS 策略：
   - 公开读：`exists (select 1 from tutorial_versions v where v.id = configs.version_id and v.is_visible) and configs.status = 'published'`
   - 管理员：`public.is_admin()`
4. 迁移脚本：把现有 `published` config 迁移为「默认可见版本」；`draft` 若存在则迁移为同版本的 draft

> ⚠️ 迁移是本 PRD 风险最高部分：需在非高峰期执行，先备份，迁移后跑 `npm run build` + 前台回归。

### 组件架构

```
/app/guide/page.tsx (Server)
├── listVisibleVersions() + getTutorialForVersion(defaultVersionId)
├── 渲染 <GuideHeader>（含版本切换器）
└── 渲染 <TutorialVersionTabs>（Client, 持有 activeVersion + 章节）

/admin/tutorial/page.tsx (Server)
├── getAdminTutorialData() → 所有版本 + 各版本 published/draft
└── <TutorialAdminVersions>（Client, 版本管理 + 选中版本章节编辑）
```

### Server Actions（`src/actions/tutorial/`）

- `listVisibleVersions()`
- `getTutorialForVersion(versionId)`
- `createVersion({name, description})`
- `updateVersionMeta({id, name?, description?, sort_order?, is_visible?, is_default?})`
- `deleteVersion(id)`
- `saveDraftForVersion(versionId, input)` —— 现有 `saveDraft` 加 `versionId` 参数
- `publishVersion(versionId)` —— 现有 `publishTutorial` 加 `versionId` 参数
- `discardDraftForVersion(versionId)`

### 关键改动文件

| 文件 | 改动 |
|------|------|
| `supabase/add_tutorial_versions.sql` | 新增：版本表 + config 改造 + RLS |
| `src/features/tutorial/types.ts` | `TutorialConfig` 增加 `versionId`，新增 `TutorialVersionMeta` 类型 |
| `src/actions/tutorial/tutorial-actions.ts` | 公开/后台函数增加 `versionId`；新增版本 CRUD |
| `src/features/tutorial-admin/types.ts` | 行类型加 `version_id`/`status`，新增版本行类型 |
| `src/app/(site)/guide/page.tsx` | 读取多版本 + 渲染切换器 + 默认/记忆逻辑 |
| `src/features/tutorial/components/tutorial-tabs.tsx` | 接受 `version` prop，章节随版本切换（key 变化触发重置） |
| 新建 `src/features/tutorial/components/tutorial-version-switcher.tsx` | 前台切换器（分段/下拉） |
| 新建 `src/features/tutorial-admin/components/tutorial-admin-versions.tsx` | 后台版本管理区 |
| `src/features/tutorial-admin/components/tutorial-admin-client.tsx` | 接版本选择，选中版本加载草案 |

### 兼容性

- 新增 UI 均为独立组件，前台 `TutorialTabs` 的现有 props 全部保留
- 版本数量为 1 时，切换器隐藏（等同现状，零感知）
- `config.ts` 静态 fallback 保留，作为「无数据库版本」时的降级

---

## MVP Scope

### 必须交付
- [ ] SQL 迁移：`tutorial_versions` 表 + `tutorial_configs` 改造 + RLS 重写
- [ ] 迁移脚本：现有 published → 默认可见版本
- [ ] 公开读取 actions（多版本 + 按版本读取）
- [ ] 后台版本管理（CRUD + 排序 + 可见 + 默认 + 删除）
- [ ] 后台逐版本编辑章节 + 保存草稿 + 发布
- [ ] 前台 `/guide` 版本切换器 + 默认/记忆逻辑
- [ ] `npm run build` + 前台/后台回归通过

### 增强（后续）
- 版本切换器动画过渡打磨
- 版本描述气泡/悬浮提示
- 移动端切换器交互优化

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| RLS 重写导致公开读取渗透到 draft/hidden | Medium | High | 迁移后用未登录 + 登录两种身份回归，验证游客只能读可见且 published |
| `tutorial_configs` 主键改动（text→uuid）破坏现有代码引用 | Medium | High | 先全局搜索 `'published'`/`'draft'` 引用，逐处替换为 `version_id + status`；迁移前备份 |
| 现有单版本数据在迁移中丢失 | Low | Critical | 迁移策略幂等，先备份，迁移脚本在事务中执行并校验行数 |
| 版本多时切换器拥挤 | Medium | Low | 分段按钮在版本 ≥4 时降级为下拉 |

---

## Dependencies & Blockers

**Dependencies:**
- Supabase 数据库迁移权限（服务端执行 SQL）
- 现有的 `saveDraft` / `publishTutorial` Server Actions（在其上加 `versionId`）

**Known Blockers:**
- 无。现有 `config.ts` 静态 fallback 确保无数据库版本时站点不损坏。

---

## References

- 前台教程页：`src/app/(site)/guide/page.tsx`
- 教程类型：`src/features/tutorial/types.ts`
- 教程后台类型：`src/features/tutorial-admin/types.ts`
- Server Actions：`src/actions/tutorial/tutorial-actions.ts`
- 教程内核心组件：`src/features/tutorial/components/tutorial-tabs.tsx`
- 教程管理后台客户端：`src/features/tutorial-admin/components/tutorial-admin-client.tsx`
- 现有数据库 schema：`supabase/add_tutorial_management.sql`
- 现有教程后台 PRD：`docs/tutorial-admin-prd-v2.md`

---

*本 PRD 通过交互式需求收集 + 质量评分流程生成（93/100）。核心变化是把教程从「单发布版」升级为「多版本并存」，访客可在 /guide 切换、后台可全量管理版本，且每个版本保留独立的 draft → published 发布流程。*
