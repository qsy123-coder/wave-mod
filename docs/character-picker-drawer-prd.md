# Product Requirements Document: 角色分类抽屉（网格选择器）

**Version**: 1.0
**Date**: 2026-10-02
**Author**: Sarah (Product Owner)
**Quality Score**: 88/100

---

## Executive Summary

`/mods` 左侧的 240px 角色分类栏在桌面端承载了 60+ 个角色，内部靠 `overflow-y-auto` 滚动。用户想找一个特定角色时，得在一列窄卡片里反复上下滑、逐个扫名字——**这是一个"找东西"的任务，却用了一个"排队"的界面。**

本次在侧栏顶部增加一个「切换显示模式」按钮，点开后从左侧滑出一个**带遮罩的弹层**，用多列网格把全部角色分类（实测 66 项 = 「全部」+ 3 个特殊分类 + 62 个角色）在一个屏幕内铺开。目标单一：**把"滚动寻找"变成"一眼扫到"。**

改动只增加一个按钮和一个新组件，**现有侧栏、`mods-listing-view` 的宽度与滚动逻辑、移动端布局全部不动**。

---

## Problem Statement

**Current Situation**

| 现象 | 代码事实 |
|---|---|
| 侧栏列表过长，必须往下滑 | `src/components/features/mods/list/character-sidebar.tsx:130` 的角色列表容器是 `flex flex-col gap-1.5 overflow-y-auto`，一列单排 |
| 单条卡片信息密度低 | 每条为 `size-8`（32px）头像 + 名字 + 数量，纵向 pitch 约 52px（`:141`） |
| 条目数量大 | 侧栏条目来自数据库 distinct `character`（`getCharacterSuggestions`），**不是** `characterImageMap`；2026-10-02 实测 = **66 项**（「全部」+ Skins/Other/Misc/UI + 62 个角色）。其中「武器」在库里但不在 `characterImageMap`（64 项，`src/lib/constants/character-images.ts:5-76`）里，**没有头像** |
| 侧栏仅在桌面存在 | 容器 `hidden w-[240px] shrink-0 flex-col lg:flex`（`src/components/features/mods/list/mods-listing-view.tsx:122`） |

按 52px pitch 估算，66 项需要约 **3400px** 的列表高度，而侧栏可用高度只有视口减站点头部（约 800px 量级）——**用户平均要滚动 4 个屏幕**才能扫完一遍。

**Proposed Solution**

侧栏顶部加一个触发按钮 → 打开一个 `side="left"` 的带遮罩抽屉 → 抽屉内用 `auto-fill` 多列网格铺开全部 66 项（头像 56px + 名字，不显示数量）→ 点选任一角色后**自动关闭**并跳转。

**Business Impact**

- 定性：用户（站主本人 + 桌面访客）从"滚动寻找"变成"一眼扫到"。
- 客观：在 1440×900 下，66 项全部一屏可见，所需滚动距离从约 3400px 降到 0。

---

## Success Metrics

用户已明确选择**定性验收**（口径沿用 `docs/mobile-layout-prd.md`：「我自己看着舒服就行」）。以下为**正确性护栏**（不达标即视为未达成），而非增长指标：

**Primary（护栏，必须全部通过）:**
- **一屏铺完**：在 1440×900 视口下打开抽屉，全部分类项**无需滚动即全部可见**（基线：2026-10-02 实测 66 项；条目数随每日上传增长，见附录 D）
- **无横向溢出**：抽屉打开时 `document.documentElement.scrollWidth === documentElement.clientWidth`
- **桌面回归**：≥1024px 下，除新增的触发按钮外，侧栏其余部分渲染与改动前一致
- **四种关闭路径全部可用**：点遮罩 / 按 Esc / 点右上关闭按钮 / 点选某个角色（自动关闭）

**Secondary（人工验收）:**
- 用户本人在真实桌面分辨率下确认「比滚动侧栏快」

**Validation**: 用 headless Chrome + CDP 在 1440×900 下测量（方法见附录 A），人工截图确认。

---

## User Personas

### Primary: 桌面访客（鸣潮玩家）
- **Role**: 在电脑上浏览 MOD，已知道自己想要哪个角色的 MOD
- **Goals**: 尽快定位到目标角色，进分类页挑作品
- **Pain Points**: 侧栏一列下去要滚很久；滚动过程中名字一闪而过，容易划过头；滚动后还要滑回去
- **Technical Level**: 普通用户，不会用浏览器搜索框找页面内文字

### Secondary: 站主（本站所有者）
- **Role**: 上传与维护 MOD
- **Goals**: 桌面端快速抽查各角色分类是否正常
- **Pain Points**: 每次抽查都要在侧栏里滚一遍

