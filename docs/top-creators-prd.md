# Product Requirements Document: 优秀创作者功能

**Version**: 1.0
**Date**: 2026-06-12
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

WaveMod 绝区零分站 MOD 列表页右侧 Rail 目前展示硬编码的"优秀创作者"列表（5 个假名字 + 假粉丝数），链接死指向 `/support`。同时个人中心（Profile）页也是完全静态的 demo 页。

本功能基于 Supabase 真实数据，按 MOD 总下载量排名聚合创作者，在 Rail 中展示 Top 5，点击可跳转到该创作者的 Profile 页查看详情。Profile 页同步改造为展示真实用户数据。

---

## Problem Statement

**Current Situation**: Rail "优秀创作者" 和 Profile 页全部是硬编码假数据，无实际功能价值。

**Proposed Solution**:
1. 新建创作者聚合查询，从 `mods.created_by` 按总下载量排名
2. Rail 组件接入真实数据，点击跳转 Profile
3. Profile 页接收 `?user=` 参数，展示真实创作者信息和 MOD 列表

**Business Impact**: 创作者获得曝光和认可 → 激励更多 MOD 上传 → 内容生态正向循环

---

## Success Metrics

**Primary KPIs:**
- 创作者排名数据正确反映 MOD 下载量（与 mods 表数据一致）
- Rail 点击率：创作者条目被点击次数
- Profile 页访问量：`?user=xxx` 参数带来的页面访问

**Validation**: 上线后通过 Supabase 查询验证排名数据准确性，埋点统计点击和访问

---

## User Personas

### Primary: MOD 创作者
- **Role**: 在 WaveMod 上传 MOD 的用户
- **Goals**: 获得社区认可和曝光，吸引更多下载
- **Pain Points**: 目前无任何创作者展示机制
- **Technical Level**: Intermediate

### Secondary: MOD 浏览者
- **Role**: 浏览和下载 MOD 的普通用户
- **Goals**: 发现优质创作者，找到更多好 MOD
- **Pain Points**: 无法区分创作者质量

---

## User Stories & Acceptance Criteria

### Story 1: 浏览优秀创作者排名

**As a** MOD 浏览者
**I want to** 在 MOD 列表页右侧看到按下载量排名的创作者
**So that** 我能快速发现优质创作者

**Acceptance Criteria:**
- [ ] Rail 展示 Top 5 创作者，按总下载量降序排列
- [ ] 每个条目显示：排名序号、头像（首字兜底）、名字、下载量（显示为"粉丝"）
- [ ] 不足 5 人时用占位条目补齐（显示 "---" 或通用占位符）
- [ ] 数据来自 Supabase 实时聚合查询，缓存数小时

### Story 2: 点击创作者查看主页

**As a** MOD 浏览者
**I want to** 点击 Rail 中的创作者
**So that** 查看该创作者的详细信息和作品列表

**Acceptance Criteria:**
- [ ] 点击条目跳转到 `/zenless-zone-zero/profile?user=<userId>`
- [ ] Profile 页展示真实创作者信息：头像、名字、Bio
- [ ] Profile 页展示真实统计数据：MOD 数量、总下载量、总收藏数、总点赞数
- [ ] Profile 页展示该创作者发布的 MOD 列表

### Story 3: 创作者查看自己的 Profile

**As a** 创作者
**I want to** 访问自己的 Profile 页
**So that** 看到我的作品和统计数据

**Acceptance Criteria:**
- [ ] 无 `?user=` 参数时（或 user=自己），展示当前登录用户的数据
- [ ] 未登录用户访问无参数 Profile 页时展示空状态提示

---

## Functional Requirements

### Core Features

**Feature 1: 创作者聚合查询 (`getTopCreators`)**
- 位置：`src/lib/mods-domain/` 新建或扩展现有文件
- 查询逻辑：
  1. 从 `mods` 表按 `game_key` 筛选已发布 MOD
  2. 按 `created_by` 分组，SUM(downloads_count) 作为总下载量
  3. JOIN `profiles` 获取 `display_name`、`avatar_url`
  4. 按总下载量降序排序，LIMIT 取 Top N
