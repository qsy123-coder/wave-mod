# Product Requirements Document: 推荐 Mod 管理

**Version**: 1.0
**Date**: 2026-08-16
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

WaveMod 首页轮播图（`HeroCarousel`）目前通过 `getFeaturedMods(6, gameKey)` 读取 `is_featured = true` 的 mod，**按创建时间倒序**展示，管理员无法控制哪些 mod 上轮播、以什么顺序上轮播。本次在后台 `/admin/mods` 列表页的白色筛选卡片上新增「管理推荐」入口，点击弹出管理框，集中展示已推荐的鸣潮 mod，支持**拖拽排序**与**取消推荐**，让轮播图的曝光顺序可控。

该功能复用现有的 `is_featured` 布尔字段与批量推荐能力，唯一新增的基础能力是 `featured_order` 顺序字段 + 一次数据库迁移。目标是让运营/管理员无需改代码即可编排首页轮播。

---

## Problem Statement

**当前状况**：
- 轮播顺序由 `created_at` 倒序决定，无法人工干预。
- 想把某个 mod 排到轮播第一屏，只能靠"重新发布/改时间"之类 hack。
- 已经标了推荐的 mod 没有统一的管理视图（只能靠批量操作栏零散操作，看不到整体顺序）。

**提议方案**：在后台新增一个「管理推荐」弹窗，展示所有已推荐的鸣潮 mod，支持拖拽调整顺序、一键取消推荐；顺序持久化到 `featured_order` 字段，前台 `getFeaturedMods` 改为按该字段排序。

**业务影响**：首页轮播从"被动按时间排"变为"主动编排"，提升重点内容的曝光效率与运营灵活性。

---

## Success Metrics

**主要 KPI：**
- 管理员完成一次「拖拽排序并保存」的平均操作步数 ≤ 4 步（打开弹窗 → 拖拽 → 保存）。
- 排序保存后，前台轮播顺序 100% 与后台设定一致（`revalidatePath` 后刷新可见）。
- 取消推荐后，该 mod 不再出现在 `getFeaturedMods` 结果中。

**验证方式**：开发完成后在 staging 手动操作验证；上线后观察首页轮播点击/曝光变化。

---

## User Personas

### 主角色：站点管理员 / 运营
- **角色**：后台 `/admin/mods` 的使用者（已登录 admin）。
- **目标**：编排首页轮播图，突出重点 mod，控制曝光顺序。
- **痛点**：目前顺序不可控、推荐状态散落在批量操作栏里，缺少整体视图。
- **技术水平**：中级（熟悉后台操作，不写代码）。

---

## User Stories & Acceptance Criteria

### Story 1：打开推荐管理框

**作为** 管理员
**我想要** 在白色筛选卡片上点击「管理推荐」按钮弹出管理框
**以便** 集中查看和编排所有已推荐的鸣潮 mod

**验收标准：**
- [ ] 「管理推荐」按钮渲染在白色筛选卡片右上角，与「补齐创作者」「批量选择」并列。
- [ ] 点击后弹出管理框（Modal/Dialog），点击遮罩或关闭按钮可关闭。
- [ ] 管理框内展示所有 `game_key = wuthering-waves` 且 `is_featured = true` 的 mod（含已下线 mod，标注状态）。

### Story 2：查看推荐列表与顺序

**作为** 管理员
**我想要** 在管理框里看到每个推荐 mod 的缩略图、标题、角色和当前顺序
**以便** 快速判断当前轮播编排

**验收标准：**
- [ ] 每项显示封面缩略图、标题、角色名。
- [ ] 列表按 `featured_order` 升序展示（未排序的按创建时间倒序兜底）。
- [ ] 顶部显示总数与「轮播最多展示前 6 个」的提示。

### Story 3：拖拽排序

**作为** 管理员
**我想要** 拖拽调整推荐 mod 的顺序并保存
**以便** 控制它们在首页轮播的先后

**验收标准：**
- [ ] 拖拽推荐项可实时改变列表顺序（@dnd-kit/sortable）。
- [ ] 点击「保存顺序」后，按当前顺序批量写回 `featured_order`（1..N）。
- [ ] 保存成功后前台 `getFeaturedMods` 按新顺序返回（前 6 个进轮播）。

### Story 4：取消推荐

**作为** 管理员
**我想要** 在管理框里移除某个 mod 的推荐
**以便** 让它退出首页轮播

**验收标准：**
- [ ] 每个推荐项有「取消推荐」操作。
- [ ] 取消后该 mod 的 `is_featured` 置 false、`featured_order` 置 null，并从列表移除。
- [ ] 其它推荐项的顺序不受影响（允许顺序留空位）。

---

## Functional Requirements