> 说明：本站在桌面端已有成熟的 neo-brutalist 视觉语言（粗黑边框、硬阴影、微倾斜）。本次抽屉**沿用同一语言**，不引入新视觉风格。

---

## User Stories & Acceptance Criteria

### Story 1: 一眼看全所有角色分类

**As a** 桌面访客
**I want to** 点一下就看到全部角色分类铺在眼前
**So that** 我不用在一列窄卡片里滚四个屏幕去找一个角色

**Acceptance Criteria:**
- [ ] 侧栏顶部存在一个触发按钮，文案/图标能表达"展开全部角色"（提案：`▦ 全部角色`）
- [ ] 点击后从左侧滑出抽屉，带遮罩，遮罩点击可关闭
- [ ] 抽屉内为多列网格：`grid-template-columns: repeat(auto-fill, minmax(84px, 1fr))`，列数自适应
- [ ] 网格第一格是「全部」，随后是 3 个特殊分类（Skins / Other/Misc / UI），随后是全部普通角色，**顺序与侧栏一致**
- [ ] 每个格子 = 56px 头像 + 下方名字；**不显示数量**（用户明确选择）
- [ ] **不出现横向滚动**；1440×900 下 66 项一屏可见
- [ ] 抽屉高度 `inset-y-0`（满高），内部内容区在条目溢出时才 `overflow-y-auto`（`scrollbarWidth: none`，与侧栏一致）

### Story 2: 选完就走，不打断

**As a** 桌面访客
**I want to** 点中角色后立刻看到对应的作品列表
**So that** 选人这个动作不占用我第二秒注意力

**Acceptance Criteria:**
- [ ] 点击任一格子后抽屉**自动关闭**，并导航到该分类的 URL
- [ ] 点击**当前已选中**的分类时，抽屉同样关闭，且不新增历史记录（沿用侧栏 `handleCardClick` 的「原地踏步」短路，`character-sidebar.tsx:46-51`）
- [ ] 网格中当前选中的分类有明显的高亮（与侧栏 `isActive` 的 `bg-[#ff7a7a]` 一致），用户打开抽屉时能立刻知道自己现在在哪
- [ ] 关闭抽屉后，侧栏的滚动位置与 `scroll-memory` 行为不受影响

### Story 3: 键盘与无障碍可用

**As a** 键盘用户
**I want to** 按 Esc 关掉抽屉
**So that** 我不必去够鼠标点遮罩

**Acceptance Criteria:**
- [ ] 按 `Esc` 关闭抽屉，焦点回到触发按钮
- [ ] 抽屉根元素带 `role="dialog"` + `aria-modal="true"`
- [ ] 触发按钮有 `aria-label`（文案为图标变体时必需）
- [ ] 格子是真实 `<a href>`（**不是 `<button onClick={router.push}>`**），理由见 `character-sidebar.tsx:32-45` 的注释：水合前 button 完全没反应，坏网络下死窗口实测 11~23 秒

---

## Functional Requirements

### Core Features

**Feature 1: 侧栏顶部的触发按钮**

- **Description**: 在 `CharacterSidebar` 最顶部（「全部」之上）插入一个按钮，点击打开抽屉。
- **User flow**: 进入 `/mods` → 侧栏顶部看到按钮 → 点击 → 抽屉滑出。
- **位置理由**: 它是**控制**（决定列表怎么看），不是**内容**（某一类作品），所以放在内容之前；放底部会落在滚动区末端，不符合"随时可用"。
- **Edge cases**: 该按钮寄居在 `lg:flex` 的侧栏内，因此 <1024px 时随侧栏一起消失——**这正好是期望行为**（见 Out of Scope）。
- **Error handling**: 不适用。

**Feature 2: 角色分类抽屉**

- **Description**: 复用 `src/components/ui/sheet.tsx` 的 `Sheet` + `SheetContent side="left" customWidth`，新增一个 `CharacterPickerDrawer` 组件承载网格内容。
- **User flow**: 打开 → 扫视网格 → 点选 → 抽屉关闭 + URL 变化 → 右侧网格刷新为目标分类。
- **Edge cases**:
  - **无头像的角色**：`getCharacterImagePath` 返回 `null` 时（`src/lib/constants/character-images.ts:79`），现有的侧栏写法是**整块跳过 `Image`**（`character-sidebar.tsx:149-158`）。在"大头像 + 名字"的网格里，若照抄会出现**高度塌陷的空白格**，破坏网格对齐。必须渲染一个**与头像等大的占位块**（提案：`bg-[#fff8ef]` + `border-2 border-black`，居中显示名字首字）。
  - **DB 角色数增长**：列表来自 `getCharacterSuggestions()`（DB distinct `character`，经 `normalizeCharacterName` 归一化），数量会随每日上传增长。网格用 `auto-fill` 自适应，超出时抽屉内部滚动，**不得出现横向滚动**。
  - **导航后抽屉未卸载**：抽屉是 Client 组件，`next/link` 的客户端导航不会卸载它；因此**必须在点击处理器里显式关闭**，不能依赖"页面换了所以抽屉没了"。
  - **遮罩与站点头部的层级**：`sheet.tsx` 的 overlay 是 `fixed inset-0 z-50`。需确认站点头部（含移动端 Sheet，同为 `z-50`）不会盖住或穿透。
