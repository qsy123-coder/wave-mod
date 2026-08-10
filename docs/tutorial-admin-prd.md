# Product Requirements Document: 教程管理后台

**Version**: 1.0
**Date**: 2026-08-10
**Author**: Sarah (Product Owner)
**Quality Score**: 94/100

---

## Executive Summary

WaveMod 教程页（`/guide`）目前所有章节内容硬编码在 `config.ts` 中，改一个标题就需要改代码、构建、部署。随着教程迭代加速（MOD 版本更新频繁），需要为管理员提供一个可视化的管理后台，实现拖拽排序章节、修改标题/视频/工具链接、新增章节、管理步骤图片等操作。数据从静态 TypeScript 文件迁移到 Supabase PostgreSQL，图片和视频托管在腾讯云 COS 上，编辑采用「草稿→发布」工作流，线上用户不受编辑过程影响。

---

## Problem Statement

**当前痛点**：
- 教程数据（标题、章节、视频 URL、工具链接、图片列表）全部写在 `src/features/tutorial/config.ts`
- 任何修改（哪怕改一个字）都需要改代码 + `npm run build` + 重新部署到 Vercel
- 无法拖拽排序，新增/删除章节需手动写代码
- 视频文件 ~441MB 放 `public/` 目录，Vercel 部署超时，中国用户访问极慢

**解决方案**：
- 新增 `/admin/tutorial` 管理页面，可视化编辑教程
- 数据存入 Supabase PostgreSQL（新建 4 张表）
- 采用「草稿 + 发布」模式：编辑不影响线上，确认无误后发布生效
- 图片/视频托管在腾讯云 COS（复用现有 COS STS 上传通道）
- 首次部署时从 `config.ts` 自动迁移现有数据

**预期效果**：
- 教程修改从「改代码 + 等部署（5-10 分钟）」→「打开管理后台改完发布（1 分钟）」
- 管理员无需懂代码即可维护教程
- 视频通过 COS + CDN 分发，中国用户秒开

---

## Success Metrics

- 教程内容修改耗时 < 2 分钟（从打开后台到发布生效）
- 管理员无需查看源代码即可完成章节增删改
- 视频加载时间（中国大陆）从 30s+ → < 5s（COS CDN 加速）
- 编辑过程中线上用户看到的教程不受影响（零 downtime）

---

## User Personas

### Primary: 教程管理员（Admin）
- **角色**：负责维护 MOD 使用教程的管理员
- **目标**：快速更新教程内容、添加新章节、替换过时的视频/图片
- **痛点**：改个链接都要改代码部署，太慢了
- **技术水平**：会用电脑，不需要懂代码

---

## User Stories & Acceptance Criteria

### Story 1: 编辑现有章节

**As a** 教程管理员
**I want to** 修改章节标题、替换视频链接、编辑工具下载链接
**So that** 教程内容保持最新

**Acceptance Criteria:**
- [ ] 进入管理页面看到当前已发布的教程（只读预览）
- [ ] 点击「编辑」进入编辑模式，所有字段变为可编辑
- [ ] 修改章节标题后失焦即保存到草稿
- [ ] 修改视频 URL 后新地址即时生效
- [ ] 文字章节的工具条目可增删改（名称、链接、必装/可选、网盘链接）
- [ ] 点击「保存草稿」按钮手动确认保存

### Story 2: 拖拽排序章节

**As a** 教程管理员
**I want to** 拖拽章节改变顺序
**So that** 教程结构符合逻辑顺序

**Acceptance Criteria:**
- [ ] 每个章节卡片左侧有拖拽手柄
- [ ] 拖动章节时其他章节自动让位（视觉反馈）
- [ ] 放手后新顺序立即生效（草稿中）
- [ ] 拖拽全程流畅无卡顿（使用 dnd-kit 或类似库）

### Story 3: 新增章节

**As a** 教程管理员
**I want to** 新增图片章节或文字说明章节
**So that** 教程可以扩展覆盖更多内容

