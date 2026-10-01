# Product Requirements Document: 移动端布局优化

**Version**: 1.0
**Date**: 2026-10-02
**Author**: Sarah (Product Owner)
**Quality Score**: 86/100

---

## Executive Summary

WaveMod 在手机上有两个**已复现、已定位根因**的布局缺陷，都会直接损害「高清预览」这个核心卖点：首页轮播卡片的右边缘被切掉，`/mods` 列表页人物预览被压到看不见。

这不是主观的「不够好看」，而是两个具体的代码问题。本文档把范围收窄到**只修这两个缺陷**，不动信息架构、不引入新依赖，改动面小且可逐条验收。

详情页与详情抽屉在需求澄清中被明确移出本次范围（见 Functional Requirements → Out of Scope）。

---

## Problem Statement

**Current Situation**

| # | 缺陷 | 实测证据 |
|---|---|---|
| 1 | 首页轮播卡片右边缘超出视口，被屏幕切掉 | 在 390px 视口下 `getBoundingClientRect()` 返回 `left=20, right=395, width=375, height=694`；右边缘越过视口 5px。**在 375px 机型上会切掉约 20px** |
| 2 | `/mods` 手机默认 5 列，预览图不可辨认 | 390px 视口下实测一屏 5 列，30 张预览图宽度**全部为 23px** |

**根因（已定位到代码，并经 CDP 实测逐个证实）**

- **缺陷 1（主因）**：首页 hero 的网格容器 `<div className="relative grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">` 的网格项（`HeroCarousel` 最外层的 `MotionReveal`）**缺 `min-w-0`**。网格项默认 `min-width: auto`，会被内容的 min-content 顶住 —— 轮播的 min-content 实测 **351px**，而网格轨道只有 **295px**，于是整块内容比容器宽出 56px；外层面板是 `overflow-hidden`，超出的部分被硬切。**祖先链实测：网格容器 `w=295`，其子项 `w=351`。**
  - 附带项：卡片容器的 `rotate-2` 会让包围盒再额外多顶出约 4px（不是根因，实测证实）。
- **缺陷 1b**：轮播底部指标行的**内层** `<div className="flex items-center gap-3">` 缺 `flex-wrap`（外层有）。圆点 + 「推荐精选 02/06」在 295px 内容宽内放不下，撑到 375px，被面板在 359px 处裁掉 —— 计数右边被切。
- **缺陷 2**：`src/components/features/mods/list/mods-infinite-grid.tsx` 里 `colCount = masonryColumns ?? autoColCount`，而 `use-layout-preference.ts` 的 `readColumns()` 在用户未选择时**兜了一个写死的 5**（而非返回 `null`），使 `??` 右侧恒不取值 —— 「按宽度自适应」那条分支事实上是**死代码**，列数被钉死在 5。

**Proposed Solution**

1. 轮播卡片在移动端取消倾斜（桌面端保留倾斜风格，这是这套 neo 视觉的标志）。
2. `/mods` 的自动列数改为**按断点响应式**，手机默认 2 列；保留用户手动切换 3/4 列的能力。

---

## Success Metrics

用户已明确选择**定性验收**（"我自己看着舒服就行"），不设业务 KPI。以下为**正确性护栏**（不达标即视为缺陷未修复），而非增长指标：

**Primary（护栏，必须全部通过）:**
- **无横向溢出**：在 390px 与 375px 视口下，`document.documentElement.scrollWidth === documentElement.clientWidth`，且**不存在右边缘超过视口的未被裁切元素**
- **轮播卡片完整可见**：卡片包围盒 `right <= viewport width`
- **预览图可辨认**：`/mods` 手机默认布局下，单张预览图渲染宽度 **≥ 100px**

**Secondary（人工验收）:**
- 用户本人在真机 375–430px 上逐页确认「看着舒服」

**Validation**: 用附录 A 的 headless Chrome + CDP 脚本在 375px / 390px 两档跑一遍，人工截图确认。