- **Error handling**: `Sheet` 已负责锁定 `document.body.style.overflow` 并在卸载时还原（`sheet.tsx:121-139`）；不需重复实现。

**Feature 3: Esc 关闭（补 `sheet.tsx` 的缺口）**

- **Description**: `src/components/ui/sheet.tsx` **没有实现 Esc 关闭**（全文无 `keydown` 监听）。需在**新组件内**加一个局部 `keydown` 监听。
- **关键约束**: **不得修改 `sheet.tsx`**——详情页右抽屉 `mod-detail-drawer.tsx` 共用它，改动会波及详情页（属另一个 agent 的移动端范围，容易冲突）。
- **Edge cases**: 抽屉关闭后必须移除监听器，否则会在页面上留下一个常驻的 Esc 处理器。
- **Error handling**: 不适用。

### Out of Scope

- **移动端（<1024px）** —— 用户 2026-10-02 明确本次只做桌面端。按钮寄居在 `lg:flex` 侧栏内，因此移动端**不会有任何变化**；移动端"侧栏完全消失、无选角色入口"是**既有缺口**，由 `docs/mobile-layout-prd.md` 的 Phase 2 另行立项。
- **搜索框** —— 用户在"多列网格平铺"与"多列网格 + 搜索框"之间选了前者。
- **分组标签（按 Skins/UI/Other 分组展示）** —— 用户选择平铺，不做分组容器。
- **替换或折叠现有侧栏** —— 用户明确选择「侧栏保留，按钮只是额外入口」，桌面端既有视觉零改动。
- **偏好持久化** —— 因为不涉及模式切换（侧栏始终在），无需 localStorage。
- **焦点陷阱（Tab 键循环）** —— `sheet.tsx` 现有实现就没有焦点陷阱，仅在本组件补上会导致两个抽屉行为不一致。列 Phase 2。
- **详情页 / 移动端布局 / COS 图片优化** —— 各自独立议题。

---

## Technical Constraints

### Performance
- 新增 JS 应保持在**个位数 KB**：一个 Client 组件 + 复用现有 `Sheet`，不引入新依赖
- 网格内 65 张头像复用现有 `getCharacterImagePath` 路径与 `next/image` + `unoptimized`（项目全局 `images.unoptimized: true`），**不新增取数请求**
- 抽屉内容**只在打开时才渲染**（`SheetContent` 在 `!visible` 时直接 `return null`，`sheet.tsx:141`），关闭状态下零成本

### Security
- 不适用（纯前端展示，无新输入、无新接口）

### Integration
- **`src/components/ui/sheet.tsx`**: 只**使用**，不修改。依赖其 `side="left"` + `customWidth` + `SheetOverlay` + body 滚动锁
- **`character-sidebar.tsx`**: 新增按钮 + 新增抽屉挂载点；`characters` / `allHref` / `isAllActive` 等 props 已是组件入参，**无需向上游改数据流**
- **`lib/navigation-url.ts`**: `isPlainLeftClick` / `isCurrentNavigationUrl` 直接复用，不重写
- **`lib/scroll-memory.ts`**: 不动

### Technology Stack
- Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + shadcn/ui
- **只允许 Tailwind + shadcn/ui，不引入新依赖**（项目规范）
- 目标视口：桌面 ≥1024px，验收基线 1440×900
- 部署：自托管腾讯云首尔（PM2 + Nginx）。**push 到 main 不会自动部署**，需上服务器 build 并重启 PM2

---

## MVP Scope & Phasing

### Phase 1: MVP（本次交付）
- `CharacterSidebar` 顶部新增触发按钮
- 新增 `CharacterPickerDrawer` 组件（多列网格 + 遮罩 + Esc + 点选自动关闭）
- 无头像角色的占位块兜底
- 桌面端回归验证（侧栏除新按钮外逐像素一致）

