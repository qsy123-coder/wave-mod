# Product Requirements Document: 每日更新功能 (Daily Mod Updates)

**Version**: 1.0
**Date**: 2026-09-06
**Author**: Sarah (Product Owner)
**Quality Score**: 96/100

---

## Executive Summary

主理人每天上传 4~10 个鸣潮 MOD，但这些每日上新目前在首页没有一个明确的聚合入口——用户只能靠"最新更新"卡片翻看，无法感知"今天到底上新了什么、过去几天连续上新了什么"。

本功能新增一个 **站点级每日更新页 `/updates`**，按日期倒序以时间线分组展示最近 14 天的每日更新 MOD，并在顶部提供日期胶囊导航。同时把 **首页灯箱通知栏** 与 **首页第二屏右侧"最新更新"卡片** 改造成每日更新入口：进站当天弹一次"今日更新"灯箱提醒，第二屏卡片文案改为"今日更新的 mod"、内容替换为当日 MOD、"查看全部"直达每日更新页。目标是让"每日上新"成为网站的强感知信号，提升回访与内容发现效率。

---

## Problem Statement

**Current Situation**
- 每日上传的 MOD 散落在"最新更新"（`ZenlessLatestUpdates`）与"精选"里，没有按日期聚合的独立视图。
- 首页灯箱（`FirstVisitDialog`）只在首次访问弹出教程提醒，首访后不再出现，没有承载"每日更新"信息。
- 首页第二屏"最新更新"卡片显示的是伪造的相对时间（"Just now""2h ago"），且"查看全部"跳的是 `/mods?sort=latest` 普通列表，不是专门按日期的页面。

**Proposed Solution**
- 新增站点级页面 `/updates`：最近 14 天、日期倒序、每天一个日期头 + 该日 MOD 网格卡片；顶部日期胶囊锚点跳转。
- 首页灯箱通知栏改造为"今日更新"灯箱：每天弹一次（当天关闭后不再弹），展示当日上新数量 + "查看今日更新"入口。
- 首页第二屏"最新更新"卡片→"今日更新的 mod"：内容为当日 MOD，"查看全部"→`/updates`。

**Business Impact**
- 让"每日上新"成为回访理由，提升用户回流。
- 缩短用户发现新 MOD 的时间——当天内容一眼可见。
- 为主理人提供一个清晰的每日产出沉淀视图。

---

## Success Metrics

**Primary KPIs:**
- `/updates` 页面访问量：上线后目标为首页流量的 15%+。
- 灯箱"查看今日更新"点击率：目标 40%+（弹窗用户中）。
- 当日上新 MOD 的详情页点击率：目标随卡片曝光 30%+。

**Validation**: 通过 Vercel/Cloudflare 分析统计 `/updates` PV、灯箱按钮事件、卡片点击数据。

---

## User Personas

### Primary: 鸣潮 MOD 玩家 / 回访用户
- **Role**: 定期来站下载 MOD 的玩家，关注"有没有新的角色外观/皮肤"。
- **Goals**: 快速知道今天与最近几天上了哪些新 MOD，找到感兴趣的下载。
- **Pain Points**: 之前只能翻最新列表，不知道哪部分是"今天新上的"。
- **Technical Level**: Intermediate（会装 XXMI，熟悉网站流程）。

### Secondary: 主理人（单主理人精选发布）
- **Role**: 每天上传 4~10 个 MOD 的内容发布者。
- **Goals**: 让每天的上新被用户清楚看到，形成稳定的更新节奏认知。
- **Pain Points**: 希望每日产出有清晰的沉淀与展示位。

---

## User Stories & Acceptance Criteria

### Story 1: 浏览每日更新时间线
**As a** 玩家
**I want to** 打开 `/updates` 看到最近 14 天逐日分组的上新
**So that** 我能一眼辨出"今天和最近几天"各上了哪些 MOD

**Acceptance Criteria:**
- [ ] 页面默认展示鸣潮（默认游戏）最近 14 天的已发布 MOD。
- [ ] 按日期倒序分组：今天在最顶，随后逐日向早。
- [ ] 每天一个日期头（如 `2026-09-06（今天）· +4`），下方是该日 MOD 网格卡片。
- [ ] 无新 MOD 的日期不显示空分组。

### Story 2: 日期胶囊锚点跳转
**As a** 玩家
**I want to** 顶部的日期胶囊快速跳到某一天
**So that** 不必一直往下滚就能看到指定日期的上新

**Acceptance Criteria:**
- [ ] 顶部一排最近 14 天日期胶囊（默认"今天"高亮）。
- [ ] 点击某胶囊，页面平滑滚动到该日期分组。
- [ ] 数据来源 / 加载：最近 14 天一次性加载，无分页；胶囊不做单日筛选（锚点跳转）。

### Story 3: 进入单 MOD 详情
**As a** 玩家
**I want to** 点击某一天的 MOD 卡片进入详情
**So that** 我能查看并下载

**Acceptance Criteria:**
- [ ] 卡片复用现有 MOD 网格卡片组件，点击跳转该 MOD 详情（`/mods/{id}`）。
- [ ] 卡片展示封面图、角色、标题、评分、下载数等既有字段。