---

## User Personas

### Primary: 手机访客（鸣潮玩家）
- **Role**: 通过手机浏览器（QQ 群/搜索引擎进入）浏览 MOD，主要目的是**看预览图判断要不要下载**
- **Goals**: 快速看清人物预览、快速找到想要的 MOD
- **Pain Points**: 预览图太小看不清，需要反复点进详情；轮播右侧内容被切
- **Technical Level**: 普通用户，不会去切列数开关或双指缩放

### Secondary: 主理人（本站所有者）
- **Role**: 上传与维护 MOD 的人
- **Goals**: 用手机快速抽查前台展示效果
- **Pain Points**: 手机上看到的效果和桌面差别大

> 说明：本站在桌面端已有成熟的 neo-brutalist 视觉语言（粗边框、硬阴影、倾斜贴纸）。本次改动**只针对移动端做妥协**，桌面端视觉不变。

---

## User Stories & Acceptance Criteria

### Story 1: 首页轮播在手机上完整可见

**As a** 手机访客
**I want to** 完整看到轮播卡片的全部内容（包括右边框）
**So that** 我不会觉得页面是坏的 / 不需要双指缩小才能看全

**Acceptance Criteria:**
- [ ] 在 375px 与 390px 视口下，轮播卡片包围盒 `right <= 视口宽度`
- [ ] 移动端卡片**不倾斜**；`≥ md`（768px）断点下**仍保留倾斜**
- [ ] 桌面端（≥1024px）视觉与改动前**逐像素一致**（回归）
- [ ] `documentElement.scrollWidth === clientWidth`（无横向滚动）
- [ ] 轮播的自动播放、左右箭头、底部圆点、暂停按钮功能不受影响

### Story 2: `/mods` 手机上默认看得清预览图

**As a** 手机访客
**I want to** 一屏看到尺寸够大的预览图
**So that** 我能直接判断这个 MOD 是不是我想要的，不用逐个点进去

**Acceptance Criteria:**
- [ ] 375–430px 视口下，`/mods` 首次进入默认渲染 **2 列**
- [ ] 单张预览图渲染宽度 **≥ 100px**
- [ ] 列数切换控件（3/4 列）**仍然可用**，用户手动切换后本次会话内保持
- [x] ~~用户在桌面端选择过的列数不得污染移动端默认值~~ — **本次未实现**，见下方「已知取舍」
- [ ] 骨架屏（loading 态）列数与最终渲染列数一致，不出现加载后跳动
- [ ] 桌面端默认列数与改动前一致（回归）

---

## Functional Requirements

### Core Features

**Feature 1: 轮播卡片移动端不倾斜**

- **Description**: 把 `rotate-2` / `rotate={2}` 在移动端禁用，`md` 及以上保留。
- **User flow**: 打开首页 → 轮播卡片正放 → 右边缘完整可见。
- **Edge cases**:
  - 首页另有其他装饰性倾斜元素（贴纸、徽章，如 `-rotate-2`、`rotate-2` 的小尺寸 Badge）。这些小元素高度低、溢出量可忽略，**本次不处理**——但需确认它们不造成横向滚动。
  - 若取消倾斜后卡片仍溢出，需一并排查 `SnapContainer` 的 `overflow-x` 计算值。
- **Error handling**: 不适用（纯样式）。

**Feature 2: `/mods` 自动列数响应式**