### 核心功能

**Feature 1：入口按钮**
- 位置：`AdminModsToolbar` 白色卡片右上角 `rightSlot`（与补齐创作者、批量选择并列）。
- 交互：点击打开管理框。

**Feature 2：推荐管理框**
- 数据来源：新 Server Action 返回 `game_key = wuthering-waves` 且 `is_featured = true` 的 mod 列表。
- 展示：封面缩略图 + 标题 + 角色 + 顺序编号 + 状态（已下线标注）。
- 排序：@dnd-kit/sortable 拖拽。
- 保存：拖拽后点「保存顺序」，调用 `reorderFeaturedMods(orderedIds)` 批量写 `featured_order`。
- 移除：每项「取消推荐」，调用单条更新，清空 `is_featured` 与 `featured_order`。
- 引导：底部提示「添加推荐请回到列表，勾选后使用批量推荐」。

**Feature 3：读取顺序调整（前台）**
- `getFeaturedMods` 排序改为 `featured_order` 升序（null 排最后），再以 `created_at` 倒序兜底。

### Out of Scope
- 不新增"添加推荐"的弹窗内搜索器（复用列表页已有的「批量推荐」）。
- 不支持多游戏各自编排（本期仅鸣潮）。
- 不支持轮播数量配置（固定 6 张）。
- 不支持草稿进轮播（前台仍只显示 `is_published = true`）。

---

## Technical Constraints

### 数据模型
- `mods` 表新增 `featured_order` 整数字段（可空）。**需一次 Supabase 迁移**。
- 同步更新 `src/types/supabase.ts`（mods Row/Insert/Update）与 `src/lib/mods-domain/types.ts`、`mappers.ts`（`featuredOrder?: number | null`）。

### 服务端
- 新增 `src/actions/admin/featured-actions.ts`：`getFeaturedModsAdmin()`、`reorderFeaturedMods(orderedIds)`、`setModFeatured(id, isFeatured)`。
- 所有 action 均 `requireAdminUser`，与现有 `batch-actions.ts` 保持一致。

### 前端
- 复用 `@dnd-kit/core` + `@dnd-kit/sortable`（已在依赖中）。
- 管理框复用现有 neo-brutalism 风格（`border-4 border-black` + 硬阴影），与 `batch-edit-modal` 一致。
- 组件为 Client Component（`"use client"`），数据经 Server Action 获取。

### 安全
- 仅 admin 可读/写；排序写回前校验 id 均为鸣潮已推荐 mod，防越权/脏数据。

### 性能
- 推荐列表量级极小（≤ 数十），无分页/缓存压力。

---

## MVP Scope & Phasing

### Phase 1：MVP
- `featured_order` 字段迁移 + 类型/映射更新。
- 前台 `getFeaturedMods` 排序调整。
- 「管理推荐」按钮 + 弹窗（展示已推荐、拖拽排序、取消推荐）。

### Phase 2：增强
- 弹窗内直接搜索/添加推荐（不依赖列表页批量操作）。
- 轮播数量可配置。
- 多游戏分别编排。

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| 数据库迁移破坏现有数据 | 低 | 高 | 迁移用 `ADD COLUMN ... NULL`，无默认值影响；迁移前备份 |
| 拖拽保存与旧顺序冲突（并发） | 低 | 中 | 保存按完整 orderedIds 全量重写，幂等 |
| 取消推荐遗留脏 `featured_order` | 低 | 低 | 取消时同步置 null |
| 前台缓存未刷新导致顺序不更新 | 中 | 中 | action 内 `revalidatePath("/")` + `/admin/mods` |

---

## Dependencies & Blockers

**依赖：**
- Supabase 数据库迁移：`mods.featured_order` 字段（需用户授权执行）。
- `src/types/supabase.ts` 类型与数据库实际 schema 一致。

**已知阻塞：**
- 无（`is_featured`、`batchFeatureMods`、`@dnd-kit/sortable` 均已就绪）。

---

## Appendix

### Glossary
- **推荐 / Featured**：`is_featured = true` 的 mod，进入首页轮播候选池。
- **轮播图**：首页 `HeroCarousel`，固定展示 6 张推荐 mod。
- **featured_order**：新增的排序字段，决定推荐 mod 在轮播中的先后。

### References
- `src/components/features/home/hero-carousel.tsx`（前台轮播）
- `src/lib/mods-domain/public.ts` `getFeaturedMods`
- `src/actions/admin/batch-actions.ts` `batchFeatureMods`
- `src/components/features/admin/mods/batch-action-bar.tsx`（批量推荐入口）

---

*本 PRD 通过交互式需求收集与质量评分生成，覆盖业务、功能、UX 与技术维度。*
