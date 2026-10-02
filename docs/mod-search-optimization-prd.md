# Product Requirements Document: 搜索优化（召回放宽 + 相关度排序 + 输入体验）

**Version**: 1.0
**Date**: 2026-10-02
**Author**: Sarah (Product Owner)
**Quality Score**: 82/100

---

## Executive Summary

`/mods` 的搜索在一个「找东西」的场景里，做了两件让人找不到东西的事：**多关键词一律严格 AND**（打两个词少一个就 0 结果）、**结果不按相关度排**（最匹配的那条可能埋在第三页）。用户搜不到时不知道是自己打错了还是站里没有，只能换词重试。

本次不动匹配字段、不动搜索入口架构，只做三件事：**AND 优先、0 结果才自动放宽为 OR 并明确标出**；**按命中字段加权排序**（标题 > 角色 > 描述/网盘）；**补上输入框清空按钮与 `/`、`Esc` 快捷键**。

搜索是实现里唯一一处匹配逻辑（`applyModQueryFilters`），改它一处，`/mods`、顶栏全局框、游戏分站、ZZZ 四个入口**同时受益**。

---

## Problem Statement

**Current Situation（代码事实）**

匹配逻辑只有一处：`src/lib/mods-domain/sorting.ts:100-110`。

```ts
const normalizedQuery = filters.query?.split(/[,，\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
nextMods = nextMods.filter((mod) => {
  const haystack = [mod.title, mod.character, mod.description, ...mod.driveLinks.map((d) => d.platform)].join(" ").toLowerCase();
  return normalizedQuery.every((keyword) => haystack.includes(keyword));  // ← AND
});
```

| # | 问题 | 证据 |
|---|---|---|
| 1 | **多关键词严格 AND** | `:108` 的 `every()`。搜「千咲 女仆」，描述里没写「女仆」就 0 结果 —— 用户看到的是空白，不是"没这项" |
| 2 | **无相关度排序** | `getPublicMods` 过滤后直接 `applyModSort(sort)`（`public.ts:254`）。标题里直接写着「千咲」的与描述里顺带提一句的，按同一个 `latest` 排 |
| 3 | **清空要两步** | 输入框内无清空按钮（`mods-toolbar.tsx:274-289`），必须先提交一次，再用生成的「搜索: xxx」筛选条去叉（`:441-449`） |
| 4 | **零快捷键** | 全仓库无 `/`、`Ctrl+K` 绑定 |
| 5 | **顶栏 placeholder 与实现不符** | `site-search-form.tsx:92` 写「搜索角色 / 标题 / 描述 / **标签**」，但 haystack 里第四样是**网盘平台名**，站内**没有 tags 字段**（`sorting.ts:107`） |

**Proposed Solution**

1. `applyModQueryFilters` 改为**一次遍历**同时算出 AND 命中集与 OR 命中数；AND 非空用 AND，为空则返回 OR 结果并带 `relaxed: true`。
2. 命中集按**字段权重**排序：标题 3 > 角色 2 > 描述 1 / 网盘 1；放宽路径下**命中词数**为第一关键字（见 Functional Requirements → 设计决策）。
3. 输入框加 ✕（清文字 + 立即取消筛选）、`/` 聚焦、`Esc` 清空。
4. 顺带修顶栏 placeholder 的文案错误。

**Business Impact**

- 定性：搜索从「换词重试」变成「一次就有东西看」。
- 客观：AND 有结果时结果集**与改动前逐条一致**（精准性零回归）；AND 为 0 时不再返回空白页。

---

## Success Metrics

用户已明确选择**定性验收**（口径沿用 `docs/mobile-layout-prd.md` 与 `docs/character-picker-drawer-prd.md`：「我自己看着舒服就行」）。以下为**正确性护栏**，不达标即视为未达成：