**Acceptance Criteria:**
- [ ] 点击「添加章节」弹出类型选择：图片教程 / 文字说明
- [ ] 新章节自动添加到末尾，可拖拽调整位置
- [ ] 图片章节可上传步骤图片（复用 COS 上传，支持多图）
- [ ] 文字章节可填写说明文字 + 添加工具下载条目
- [ ] 新增章节必须配置视频 URL（可为空，发布时校验）
- [ ] 最多 20 个章节

### Story 4: 草稿与发布

**As a** 教程管理员
**I want to** 在草稿中编辑、预览无误后再发布
**So that** 线上用户不会看到不完整的教程修改

**Acceptance Criteria:**
- [ ] 编辑模式下所有修改仅影响草稿
- [ ] 线上 `/guide` 页面展示的始终是已发布版本
- [ ] 点击「发布」→ 草稿覆盖已发布版本，线上立即生效
- [ ] 点击「放弃修改」→ 草稿被删除，恢复到已发布版本
- [ ] 如果有未发布的草稿，进入页面时提示「检测到未发布的草稿」

### Story 5: 步骤图片管理（图片章节）

**As a** 教程管理员
**I want to** 上传、删除、拖拽排序章节内的步骤图片
**So that** 图文教程的每一步都准确

**Acceptance Criteria:**
- [ ] 图片章节编辑时可看到当前所有步骤图片的缩略图
- [ ] 可上传新图片（复用现有 COS 上传组件，自动转 WebP）
- [ ] 可删除单张图片（带确认弹窗）
- [ ] 可拖拽图片改变步骤顺序
- [ ] 上传进度可见（进度条）

### Story 6: 自动迁移现有数据

**As a** 开发者
**I want to** 首次部署时自动从 `config.ts` 迁移数据到数据库
**So that** 不需要手动录入已有的 5 个章节

**Acceptance Criteria:**
- [ ] 部署后首次访问管理页面时自动检测数据库是否为空
- [ ] 若为空，从 `config.ts` 读取数据写入 `tutorial_configs`（published）+ `tutorial_chapters` + `tutorial_images` + `tutorial_tools`
- [ ] 迁移完成后提示「已从 config.ts 导入 X 个章节」
- [ ] 迁移后的 `config.ts` 不再生效（数据源切换为数据库）

---

## Functional Requirements

### Core Features

**Feature 1: 教程管理页面 (`/admin/tutorial`)**
- 位于现有管理后台侧边栏入口
- 复用 `requireAdminUser()` 认证
- 页面布局：
  ```
  ┌─ 教程管理 ─────────────────── [编辑] ────────┐
  │ 标题: [鸣潮MOD使用详细教程            ]        │
  │ 副标题: [先看我                        ]        │
  │                                               │
  │ ┌─ 00 需要的工具和软件 [text] ≡ ──────────┐   │
  │ │  标题: [需要的工具和软件               ]   │   │
  │ │  视频: [https://cos.xxx/00-1.mp4     ]   │   │
  │ │  说明: [以下工具为必须下载...         ]   │   │
  │ │  工具: ⠕ JASM  [url] [必装]          │   │   │
  │ │       ⠕ XXMI  [url] [必装]           │   │   │
  │ │       [+ 添加工具]                     │   │   │
  │ └────────────────────────────────────────┘   │
  │ ┌─ 01 工具的解压 [images] ≡ ─────────────┐   │
  │ │  标题: [工具的解压                     ]   │   │
  │ │  视频: [https://cos.xxx/01-1.mp4     ]   │   │
  │ │  图片: [图1] [图2] [图3] [图4] [图5]   │   │
  │ │       [+ 上传图片]                      │   │
  │ └────────────────────────────────────────┘   │
  │ [+ 添加章节]                                 │
  └──────────────────────────────────────────────┘
  ```

**Feature 2: 拖拽排序**
- 使用 `@dnd-kit/core` + `@dnd-kit/sortable`（项目若未安装需新增依赖）
- 拖拽手柄在章节卡片左侧（≡ 图标）
- 同时支持章节排序和章节内图片/工具排序
- 排序变化实时反映到本地状态，随「保存草稿」一起提交