- **Description**: 把 `mods-infinite-grid.tsx` 中写死的 `useState(5)` 改为按视口断点决定的初始值；移动端 2 列。
- **User flow**: 手机打开 `/mods` → 2 列大图 → 可手动切到 3/4 列。
- **Edge cases**:
  - **持久化偏好与设备无关（已知取舍）**：`use-layout-preference.ts` 把列数选择持久化到 `localStorage`，但**不区分设备**。因此若用户曾在桌面端手选过 5 列，在手机上打开仍是 5 列——默认值只在「从未手选过」时生效。
    本次**刻意未实现**跨设备收敛：因为用户同时要求「手机上保留 3/4 列开关」，而单一存储键无法区分「桌面留下的偏好」与「用户刚在手机上选的值」——要正确处理需把选择连同**设备档位**一起存（如 `{cols, scope:"mobile"|"desktop"}`），属额外复杂度，待用户确认是否值得。
  - **视口旋转/窗口缩放**：手机横竖屏切换、桌面拖动窗口时，列数需重新计算；用户**显式手选**过的值应优先于自动值。
  - 骨架屏与真实网格列数不一致会导致布局跳动，需共用同一列数来源。
- **Error handling**: `localStorage` 不可用（隐私模式）时回退到按断点计算的默认值，不报错。

### Out of Scope

- **详情页与详情抽屉的移动端体验** —— 用户明确表示本次暂不改（2026-10-02 澄清）。原提出的痛点（关闭不便、滚动冲突、按钮尺寸、图片查看）**留待后续版本**。
- `/wuthering-waves` 等游戏路由页的移动端适配（见 Known Issues，尚未确认是否为真实缺陷）
- 桌面端任何布局调整
- 图片优化（COS 体积、`Cache-Control`）—— 属独立议题
- 卡片信息密度、字号体系、配色等审美层面的重构

---

## Technical Constraints

### Performance
- 改动**不得增加**首屏 JS 体积（纯 className / 小型 hook 调整）
- 不得引入新的客户端-服务端往返

### Security
- 不适用（纯前端样式与本地偏好）

### Integration
- **`use-layout-preference.ts`**: 列数与布局模式的持久化来源，改动需与其契约保持一致
- **`hero-carousel.tsx`**: 依赖 embla（`@/components/ui/carousel`）、framer-motion（`MotionReveal`）、`drawerModId` 滚动锁逻辑；改动限样式层，不得触碰抽屉 portal 与滚动锁
- **`(home)/page.tsx` 的 `SnapContainer`**: `scrollSnapType: y mandatory`；改动需确认不破坏滚动吸附

### Technology Stack
- Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + shadcn/ui
- **只允许 Tailwind + shadcn/ui，不引入新依赖**（项目规范）
- 目标设备：**375–430px 手机**；平板与小屏（320px）本次不专门优化，但不得引入新的溢出
- 部署：自托管腾讯云首尔（PM2 + Nginx）。**改动 push 到 main 不会自动部署**，需上服务器 build 并重启 PM2

---

## MVP Scope & Phasing

### Phase 1: MVP（本次交付）
- 首页轮播卡片移动端取消倾斜
- `/mods` 自动列数响应式（手机 2 列）+ 持久化值按视口收敛
- 上述两个缺陷的回归验证（桌面端逐像素一致）

**MVP Definition**: 在 375px 与 390px 下，主页与 `/mods` 无横向溢出、轮播完整可见、预览图 ≥100px。交付即可独立上线，无需其他前置。

### Phase 2: Enhancements（后续，需重新立项）
- 详情页 / 详情抽屉的移动端体验（用户本次暂缓，痛点已记录）
- `/wuthering-waves` 等游戏路由的移动端核查与适配
- 320px 小屏兜底

### Future Considerations
- 把移动端断点策略沉淀成共享 hook / 设计 token，避免每处各写一套
- COS 图片 `Cache-Control`（独立议题，与本次解耦）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 去掉倾斜后桌面端视觉回归 | Med | Med | 明确按 `md` 断点隔离；用 CDP 在 1024px/1440px 截图与改动前逐像素比对 |
| 持久化列数污染导致手机端修复失效 | **High** | High | 在**读取**路径做视口上限收敛，而非只改初始值；专门加一条验收用例（桌面选 5 列 → 手机打开） |
| 另一个 agent 在同一仓库工作导致冲突 | **High** | Med | 见 Dependencies；改动集中在 2 个文件，开工前先同步分支状态 |
| 取消倾斜后仍存在其他溢出源 | Med | Low | 验收标准用「未裁切元素右边缘」全量扫描，而非只看轮播 |
| 骨架屏与网格列数不一致引发跳动 | Med | Low | 两者共用同一列数来源，纳入验收清单 |