**Primary（护栏，必须全部通过）:**
- **精准性零回归**：任一 query，若改动前 AND 能匹配到 N 条（N>0），改动后返回的仍是这 N 条，**不多不少**
- **召回放宽有标记**：AND 为 0 且 OR 非 0 时，响应带 `relaxed: true`，且界面出现放宽提示；**AND 非 0 时这个标记绝不出现**
- **排序生效**：构造「标题命中」与「仅描述命中」各若干，断言前者**全部**排在后者之前
- **无 query 时零影响**：不带 `query` 的列表，结果顺序与改动前逐条一致
- **新纯函数有单测**（项目 TDD 优先），覆盖 AND 命中 / 放宽 / 权重排序 / 空结果四条路径

**Secondary（人工验收）:**
- 用户本人在 `/mods` 上搜几个自己常搜的词，确认「比以前好找」

**Validation**: 单测 + headless Chrome + CDP 在线上/本地各跑一遍（方法见附录 A）。

---

## User Personas

### Primary: 找特定 MOD 的玩家
- **Role**: 在 `/mods` 或顶栏搜索框找某个角色的某类 MOD
- **Goals**: 用一两个词定位到目标，且第一条就是最相关的
- **Pain Points**: 多打一个词就 0 结果，不知道是"没有"还是"搜法不对"；最匹配的被埋在后面
- **Technical Level**: 普通用户，不知道 AND/OR，只会加词减词

### Secondary: 站主
- **Role**: 上传与维护
- **Goals**: 抽查某个 MOD 是否搜得到（上传后自检）
- **Pain Points**: 明明库里有，搜不到时会怀疑自己传错了

> 说明：本站在桌面与移动端共用同一套搜索实现，本次改动**不区分端**。

---

## User Stories & Acceptance Criteria

### Story 1: 多打一个词不至于一无所获

**As a** 找 MOD 的玩家
**I want to** 搜「千咲 女仆」时，即使没有同时含这两个词的结果，也能看到含「千咲」的那些
**So that** 我不会以为站里没有，然后放弃

**Acceptance Criteria:**
- [ ] 分词后多关键词**先取交集（AND）**
- [ ] AND 结果非空 ⇒ 只返回交集，**响应不带** `relaxed`
- [ ] AND 为空且 OR 非空 ⇒ 返回 OR 结果，响应带 `relaxed: true`
- [ ] AND 与 OR 都为空 ⇒ 返回空集，`relaxed` 不置位（没有"被放宽"这回事）
- [ ] 放宽**只作用于 query 语义**，`character` / `direct` / `preview` 等其他筛选**照旧生效**
- [ ] 单关键词时 AND 与 OR 等价，**不得**因此产生 `relaxed` 标记
- [ ] 放宽提示在结果列表上方可见，文案说明「没有精确匹配，以下为部分匹配」；提示**不得**遮挡或替换搜索框

### Story 2: 最匹配的排在前面

**As a** 找 MOD 的玩家
**I want to** 标题里就写着关键词的结果排在描述里顺带提到的前面
**So that** 我不用翻页去找

**Acceptance Criteria:**
- [ ] 命中**标题**权重 3、**角色**权重 2、**描述**与**网盘平台**权重 1
- [ ] 一条 MOD 的相关度分 = 各关键词命中处的**最高**权重之和（同一关键词命中多个字段只取最高）
- [ ] 排序为：相关度分**降序**；同分时回落到用户当前选择的 `sort`（默认 `latest`）
- [ ] **仅当 query 非空时**才启用相关度排序；无 query 时排序逻辑与改动前完全一致
- [ ] 放宽路径下，**命中关键词个数**为第一关键字（降序），其后才是相关度分 —— 否则搜「千咲 女仆」时只中「女仆」的会与两个都中的并列（见设计决策）

### Story 3: 想清空时一步到位

**As a** 找 MOD 的玩家
**I want to** 直接在输入框里点 ✕ 就清掉
**So that** 我不用先提交一次再去找筛选条上的叉