- 缓存策略：`"use cache"` + `cacheTag("creators:ranking")` + `cacheLife("hours")`
- 边界情况：`created_by` 为 NULL 的 MOD 跳过；无创作者时返回空数组

**Feature 2: Rail "优秀创作者" 改造**
- 位置：`src/features/games/zenless-zone-zero/components/zenless-mods-rail.tsx`
- 数据源：从 page 层传入 `topCreators`（调用 `getTopCreators`）
- 展示：
  - 真实创作者：排名号 + 首字头像 + displayName + 下载量
  - 占位条目（补齐到 5）：灰色显示 "---" + "虚位以待"
- 链接：`/zenless-zone-zero/profile?user=<userId>`

**Feature 3: Profile 页真实化**
- 位置：`src/app/[game]/profile/page.tsx`
- 接收参数：`searchParams.user`（可选）
- 数据获取：
  - 有 `?user=xxx`：查 profiles + 该用户的 mods
  - 无参数：查当前登录用户（`getCurrentUser`）的数据
- 替换硬编码：
  - 名字 → `profile.display_name`
  - 头像 → `profile.avatar_url`（兜底首字圆形）
  - 统计 → 真实聚合值
  - MOD 列表 → 真实发布的 MOD
- 兜底：用户不存在时显示 "创作者未找到"

### Out of Scope
- 创作者关注/取关功能
- 创作者数据分析面板
- 创作者徽章/成就系统
- Premium 付费功能
- 创作者的 Bio 编辑功能

---

## Technical Constraints

### Performance
- 聚合查询需使用 `"use cache"` 缓存，避免每次页面加载都全表扫描
- 缓存生命周期：数小时（`cacheLife("hours")`）
- Profile 页查询需添加适当的 DB 索引：`mods.created_by` 已有外键约束

### Security
- 仅查询 `is_published = true` 的 MOD 参与排名
- Profile 页不暴露用户 email、phone 等隐私字段
- 使用 `createPublicReadClient`（anon key）进行所有查询

### Integration
- **Supabase**: `mods` 表 + `profiles` 表 JOIN 查询
- **Next.js Cache**: `"use cache"` + `cacheTag` 实现缓存刷新
- **现有组件**: Rail、Profile 页、路由 `/zenless-zone-zero/profile`

### Technology Stack
- Server Components 优先（数据获取在服务端）
- TypeScript 严格模式
- Tailwind CSS + neo-brutalism 风格
- 不引入新的第三方库

---

## MVP Scope & Phasing

### Phase 1: MVP（本次迭代）
- `getTopCreators` 聚合查询函数
- Rail "优秀创作者" 接入真实数据
- Profile 页支持 `?user=` 参数并展示真实数据

### Phase 2: Enhancements（后续）
- 创作者的 Bio 编辑
- 多种排名维度切换（按 MOD 数、按评分等）
- 创作者详情页独立路由 `/creator/[id]`

### Future Considerations
- 创作者关注系统
- 创作者数据分析后台
- 月度/季度创作者榜单

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| 聚合查询性能差（mods 表数据量大） | Low | Med | 用 cache 缓存，必要时加物化视图 |
| 创作者 profile 不存在于 profiles 表 | Med | Low | 查询时 LEFT JOIN，NULL 值兜底 |
| Profile 页改造影响其他游戏分站 | Low | Med | 使用 `[game]` 动态路由参数隔离 |

---

## Dependencies & Blockers

**Dependencies:**
- Supabase `mods` 表的 `created_by` 字段有值（非 NULL）
- `profiles` 表有对应的用户记录

**Known Blockers:**
- 当前绝区零 MOD 的 `created_by` 可能多为 NULL（测试数据） → 排名可能为空，需要占位补齐

---

## Appendix

### Glossary
- **创作者 (Creator)**: 在 WaveMod 上传 MOD 的用户，由 `mods.created_by` 标识
- **总下载量**: 该创作者所有已发布 MOD 的 `downloads_count` 总和

### References
- `supabase/schema.sql` — 数据库表结构
- `src/lib/mods-domain/public.ts` — 现有 MOD 查询模式
- `src/features/games/zenless-zone-zero/components/zenless-mods-rail.tsx` — Rail 组件
- `src/app/[game]/profile/page.tsx` — Profile 页

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