---

## Dependencies & Blockers

**Dependencies:**
- 无外部依赖。两个缺陷均可在现有代码内独立修复。

**Known Blockers:**
- **并行开发冲突**：用户已告知**另一个 agent 正在另一分支工作**（工作区现有未提交改动：`src/lib/engagement/`、`src/app/api/engagement/`、`src/app/(site)/favorites/favorites-client.tsx`、`docs/guest-engagement-prd.md` 等，属「游客互动」需求）。本需求改动文件（`hero-carousel.tsx`、`mods-infinite-grid.tsx`）与该需求**不重叠**，但仍需在开工前确认分支策略（建议独立 worktree 或独立分支），避免互相覆盖。

**Known Issues（待确认，不阻断本次交付）:**
- `/wuthering-waves` 在 390px 视口下渲染为**空白页**（CDP 实测）。可能原因：客户端渲染需要更长等待时间、该路由有额外前置条件、或真实缺陷。**本次不修**，但建议独立核查。

---

## Appendix

### A. 复现与验证方法

项目未安装 Playwright，采用 **headless Chrome + CDP**（Node 内置 WebSocket，零新依赖）：

```powershell
$env:WM_CHROME = "C:\Program Files\Google\Chrome\Application\chrome.exe"
node <脚本路径>   # 见 .tmp-audit 或临时脚本
```

核心测量表达式（用于验收）：

```js
const de = document.documentElement;
const vw = de.clientWidth;
// 1) 整体溢出
de.scrollWidth === vw;
// 2) 未被裁剪的溢出元素（沿祖先链检查 overflowX !== "visible"）
// 3) 轮播卡片包围盒
document.querySelector(".neo-card-lg").getBoundingClientRect().right <= vw;
```

关键实测数据（2026-10-02，390×844 视口，mobile 模拟）：

| 项目 | 改动前 |
|---|---|
| `documentElement.scrollWidth` | 390（= 视口） |
| 轮播卡片 boundingBox | `left=20, right=395, w=375, h=694` |
| `/mods` 预览图渲染宽度 | 23px（30 张全部相同） |
| `/mods` 默认列数 | 5 |

### B. 相关文件

| 文件 | 作用 |
|---|---|
| `src/components/features/home/hero-carousel.tsx` | 首页轮播（`rotate-2` 在第 151 行，`MotionReveal rotate` 在第 150 行） |
| `src/app/(home)/page.tsx` | 首页；`SnapContainer` 的 `overflow-y-scroll` |
| `src/components/features/mods/list/mods-infinite-grid.tsx` | 列表网格；`useState(5)` 写死列数 |
| `src/components/features/mods/list/use-layout-preference.ts` | 列数/布局偏好持久化 |
| `src/components/ui/carousel.tsx` | shadcn + embla 封装 |

### C. 设计决策记录

| 决策 | 理由 |
|---|---|
| 移动端取消倾斜，桌面保留 | 倾斜是视觉标志，但它的几何代价（包围盒增宽）在小屏上不可接受；按断点隔离可两全 |
| `/mods` 手机默认 2 列而非 3 | 预览图是本页核心信息，2 列下每列约 170px，能看清人物；密度需求由手动开关满足 |
| 保留 3/4 列手动开关 | 不同用户对密度的偏好差异大，默认值给最优解、选择权留给用户 |
| 详情页/抽屉移出范围 | 用户 2026-10-02 明确暂缓；避免一次改动触及过多文件，降低与并行 agent 的冲突面 |
| 验收采用定性 + 正确性护栏 | 用户选择「看着舒服就行」；但溢出与图片尺寸是可客观测量的，作为防回归护栏保留 |

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