**Acceptance Criteria:**
- [ ] 输入框有内容时，框内右侧出现 ✕；为空时不显示
- [ ] 点击 ✕ ⇒ 清空输入框**并立即取消该筛选**（导航到去掉 `query` 的 URL），因为搜索是写在 URL 上的筛选，只清框会让界面自相矛盾
- [ ] ✕ 取消筛选时**保留**当前 `character` / `sort` / `direct` / `preview`（与现有 `handleClearFilter("query")` 语义一致，`mods-toolbar.tsx:236-239`）
- [ ] 当前 URL 无 `query` 时，✕ 只清输入框文字，**不触发导航**

### Story 4: 键盘能走完全程

**As a** 键盘用户
**I want to** 按 `/` 跳到搜索框、按 `Esc` 清掉
**So that** 我不必来回摸鼠标

**Acceptance Criteria:**
- [ ] 页面任意位置按 `/` ⇒ 聚焦搜索输入框，且**不**把 `/` 字符写进输入框
- [ ] 焦点已在**可编辑元素**（input / textarea / contenteditable）内时，`/` **不得**劫持
- [ ] 焦点在搜索输入框内按 `Esc` ⇒ 清空并取消筛选（与 ✕ 同义）
- [ ] **浮层打开时 `Esc` 优先关浮层**，不得同时清掉搜索词（`/mods` 上的角色抽屉已占用 `Esc`）
- [ ] 快捷键不新增全局可见的 UI 元素（可用 title 提示）

---

## Functional Requirements

### Core Features

**Feature 1: 召回放宽（AND → 0 结果时 OR）**

- **Description**: 把 `applyModQueryFilters` 从「返回数组」改为返回 `{ mods, relaxed }`。实现必须**一次遍历**同时记录每条 MOD 命中的关键词个数：`命中数 === 关键词总数` 进入 AND 集，`命中数 > 0` 进入 OR 集。遍历后若 AND 非空取 AND，否则取 OR 并置 `relaxed`。
- **User flow**: 输入「千咲 女仆」→ 提交 → 无精确匹配 → 列表照常渲染 + 顶部一行放宽提示。
- **Edge cases**:
  - **禁止扫两遍全表**：全表现约 5292 条，且 `filter/sort` **不缓存**（`public.ts:52-70` 注释）。两趟遍历等于把每次搜索的成本翻倍。单趟同时算两个集合是硬要求。
  - **放宽标记必须随分页返回**：`/api/mods` 是分页接口，第 2 页也必须带同样的 `relaxed`，否则用户翻页后提示消失。标记由服务端每次根据 query + 当前筛选**重新计算**，不进 URL。
  - **放宽与缓存**：`/api/mods` 对带 `query` 的请求 CDN `maxAge = 60`（`route.ts:54-69`）。`relaxed` 是响应体字段，**不得**进缓存键。
  - **空白 query**：`parseModQuery` 已 trim 且全空白 ⇒ `undefined`（`sorting.ts:133-136`），此路径不进入搜索逻辑，不得产生 `relaxed`。
  - **单关键词**：AND 与 OR 恒等，**不得**产生 `relaxed`。
  - **放宽后仍为 0**：不置 `relaxed`，走既有空状态。
- **Error handling**: 纯函数，无 IO；异常路径不存在。

**Feature 2: 相关度排序**

- **Description**: 新增纯函数（建议 `scoreModRelevance(mod, keywords): number`）计算字段加权分，并在 `getPublicMods` 里当 `query` 非空时作为主排序键。
- **User flow**: 搜「千咲」→ 标题含「千咲」的在最前，描述提到的在后。
- **Edge cases**:
  - **与用户选的 `sort` 共存**：相关度为主键、`sort` 为次键。用户显式选了「热度」，搜索时仍是相关度优先 —— 这与「最匹配的埋在后面」这条痛点直接对应。
  - **`hot` 排序走的是另一条分支**（`sortModsByHot`，`public.ts:254`），需保证与相关度排序正确复合，不得让 `hot` 分支绕过相关度。
  - **稳定性**：同分同 `sort` 时必须保持原有次序，避免翻页时结果抖动。