**Feature 3: 视频 URL 管理**
- 管理员手动上传 MP4 到 COS 后，将 URL 粘贴到输入框
- URL 输入框校验：必须是 HTTPS URL、必须以 `.mp4` 结尾
- 留空则章节无视频（发布时间不校验此项）
- 示例文案提示 COS CDN 加速域名格式

**Feature 4: COS 图片上传（复用现有）**
- 复用 `storage-image-upload.tsx`，支持多图上传
- 自动转 WebP（现有逻辑）
- 上传到 COS 路径 `tutorial/{chapter-key}/{filename}.webp`
- 需要扩展 COS sign API 支持 `tutorial` 路径前缀（目前只支持 `mods/`）

**Feature 5: 草稿/发布工作流**
- 数据库 `tutorial_configs` 表 `id` 固定为 `'published'` 和 `'draft'`
- 进入管理页面 → 读取 published 作为预览
- 点击「编辑」→ 读取 draft（若无则从 published 复制）
- 保存 → 写入 draft
- 发布 → 复制 draft 数据到 published，删除 draft
- 放弃 → 删除 draft

### Error Handling
- COS 上传失败 → 显示红色错误提示，允许重试
- 保存草稿失败 → 弹窗提示「保存失败，请重试」+ 控制台日志
- 发布时校验 → 标题/章节列表非空，每个章节必须有标题

### Out of Scope
- 视频文件直接在管理后台上传（大文件体验差，改为手动上传 + 填 URL）
- 教程多语言支持
- 教程版本历史/回滚
- 用户端教程进度数据的后台查看

---

## Technical Constraints

### Performance
- 管理页面加载 < 2 秒（包含已发布 + 草稿数据）
- 拖拽操作 60fps
- 图片上传单个 < 20MB（COS 限制）

### Security
- 管理页面路由级认证（复用 `requireAdminUser()`）
- COS 上传使用 STS 临时凭证（复用现有 `/api/cos/sign`，需扩展路径前缀）
- 数据库 RLS：tutorial 表仅 admin 可写，public 可读 published 数据

### Integration
- **Supabase PostgreSQL**：新建 4 张表（`tutorial_configs`, `tutorial_chapters`, `tutorial_images`, `tutorial_tools`）
- **腾讯云 COS**：扩展 `/api/cos/sign` 支持 `tutorial/` 路径前缀
- **现有 Admin Layout**：在 `/admin` 导航中新增「教程管理」入口
- **config.ts**：保留文件但标记为 `@deprecated`，数据由数据库接管

### Technology Stack
- Next.js 16 Server Components + Server Actions
- React 19 + TypeScript（严格模式）
- Tailwind CSS + shadcn/ui（Neo-brutalism 风格）
- @dnd-kit/core + @dnd-kit/sortable（拖拽排序）
- Zod（表单校验）
- cos-js-sdk-v5（客户端 COS 上传，已安装）
- Supabase PostgreSQL（数据库）

---

## Database Schema

### `tutorial_configs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | `'published'` or `'draft'` |
| `title` | text NOT NULL | 教程总标题 |
| `subtitle` | text NOT NULL | 副标题 |
| `image_base_path` | text NOT NULL | 图片 COS 路径前缀 |
| `updated_at` | timestamptz | 最后更新时间 |

### `tutorial_chapters`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `config_id` | text FK → tutorial_configs.id | 属于哪个配置 |
| `sort_order` | int NOT NULL | 排序序号 |
| `chapter_key` | text NOT NULL | 章节标识（如 "00", "01"） |
| `title` | text NOT NULL | 章节标题 |
| `type` | text NOT NULL | `'text'` or `'images'` |
| `intro` | text? | 文字说明（仅 text 类型） |
| `video_src` | text? | 视频 COS URL |
| `video_poster` | text? | 视频封面图 URL |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `tutorial_images`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `chapter_id` | uuid FK → tutorial_chapters.id | |
| `sort_order` | int NOT NULL | |
| `url` | text NOT NULL | COS 完整 URL |
| `filename` | text NOT NULL | 原始文件名 |
| `alt` | text? | 图片描述 |
| `created_at` | timestamptz | |