### Story 4: 首页灯箱"今日更新"入口
**As a** 玩家
**I want to** 进站当天看到一次"今日更新"灯箱并一键进入每日更新页
**So that** 我能第一时间知道今天上了什么

**Acceptance Criteria:**
- [ ] 复用首访灯箱样式（neo-brutalism 硬边框弹窗），文案变为"今日更新"。
- [ ] 展示今日上新数量 + "查看今日更新"按钮，按钮点击跳转 `/updates`。
- [ ] **每天最多弹出一次**：当天关闭后，当天内再次进站不弹；用 localStorage 键（含日期字符串）记录。
- [ ] 弹窗关闭（点 X 或"待会再看"）不永久屏蔽，次日/下一天仍会弹。

### Story 5: 首页第二屏"今日更新的 mod"卡片
**As a** 玩家
**I want to** 在首页第二屏右侧看到"今日更新的 mod"并直达每日更新页
**So that** 首页也能感知今天的新上内容

**Acceptance Criteria:**
- [ ] `ZenlessLatestUpdates` 卡片标题"最新更新"→"今日更新的 mod"。
- [ ] 卡片内容替换为**当日**更新的 MOD（每项可点击跳详情）。
- [ ] 卡片内"查看全部"链接 → `/updates`（不再跳 `/mods?sort=latest`）。
- [ ] 当日无 MOD 时显示占位文案（如"今日暂无更新"）。

### Story 6: 下架重上 / 编辑后的 MOD 不计入每日更新
**As a** 主理人
**I want to** 被编辑过或下架后重上线的 MOD 不冒充"今天的更新"
**So that** 每日更新页面忠实反映真正的首次上新时间

**Acceptance Criteria:**
- [ ] 更新判定**只用 `created_at`**（原始首次创建时间），`updated_at` 上的一切变化都忽略。
- [ ] 编辑 MOD（只改 `updated_at`）→ `created_at` 不变 → 不落入"今天"，归入其最初创建那天。
- [ ] 下架（`is_published=false`）再上线（`is_published=true`）→ `created_at` 不变 → 不落入"今天"，归入其最初创建那天。
- [ ] 已被过滤 `is_published=true`，下架中的 MOD 不展示。
- [ ] 代码注释明确标注：分组与"今日更新"判定**禁用 `updated_at`**。

---

## Functional Requirements

### Core Features

**Feature 1: 每日更新页 `/updates`**
- Description: 站点级页面，默认鸣潮（默认游戏），最近 14 天时间线分组。
- User flow: 进入 `/updates` → 加载最近 14 天已发布 MOD → 按 `created_at` 日期分组 → 天数倒序渲染 → 每个日期头 + 网格卡片 → 点击卡片进详情；顶部日期胶囊锚点跳转。
- Edge cases:
  - 某天无 MOD：不渲染该空分组。
  - 14 天内无任何 MOD：整页显示空状态（"最近 14 天暂无更新"）。
  - 今日无 MOD：不显示"今天"分组，但灯箱不弹（或显示 0 并仍可点入）。
- Error handling: 数据请求失败 → 显示错误占位，可重试；不阻塞整站。

**Feature 2: 日期胶囊导航**
- Description: 顶部分行展示最近 14 天 pill，点击锚点滚动到对应分组。
- User flow: 加载后计算最近 14 天日期集合 → 渲染 pill → 点击 `scrollIntoView` 到该日分组锚点（`id` 为日期）。
- Edge cases: 某天无数据的 pill 置灰或不可点；当前高亮"今天"。

**Feature 3: 首页灯箱"今日更新"**
- Description: 将 `FirstVisitDialog` 改造为每日更新灯箱。
- User flow: 进站点 → 检查 localStorage 当天日期键 → 若当天未关闭则弹 → 显示今日数量 → "查看今日更新"→ `/updates`；关闭写入当天日期键。
- Edge cases: 当日无新 MOD → 可显示"今日暂无更新"或隐藏"查看"；首次进站用户仍应能找到教程（导航"先看我"保留，教程入口不因弹窗改造而丢失）。
- Error handling: localStorage 读写失败 → 仍弹出（不因存储异常而阻断）。

**Feature 4: 首页第二屏卡片改造**
- Description: `ZenlessLatestUpdates` 标题、内容、链接更新。
- User flow: 首页第二屏右侧 → 显示"今日更新的 mod"→ 当日 MOD 条目 → 点击单条进详情 / "查看全部"进 `/updates`。
- Edge cases: 今日无 MOD → 占位文案。

### Out of Scope
- **不做** 非鸣潮游戏（绝区零等）的独立每日更新页——`/updates` 默认鸣潮，必要时通过 `?game=` 参数扩展其他游戏（本期不实现完整聚合）。
- **不做** 手动日期批次/上架日期字段——沿用 `created_at`，不加数据库字段。
- **不做** 无限滚动或分页——14 天内一次性加载。
- **不做** 日历热力图视图——本期采用时间线 + 日期胶囊。