- **Error handling**: 不适用。

**Feature 3: 输入框清空按钮**

- **Description**: 在 `mods-toolbar.tsx:274-289` 的 `<input>` 之后插入条件渲染的 ✕ 按钮（neo-brutalist 风格，与工具栏其它按钮一致）。
- **Edge cases**:
  - 输入框为空 ⇒ 不渲染 ✕（避免一个无效的点击目标）
  - 点击 ✕ 走**已有的** `handleClearFilter("query")` 路径，不新写一套导航逻辑；该函数已处理「用本地状态而非服务端 props」的坑（`mods-toolbar.tsx:156-157`）
  - ✕ 与筛选条上的叉**共存**，不互相取代

**Feature 4: 键盘快捷键**

- **Description**: 在工具栏组件内挂 `/` 与 `Esc` 监听。
- **Edge cases**:
  - `/` 必须 `preventDefault()`，否则字符会落进输入框
  - 焦点在可编辑元素内（`input`/`textarea`/`[contenteditable]`）时忽略 `/`
  - **`Esc` 与角色抽屉冲突**：抽屉打开时不得清搜索词。实现上应检查 `document.querySelector('[role="dialog"]')` 之类可判定的"有浮层"信号，而不是假设没人用 Esc
  - 监听器随组件卸载移除，不留常驻处理器
- **Error handling**: 不适用。

**Feature 5: 修顶栏搜索框文案（既有缺陷）**

- **Description**: `site-search-form.tsx:92` 的 placeholder 把「标签」改成实际能搜的第四样 —— 网盘。
- **说明**: 这是一个**已上线的文案错误**（宣称的能力不存在），与本次功能无关，一行修掉。若不想混进本次改动，可单独摘出。

### Out of Scope

- **角色别名进搜索**（搜「心」命中「心月狐」）—— 用户 2026-10-02 明确本次不做。`CHARACTER_ALIASES` 仍只作用于侧栏与 character 筛选。
- **扩字段**（作者 / 版本 / 文件名）—— 同上，明确不做。
- **即时搜索 / 联想下拉** —— 同上，保持回车触发。
  - ⚠️ **后续变更（2026-10-02）**：用户随后追加要求「搜索时弹出匹配选项」，本项已实现 —— 搜索框下方的候选框（标题 + 缩略图，点选直达详情、↑↓/Enter/Esc 键盘导航、中文输入法防护）。实现方案见 `C:\Users\qsy123\.claude\plans\wise-imagining-wadler.md`。匹配字段仍未扩展。
- **结果计数与空结果引导**（「找到 N 条」「试试去掉某个词」）—— 用户在选项里**未勾选**。
- **搜索自己的加载反馈** —— `docs/filter-loading-feedback-prd.md:102` 已划为 Out of Scope，本次不推翻。
- **三个搜索入口统一**（顶栏 / 工具栏 / 分站原生表单）—— 用户未列为痛点。注意：匹配逻辑共享，所以**质量改进会连带生效**，但 UI 仍各不相同。
- **性能与索引改造** —— 用户未列为痛点。现状是每次搜索全表内存扫描（无 per-query 缓存），本次只要求「不把成本翻倍」。
- **`/updates`、`/troubleshooting` 等其它页面的搜索** —— 它们没有搜索功能，且各有 PRD 明确不做。

---

## Technical Constraints

### Performance
- **不得让全表遍历次数翻倍**：放宽逻辑必须与 AND 判定共用同一趟遍历
- 不得新增数据库查询；不得改变 `unstable_cache` 的缓存键或 TTL（6 小时）
- 新增 JS 为纯函数与少量交互代码，不得引入新依赖

### Security
- 搜索词仍经 `parseModQuery` 处理，**不得**把原始 query 拼进任何 SQL / 正则
- 不得重新引入按 query 绕过 `pageSize` 钳制的路径（历史事故见 `filter-params.ts:26-30`：`?pageSize=999999` 曾可匿名整表导出）