**MVP Definition**: 在 1440×900 下，点侧栏按钮 → 抽屉展开 → 66 项一屏可见 → 点任一项 → 抽屉关闭且列表切到该分类。交付即可独立上线。

### Phase 2: Enhancements（Post-Launch）
- 焦点陷阱与完整的焦点管理（需与 `sheet.tsx` 的右抽屉一起统一，避免两套行为）
- 网格上方加即时过滤输入框（角色数继续增长后价值上升）
- 若移动端缺口立项，抽屉可直接作为移动端入口复用（组件无需重写，只需增加触发点）

### Future Considerations
- 把"网格选择器"抽象成通用组件，供分站 `/wuthering-waves`、`/zenless-zone-zero` 复用（分站目前用的是另一套 `CharacterSidebar` 容器，见附录 B）
- 头像懒加载 / 虚拟化的必要性评估（当前 66 项，尚无必要）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 与并行 agent 的改动冲突 | **High** | Med | 另一 agent 在改 `hero-carousel.tsx` 与 `mods-infinite-grid.tsx`（`docs/mobile-layout-prd.md`）；本需求只碰 `character-sidebar.tsx` + 一个新文件，**文件集不重叠**。开工前仍须同步分支状态，建议独立 worktree |
| 为加 Esc 而顺手改 `sheet.tsx`，波及详情页右抽屉 | Med | **High** | 硬约束：Esc 监听只写在**新组件内**；`sheet.tsx` 零改动 |
| 无头像角色导致网格塌陷 | **High** | Med | 显式占位块（与头像同尺寸）+ 专门的验收用例 |
| 66 项并非一屏可容纳（某分辨率/缩放比下） | Med | Med | 门槛定为可测的 1440×900；`auto-fill` 保证更窄时优雅退化为内部滚动而非横向溢出 |
| 抽屉关闭状态未同步（点击后仍开着） | Med | High | 在点击处理器内显式关闭；验收用例覆盖"点当前已选中项"这条不触发导航的路径 |
| 桌面侧栏回归 | Low | Med | 改动是**新增**按钮而非重排，验收要求除新按钮外逐像素一致 |
| z-index 与站点头部互相穿透 | Low | Med | 显式验证 overlay / content / header 三层，纳入验收 |

---

## Dependencies & Blockers

**Dependencies:**
- 无外部依赖。全部改动落在现有代码内。

**Known Blockers:**
- **并行开发冲突**：用户已告知另有 agent 正在同一仓库工作（`docs/mobile-layout-prd.md`，改动 `hero-carousel.tsx` / `mods-infinite-grid.tsx`）。文件集不重叠，但工作区共享，**开工前需确认分支策略**（建议独立 worktree 或独立分支）。

---

## Appendix

### A. 验证方法（headless Chrome + CDP）

项目未安装 Playwright，沿用 `docs/mobile-layout-prd.md` 附录 A 的做法（Node 内置 WebSocket，零新依赖）：

```js
const de = document.documentElement;
const vw = de.clientWidth;
// 1) 打开抽屉后无横向溢出
de.scrollWidth === vw;
// 2) 抽屉内容区不需要滚动
const scroller = document.querySelector('[data-slot="character-picker-scroll"]');
scroller.scrollHeight <= scroller.clientHeight;
// 3) 条目计数（应为 65）
document.querySelectorAll('[data-slot="character-picker-item"]').length;
```

关键实测基线（2026-10-02）：条目数 **66**（「全部」+ Skins/Other/Misc/UI + 62 个角色，来自库内 distinct `character`）；侧栏单条纵向 pitch ≈ 52px ⇒ 全列表 ≈ 3400px。实测验收记录见附录 D。

### B. 相关文件

| 文件 | 作用 |
|---|---|
| `src/components/features/mods/list/character-sidebar.tsx` | 左栏本体（Client）。触发按钮加在此；`:130` 是滚动列表，`:46-51` 是"原地踏步"短路，`:32-45` 是真链接的理由 |
| `src/components/features/mods/list/mods-listing-view.tsx` | 侧栏容器 `:122`（`hidden ... lg:flex`）。**本次不改** |
| `src/components/features/mods/list/mods-listing.tsx` | Server Component，产出 `characters` 数据（`getCharacterSuggestions`） |
| `src/lib/mods-domain/public.ts` | `getCharacterSuggestions:231` → `getAvailableCharacters:212`（DB distinct `character` 归一化/排序/快照兜底） |
| `src/lib/constants/character-images.ts` | `characterImageMap:5`、`getCharacterImagePath:79`（无头像返回 `null`） |
| `src/components/ui/sheet.tsx` | 项目自实现 Sheet（非 Radix）。支持 `side="left"` + `customWidth`；**无 Esc 处理**（需在新组件补） |
| `src/components/features/mods/detail/mod-action-drawer.tsx` | 详情页左抽屉（Action Dock），本次的**视觉参照**（非浮层，不直接复用） |
| `src/components/features/mods/detail/mod-detail-drawer.tsx` | 详情页右抽屉，用的是同一个 `sheet.tsx`——**这就是不能改 sheet.tsx 的原因** |
| `src/lib/navigation-url.ts` | `isPlainLeftClick` / `isCurrentNavigationUrl`，复用 |