### `tutorial_tools`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `chapter_id` | uuid FK → tutorial_chapters.id | |
| `sort_order` | int NOT NULL | |
| `name` | text NOT NULL | 工具名称 |
| `url` | text NOT NULL | 下载链接 |
| `description` | text? | 工具说明 |
| `required` | boolean NOT NULL DEFAULT false | 是否必装 |
| `cloud_baidu` | text? | 百度网盘链接 |
| `cloud_quark` | text? | 夸克网盘链接 |
| `created_at` | timestamptz | |

### RLS Policies
- 所有表 public SELECT（published config 可被匿名读取）
- 所有表 INSERT/UPDATE/DELETE 仅 admin（通过 `is_admin()` 函数）
- tutorial_configs SELECT 允许匿名读 published 行

---

## MVP Scope & Phasing

### Phase 1: MVP（本次交付）

- [x] 数据库表创建 + 迁移脚本
- [x] 自动从 `config.ts` 迁移现有数据
- [x] `/admin/tutorial` 管理页面（预览/编辑双模式）
- [x] 拖拽排序章节
- [x] 编辑章节标题、视频 URL、类型
- [x] 新增/删除章节（图片 + 文字）
- [x] 文字章节工具条目管理
- [x] 图片章节步骤图片管理（COS 上传）
- [x] 草稿/发布工作流
- [x] Guide 页面切换为从数据库读取（Server Component）
- [x] COS sign API 扩展支持 tutorial 路径

### Phase 2: 增强（后续）

- [ ] 图片章节步骤图片拖拽排序
- [ ] 章节内嵌视频预览
- [ ] 操作日志（谁在什么时候改了什么）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| COS 图片上传失败 | Low | Medium | 复用现有成熟上传组件 + 错误重试 |
| 拖拽排序库兼容性问题 | Low | Low | @dnd-kit 是行业标准，与 React 19 兼容 |
| 草稿/发布并发冲突 | Low | Medium | 单管理员场景，id 固定不变，无并发问题 |
| config.ts 迁移失败 | Low | High | 迁移脚本包裹 try/catch，失败时保留 config.ts 作为回退 |
| 视频 URL 格式错误导致播放失败 | Medium | Low | 前端 URL 格式校验 + 提示文案 |

---

## Dependencies & Blockers

**Dependencies:**
- `@dnd-kit/core` + `@dnd-kit/sortable`：需新增 npm 依赖
- `/api/cos/sign`：需扩展支持 `tutorial/` 路径（轻微改动）
- Supabase schema migration：需执行 SQL 创建 4 张表 + RLS policy

**Known Blockers:**
- 无。所有基础设施（COS、Supabase、Admin Auth）已就绪

---

## Appendix

### Glossary
- **图文章节** (`type: "images"`)：包含步骤图片的章节，点击图片可放大查看
- **文字章节** (`type: "text"`)：包含文字说明 + 工具下载链接的章节（如 00 节）
- **草稿 (draft)**：编辑中的版本，不影响线上用户
- **已发布 (published)**：线上 `/guide` 页面展示的版本
- **STS**：腾讯云临时安全凭证，用于客户端直传 COS

### References
- 现有 COS 上传实现：`src/components/features/admin/upload/storage-image-upload.tsx`
- 现有 COS Sign API：`src/app/api/cos/sign/route.ts`
- 现有 Admin Layout：`src/app/admin/layout.tsx`
- 现有教程类型定义：`src/features/tutorial/types.ts`
- 现有教程配置：`src/features/tutorial/config.ts`

---

*本 PRD 通过交互式需求收集 + 质量评分流程生成，覆盖了业务价值、功能需求、用户体验和技术约束四个维度。*