### Integration
- **`applyModQueryFilters` 的签名变更**（数组 → `{ mods, relaxed }`）会波及 `getPublicMods`（`public.ts:237-257`）、`getPublicModsPage`、以及所有调用方。所有调用方**必须显式处理**新返回值，不允许静默忽略。
- **`relaxed` 需要一路传到 UI**：`getPublicModsPage` → `/api/mods` 响应体 → `fetchModsPage`（`mods-infinite-grid.tsx:35-86`）→ `ModsPage` 类型 → grid 渲染提示。这是一条**横跨 5 个文件的接线**，是本需求里最容易漏的一环。
- **分站与 ZZZ 共用匹配逻辑**：`default-game-mods-page.tsx` 与 ZZZ 的原生表单提交都走 `getPublicMods`，会自动获得新语义；需回归确认其页面不会因 `relaxed` 未渲染而报错。
- **共享组件**：`mods-toolbar.tsx` 同时被 `/mods` 与分站复用，✕ 与快捷键对两处同时生效，需一并验收。

### Technology Stack
- Next.js 16 (App Router) + React 19 + Tailwind v4 + TanStack Query
- **只允许 Tailwind + shadcn/ui，不引入新依赖**（项目规范）
- 部署：自托管腾讯云首尔（PM2 + Nginx）。**push 到 main 不会自动部署**，需上服务器 build 并重启 PM2

---

## MVP Scope & Phasing

### Phase 1: MVP（本次交付）
- 召回放宽（AND → 0 结果时 OR）+ `relaxed` 全链路接线 + 界面提示
- 相关度排序（字段权重；放宽路径下命中词数优先）
- 输入框 ✕、`/` 聚焦、`Esc` 清空
- 顶栏 placeholder 文案修正
- 纯函数单测（AND / 放宽 / 排序 / 空结果）
- 回归：无 query 的列表顺序与改动前逐条一致

**MVP Definition**: 在 `/mods` 搜「千咲 女仆」（或任一不存在全部关键词的组合）能看到结果 + 放宽提示，且搜单关键词时结果与改动前完全一致。交付即可独立上线。

### Phase 2: Enhancements（Post-Launch）
- 角色别名接入搜索（`CHARACTER_ALIASES`）
- 结果计数 + 空结果引导
- 搜索自己的加载反馈（需先推翻 `filter-loading-feedback-prd.md` 的结论）
- 即时搜索 / 联想下拉（需先评估全表扫描的请求放大）

### Future Considerations
- 为 query 建服务端结果缓存（现状每次全表扫描）
- 三个搜索入口的统一（含分站的原生表单）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| **精准性回归**：放宽逻辑写错，AND 有结果时也放宽了 | Med | **High** | 护栏明写「N>0 时结果集逐条一致」，并加单测正反例 |
| **`relaxed` 接线漏掉某一层**，提示永远不显示 | **High** | Med | 5 个文件的接线列为独立验收项，用 CDP 断言提示真实出现在 DOM 里 |
| 相关度排序打乱用户选的 `sort`，被当成 bug | Med | Med | 明确「相关度为主、`sort` 为次」并写进验收；无 query 时零影响 |
| `hot` 分支绕过相关度排序 | Med | Med | 专项验收 `sort=hot` + query 的组合 |
| 全表遍历翻倍导致搜索变慢 | Med | Med | 硬要求单趟遍历；上线前后各测一次搜索响应时间 |
| `Esc` 与角色抽屉抢按键 | Med | Low | 验收用例：抽屉打开时按 `Esc`，只关抽屉、搜索词还在 |
| 与并行 agent 冲突 | Med | Low | 本次文件集集中在 `mods-domain/*` 与 `mods-toolbar.tsx`；开工前同步分支状态 |

---

## Dependencies & Blockers

**Dependencies:**
- 无外部依赖。改动全部落在现有代码内。