### C. 设计决策记录

| 决策 | 理由 |
|---|---|
| 只做桌面端 | 侧栏本身是 `lg:flex`，痛点发生在桌面；移动端缺口已由 `mobile-layout-prd.md` 单独立项，避免两个 agent 撞车 |
| 侧栏保留，按钮只是额外入口 | 零回归风险；不强迫用户改变既有习惯，只给"想看全"的人一条快路 |
| 带遮罩弹层而非固定面板 | 详情页 Action Dock 是**常驻面板**（推正文、不遮挡）；而本场景是"选完就走"的一次性任务，弹层能把注意力收拢，且不会与现有侧栏同屏重复 |
| 复用 `sheet.tsx` 而非照抄 Action Dock | `sheet.tsx` 已有遮罩、滑入动画、body 滚动锁、`role="dialog"`；`customWidth` 已支持任意宽度。照抄 Action Dock 会重造四个轮子 |
| 不改 `sheet.tsx`（Esc 写在局部） | 它与详情页右抽屉共用，改一处动两页 |
| 大头像 + 名字，不显示数量 | 网格的信息密度直接决定"一屏能否铺完"；数量是次要信息，且侧栏仍在，需要时可回去看 |
| 不做搜索框 | 用户明确选择；66 项在网格里扫视成本已经很低，搜索框会占据宝贵的首行空间 |
| 内容与左栏完全一致 | 两边随时对得上，用户不必记住"哪个里面有什么" |
| 触发按钮置于侧栏顶部 | 它是控制而非内容；顶部保证"随时可用"，放底部会落在滚动区末端 |

### D. 实测验收记录（2026-10-02，headless Chrome 154 + CDP，1440×900）

本地 `next start` + 浏览器级 CDP ws，先等触发按钮被 React 接管（`__reactProps$`）再点击。
脚本：`%TEMP%\wm-picker\cdp-picker.mjs`（几何）与 `cdp-click.mjs`（点击路径）。

| 验收项 | 实测 | 结论 |
|---|---|---|
| 触发按钮水合 | `hydrated` | ✓ |
| 条目数 | **66** | ✓（数据驱动，非 `characterImageMap` 的 64） |
| 网格列数 | **10** | ✓ 与算术一致 |
| 单格尺寸 | **86 × 86** | ✓ 与算术逐像素一致 |
| 网格总高 | **650px** | ✓ 与算术一致 |
| 内容区 `scrollHeight` vs `clientHeight` | 840 vs 840 | ✓ **一屏铺完，不需要滚动**（余量 190px） |
| 横向溢出 | `scrollWidth 1440 === clientWidth 1440` | ✓ |
| 抽屉几何 | `left 0 / top 0 / 960 × 900` | ✓ 满高、贴左 |
| `role` / `aria-modal` | `dialog` / `true` | ✓ |
| 当前选中高亮 | `aria-current="page"` 存在 | ✓ |
| **Esc 关闭** | 条目从 DOM 移除，`activeElement` 回到触发按钮 | ✓ |
| **点当前已选中项** | URL 不变，`history.length` 2 → 2，抽屉关闭 | ✓ 未新增历史记录 |
| **点其他分类** | URL → `?character=千咲`，`history.length` 2 → 3，抽屉关闭 | ✓ |
| **body 滚动锁** | 开→关后 `document.body.style.overflow` 仍为 `hidden` | ✓ 与页面 `BodyScrollLock` 幂等 |
| 控制台报错 | 0 条 | ✓ |
| **移动端 390px** | 按钮 DOM 存在但祖先 `display: none` ⇒ 不可见、不可聚焦、不可点 | ✓ |

**新增发现（已并入实现）**：库里存在 `characterImageMap` 里没有的角色（实测为**「武器」**）。
它在侧栏里表现为「少一张图」，在网格里会变成一个**高度塌陷的空白格**、破坏整行对齐 ——
本轮用「等大占位块 + 名字首字」兜底，实测该格正常占位（`emptyAvatarCells: ["全部","武器"]`）。
这条从 PRD 里的风险项变成了**已被实证的必要项**。

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