---

## Technical Constraints

### Performance
- `/updates` 用 Server Component，服务端拼数据，减少客户端加载。
- 数据查询需**按 `created_at` 日期范围过滤**（最近 14 天），**避免复用当前 `getPublicMods` 全量分批拉取**（它遍历所有 1000 行批次）；新增 `getDailyUpdates(days, gameKey)` 领域函数，直接 `gte("created_at", ...)`，控制返回量。
- 首页第二屏与灯箱保持轻量：沿用 `LazyHomeLower` 的懒加载/滚动触发，灯箱只请求当日计数。

### Security
- 仅展示 `is_published=true` 的 MOD；沿用现有公开读取客户端（`createPublicReadClient`），无新增权限面。
- **禁止** 将 `updated_at` 用于更新判定（避免下架重上被误计为"今日新"）。

### Integration
- **Supabase**: `mods` 表，字段 `created_at`（分组依据）、`updated_at`（仅作参考，绝不用于判定）、`is_published`、`game_key`。
- **数据链路**: 新领域函数 → 新 API 路由（`/api/updates`）→ 页面/灯箱消费。
- **路由**: 站点级 `src/app/(site)/updates/page.tsx`（与 `/mods`、`/guide` 等 `(site)` 页面一致）；入口链接用 `game.nav.mods` 同源的站点路径。

### Technology Stack
- Next.js 15 App Router、TypeScript、Tailwind + shadcn/ui（neo-brutalism 风格）。
- 复用既有 MOD 网格卡片组件（当前"精选 MOD"/`/mods` 列表用到的卡片）。
- 日期处理用原生 `Date` + `Intl`（或项目现有工具），避免新手依赖。

---

## MVP Scope & Phasing

### Phase 1: MVP (Required for Initial Launch)
- [ ] `/updates` 页面：最近 14 天时间线分组 + 日期胶囊锚点。
- [ ] 新增 `getDailyUpdates(days, gameKey)` + `/api/updates` 路由。
- [ ] 首页第二屏 `ZenlessLatestUpdates` → "今日更新的 mod" + "查看全部" `/updates`。
- [ ] 首页灯箱 `FirstVisitDialog` → "今日更新"（每天一次）。
- [ ] 下架重上不计入（用 `created_at`，不加字段）。

**MVP Definition**: 用户能从首页两处入口进入 `/updates`，按日期看到最近 14 天每日上新，并进入详情。

### Phase 2: Enhancements (Post-Launch)
- [ ] `?game=` 参数支持多游戏每日更新。
- [ ] 今日无更新的更好空状态/引导（如"看历史"）。
- [ ] 日分组内按下载量/热度二次排序。
- [ ] 统一日期展示格式与相对时间。

### Future Considerations
- 日历热力图视图。
- 订阅/通知（每日上新推送）。
- 与创作者主页的每日动态联动。

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 全量拉取 `getPublicMods` 性能差 | Med | High | 新增按日期范围过滤的 `getDailyUpdates`，只查最近 14 天 |
| 下架重上 / 编辑后被误计为"今日新" | Low | Med | 分组严格只认 `created_at`；代码注释明确禁用 `updated_at` |
| 灯箱每天弹一次导致打扰 | Med | Med | 当天关闭即静默；文案轻量；提供"待会再看" |
| 首访教程引导因弹窗改造而弱化 | Med | Med | 保留导航"先看我"教程入口；灯箱内可加次要"看教程"链接 |
| 首页卡片当日无数据出现空白 | Med | Med | 提供占位文案"今日暂无更新" |

---

## Dependencies & Blockers

**Dependencies:**
- Supabase `mods` 表字段 `created_at`、`is_published`、`game_key` 已存在，无迁移需求。
- 现有 MOD 网格卡片组件与 `/mods` 列表页（复用）。

**Known Blockers:**
- 无已知阻断。

---

## Appendix

### Glossary
- **今日更新 / 每日更新**: 按 `created_at`（首次创建时间）同日分组的一次上新的 MOD 集合。
- **下架重上 / 编辑**: `updated_at` 被改变（下架再上线、或编辑 MOD 内容）的处置；因 `created_at` 不变，二者均不计入新的"每日更新"，归入最初创建那天。

### References
- 首页：`src/app/(home)/page.tsx`
- 首页灯箱：`src/components/common/first-visit-dialog.tsx`
- 第二屏组件：`src/features/games/zenless-zone-zero/components/zenless-lower-home.tsx`（`ZenlessLatestUpdates`）
- 第二屏数据链路：`src/components/features/home/lazy-lower-home.tsx`、`src/app/api/home/lower/route.ts`
- MOD 领域层：`src/lib/mods-domain/public.ts`、`src/lib/mods-domain/types.ts`（`SiteMod.createdAt`）
- MOD 列表页（卡片复用参考）：`src/app/(site)/mods/page.tsx`、`src/components/features/mods/list/mods-listing.tsx`

---

*本 PRD 通过交互式需求采集与质量评分生成，确保覆盖业务、功能、UX、技术四个维度。*