**Known Blockers:**
- **Supabase 仍 `exceed_egress_quota`**（2026-10-02 构建日志确认），线上列表走 COS 兜底快照。两条路径的搜索语义一致（都是内存 `applyModQueryFilters`），**不影响本次交付**，但验收时要知道数据来自快照。

---

## Appendix

### A. 验证方法

单测（项目未装 Playwright，组件级交互沿用 headless Chrome + CDP）：

```bash
npm run test -- sorting            # 匹配与排序的纯函数单测
npm run test -- filter-params      # query 解析回归
npm run build                      # 收尾必跑
```

CDP 关键断言（`/mods?query=...`）：

```js
// 1) 放宽提示只在放宽时出现
document.querySelector('[data-slot="search-relaxed-notice"]') !== null
// 2) 结果顺序：标题命中的首条其 title 含关键词
document.querySelector('[data-slot="mod-card"]')?.textContent
// 3) ✕ 存在性与清空后的 URL
document.querySelector('[data-slot="search-clear"]')
location.search.includes("query=")
```

### B. 相关文件

| 文件 | 作用 |
|---|---|
| `src/lib/mods-domain/sorting.ts:100-110` | `applyModQueryFilters` —— 本次的核心改动点 |
| `src/lib/mods-domain/sorting.ts:133-136` | `parseModQuery`（trim，全空白 ⇒ undefined） |
| `src/lib/mods-domain/public.ts:237-257` | `getPublicMods`：filter + sort 收口处，接相关度排序 |
| `src/lib/mods-domain/public.ts:132-164` | `getAllPublishedMods`：分片缓存 + COS 快照兜底 |
| `src/lib/mods-domain/types.ts` | `ModsPage` 等类型，需加 `relaxed` |
| `src/app/api/mods/route.ts:33-73` | 分页接口；query 请求 `maxAge=60` |
| `src/components/features/mods/list/mods-toolbar.tsx:153-173` | `handleSearch`（含「原地踏步」短路） |
| `src/components/features/mods/list/mods-toolbar.tsx:236-239` | `handleClearFilter("query")`，✕ 复用它 |
| `src/components/features/mods/list/mods-toolbar.tsx:274-289` | 搜索输入框本体 |
| `src/components/layout/site-search-form.tsx:92` | 顶栏 placeholder（文案错误所在） |
| `src/components/features/mods/list/mods-infinite-grid.tsx:35-86,158` | `fetchModsPage` / queryKey，`relaxed` 的客户端入口 |
| `src/lib/mods-domain/sorting.test.ts:77-83` | 现有搜索单测（AND 语义），需扩写 |

### C. 设计决策记录

| 决策 | 理由 |
|---|---|
| AND 优先、0 结果才放宽 | 用户明确选择。精准性优先，只有在「一无所获」时才牺牲精准换召回 |
| 放宽标记由服务端每次重算，不进 URL | 它是结果的**属性**而非用户的**意图**；进 URL 会多一个可以被手工改坏的参数，且与 `isDefaultModsFilters` / 种子逻辑纠缠 |
| 相关度为主、用户 `sort` 为次 | 若不这样，选了「最新」的用户搜索时仍会看到最匹配的埋在下面 —— 那正是本次要治的痛点 |
| 放宽路径下命中词数优先 | 看似与「只按字段权重排」矛盾，实则必要：放宽后结果集里混着「全中」和「只中一个」的条目，不先按命中数排就会出现「只中 1 个词的排在 2 个词前面」。AND 路径下所有条目命中数相同，该键恒为常数，字段权重自然主导 |
| 单趟遍历算 AND + OR | 全表 5292 条且 filter/sort 不缓存；两趟等于成本翻倍 |
| ✕ = 清文字 + 立即取消筛选 | 搜索是 URL 上的筛选。只清框不生效会得到「框空了但列表还是筛过的」这种自相矛盾的界面 |
| 不做结果计数与空状态引导 | 用户在选项里未勾选，避免顺手扩范围 |
| 修顶栏 placeholder | 已上线的文案错误（宣称有 tags，实际没有），一行修掉；可单独摘出 |

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
