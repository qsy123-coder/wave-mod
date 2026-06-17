# Product Requirements Document: 绝区零分站视觉风格切换 V2

**版本**: 2.0
**日期**: 2025-06-17
**作者**: Sarah (Product Owner)
**质量评分**: 92/100

---

## Executive Summary

绝区零分站当前使用一套专属的深色沉浸式视觉组件（ZenlessGlassNav、ZenlessHomePage 等），与全站新粗野主义经典风格截然不同。V1 实现的「风格切换」通过替换整个组件树来改变视觉——连导航栏、页面布局、内容结构全部更换，用户体验割裂。

V2 重新设计为**纯 CSS 视觉皮肤切换**：保留绝区零分站现有的所有 ZZZ 组件和布局结构不变，仅通过 CSS 变量/主题类切换视觉呈现。默认使用**新粗野主义皮肤**（亮色面板 + 粗黑 4px 边框 + 8px 阴影 + 高对比），切换后使用**深色沉浸式皮肤**（暗色背景 + 毛玻璃面板 + 背景纹理 + 柔和边框）。两种皮肤共享完全相同的 DOM 结构和组件，布局零变化。

---

## Problem Statement

**当前状况（V1 问题）**：
- 风格切换替换了完全不同的组件树：`ZenlessGlassNav` ↔ `SiteHeader`、`ZenlessHomePage` ↔ `DefaultGameHomePage` 等
- 两个风格下的导航栏不同（导航项数量、链接路径、移动端方案、品牌文案全部不同）
- 两个风格下的页面布局不同（ZZZ 有侧边栏/多列布局，Neo 是单列）
- 用户切换后体验割裂，看起来像跳到了另一个网站

**V2 解决方案**：
- 绝区零分站**仅使用 ZZZ 专属组件**（不再回退到 shared/default 组件）
- 所有 ZZZ 组件的颜色/背景/边框/阴影改为引用 CSS 变量
- 通过根级 CSS 类切换（`.theme-zzz-neo` ↔ `.theme-zzz-dark`）改变视觉皮肤
- 默认风格改为 `neo-brutalism`（与全站统一），用户可切换为深色
- 布局、导航、内容结构在两种皮肤下完全一致

**业务影响**：
- 新用户进入绝区零分站看到与全站统一的新粗野主义风格，降低认知差异
- 喜欢深色沉浸式体验的用户仍可一键切换
- 消除组件树替换带来的 bundle 体积浪费（不再需要同时加载两套完全不相关的组件）

---

## Success Metrics

**主要 KPI：**

- **切换按钮点击率 > 5%**：在绝区零分站的独立访客中，至少 5% 会点击风格切换按钮。通过前端埋点（自定义事件 `style_switch_click`）统计。

- **切换后页面停留时长对比**：切换到深色风格的用户，在绝区零分站的平均页面停留时长不低于 Neo 风格用户。

- **CLS = 0**：切换过程中无布局偏移，仅 `opacity` 过渡。

**验证方式**：功能上线 2 周后进行数据回顾。

---

## User Personas

### Primary: 深色模式偏好型 MOD 玩家

- **角色**：绝区零 MOD 用户，偏好暗色界面
- **目标**：在绝区零分站浏览和下载 MOD，更喜欢深色沉浸式视觉
- **痛点**：默认的 Neo 亮色风格在夜间浏览时过于刺眼
- **技术水平**：中级——熟悉 Web 应用，能发现并点击 UI 按钮

### Secondary: 新粗野主义偏好型用户

- **角色**：从鸣潮/原神分站过来的 MOD 玩家
- **目标**：在绝区零分站看到与全站统一的新粗野主义视觉
- **痛点**：V1 切换后连导航和布局都变了，操作不习惯
- **技术水平**：初级到中级

---

## User Stories & Acceptance Criteria

### Story 1: 视觉皮肤切换

**作为** 绝区零分站的访客
**我想要** 在导航栏中点击风格切换按钮
**以便** 在新粗野主义视觉和深色沉浸式视觉之间切换，而页面布局保持完全一致

**验收标准：**
- [ ] 绝区零导航栏（`ZenlessGlassNav`）右侧显示风格切换按钮（图标 + 当前风格简称）
- [ ] 当前激活的风格在按钮上有视觉标识
- [ ] 点击切换后，页面内容以 300-500ms 淡入淡出过渡变化
- [ ] 切换后页面布局完全不变（CLS = 0），仅颜色/背景/边框/阴影变化
- [ ] 默认风格为 `neo-brutalism`（新用户首次访问看到 Neo 视觉）
- [ ] 两种皮肤下导航栏结构完全相同（6 个导航项、品牌文案「绝区零 MOD 分站」不变）
- [ ] 两种皮肤下移动端导航栏均为底部横向滚动栏，仅颜色不同

### Story 2: 风格偏好持久化

**作为** 绝区零分站的访客
**我想要** 我的风格选择被浏览器记住
**以便** 下次访问时自动应用我偏好的皮肤

**验收标准：**
- [ ] 风格偏好存储在 `localStorage` 中，key 为 `wavemod-layout-style`
- [ ] 下次访问绝区零分站时，自动读取偏好并应用对应皮肤
- [ ] 默认值（无存储记录时）为 `"neo-brutalism"`
- [ ] 无效/被篡改的存储值自动回退到默认值（Zod 校验）

### Story 3: 跨设备同步（登录用户）

**作为** 已登录的绝区零 MOD 玩家
**我想要** 我的皮肤偏好同步到我的账户
**以便** 在其他设备上访问时自动使用相同皮肤

**验收标准：**
- [ ] 登录用户在切换皮肤后，偏好同步写入 Supabase `profiles.layout_style` 字段
- [ ] 页面加载时（客户端）优先读取 Supabase 偏好，其次回退到 localStorage
- [ ] 未登录用户仅使用 localStorage，不报错
- [ ] 同步失败时静默降级（仅使用 localStorage），不阻塞页面渲染

### Story 4: 子主题联动

**作为** 使用 Neo 皮肤的绝区零访客
**我想要** 在三种新粗野主义子主题（arcade/neon-night/sunset-flyer）之间切换
**以便** 进一步个性化我的视觉体验

**验收标准：**
- [ ] Neo 皮肤下，子主题切换器（`ThemeToggle`）正常显示和工作
- [ ] 深色皮肤下，子主题切换器隐藏（深色皮肤有自己的固定调色板）
- [ ] 从深色切换回 Neo 时，恢复用户上次选择的子主题

### Story 5: 引导页/收藏页/支持页适配

**作为** 使用深色皮肤的绝区零访客
**我想要** 引导页、收藏页和支持页也呈现深色视觉
**以便** 整个分站的视觉风格统一

**验收标准：**
- [ ] Guide、Favorites、Support 页面在深色皮肤下使用深色背景 + 浅色文字
- [ ] Neo 皮肤下保持现有视觉（亮色面板 + 粗黑边框）
- [ ] 两种皮肤下页面功能和布局完全一致

### Story 6: 移动端视觉适配

**作为** 使用手机访问绝区零分站的用户
**我想要** 切换皮肤后页面在手机上也能正常显示
**以便** 在移动设备上获得一致的体验

**验收标准：**
- [ ] Neo 皮肤在移动端显示亮色面板 + 粗黑边框
- [ ] 深色皮肤在移动端显示暗色背景 + 毛玻璃效果
- [ ] 移动端导航栏保持底部横向滚动布局，皮肤切换仅改变颜色
- [ ] 两种皮肤在移动端均无横向溢出或布局错乱
- [ ] 风格切换按钮在移动端可见且可点击（触摸目标 ≥ 44×44px）

---

## Functional Requirements

### 核心功能

**功能 1: CSS 变量驱动的双皮肤系统**

- **描述**：定义两套 CSS 变量集合，分别对应 Neo 和深色皮肤。ZZZ 组件使用语义化 CSS 变量代替硬编码颜色。通过 `<html>` 或 `<body>` 上的类名（`.theme-zzz-neo` / `.theme-zzz-dark`）切换变量值。
- **CSS 变量清单**（示意，实现时按需扩展）：

| 变量名 | Neo 值 | 深色值 | 用途 |
|--------|--------|--------|------|
| `--zzz-bg` | `#fff8ef` | `#04070d` | 页面背景色 |
| `--zzz-bg-image` | `none` 或浅色纹理 | `url(/bg-zzz/...)` | 页面背景图 |
| `--zzz-panel-bg` | `var(--neo-panel)` 或白色 | `rgba(7,17,31,0.25)` | 面板/卡片背景 |
| `--zzz-panel-border` | `4px solid #000` | `1px solid rgba(255,255,255,0.1)` | 面板边框 |
| `--zzz-panel-shadow` | `8px 8px 0 0 #000` | `none` | 面板阴影 |
| `--zzz-text-primary` | `#000` | `#fff` | 主要文字 |
| `--zzz-text-secondary` | `rgba(0,0,0,0.7)` | `rgba(255,255,255,0.7)` | 次要文字 |
| `--zzz-nav-bg` | `rgba(255,253,245,0.95)` | `rgba(0,0,0,0.6)` | 导航栏背景 |
| `--zzz-accent` | `var(--neo-accent)` | `#ffd84f` | 强调色 |
| `--zzz-radius` | `0` | `8px` | 圆角 |

- **用户流程**：用户点击切换按钮 → `<html>` 类名切换 → CSS 变量瞬时生效 → 300-500ms fade 过渡
- **边缘情况**：SSR 阶段使用 cookie 中的偏好值设置初始类名，避免 hydration mismatch
- **错误处理**：CSS 变量始终有 fallback 值，类名缺失时默认 Neo

**功能 2: 组件硬编码颜色重构**

- **描述**：将绝区零所有 ZZZ 组件中的硬编码 Tailwind 颜色替换为 CSS 变量引用。
- **受影响文件**（非穷举）：
  - `src/features/games/zenless-zone-zero/components/zenless-glass-nav.tsx`
  - `src/features/games/zenless-zone-zero/pages/zenless-home-page.tsx`
  - `src/features/games/zenless-zone-zero/pages/zenless-mods-page.tsx`
  - `src/features/games/zenless-zone-zero/pages/zenless-ranking-page.tsx`
  - `src/features/games/zenless-zone-zero/pages/zenless-mod-detail-page.tsx`
  - 以及所有 ZZZ 子组件（hero、filter、grid、comments 等）
- **重构原则**：
  - `bg-[#04070d]` → `bg-[var(--zzz-bg)]`
  - `text-white` / `text-slate-400` → `text-[var(--zzz-text-primary)]` / `text-[var(--zzz-text-secondary)]`
  - `shadow-[3px_3px_0px_0px_#000]` → `shadow-[var(--zzz-panel-shadow)]`（或 `shadow-zzz` 自定义类）
  - `ring-1 ring-white/10` → `ring-1 ring-[var(--zzz-panel-border-color)]`
  - `backdrop-blur` 在 Neo 皮肤下可能不需要，通过 CSS 变量控制 `backdrop-filter`
- **边缘情况**：某些颜色无法仅用一个变量表达（如渐变），使用 CSS 自定义属性组合或条件 Tailwind 类

**功能 3: 背景图片切换**

- **描述**：两种皮肤使用不同的背景图片。Neo 皮肤使用浅色/几何纹理（或纯色），深色皮肤使用现有暗色背景图。
- **实现方案**：
  - 页面背景图通过 `--zzz-bg-image` CSS 变量控制
  - Neo 皮肤：`--zzz-bg-image: none` 或浅色重复纹理
  - 深色皮肤：`--zzz-bg-image: url(/bg-zzz/zzz-ranking-bg.png)` 等
  - Hero/详情页背景图通过条件渲染或 CSS 变量切换
- **边缘情况**：背景图加载失败时回退到纯色背景；Neo 皮肤不加载暗色背景图（节省带宽）

**功能 4: 风格状态管理重构**

- **描述**：简化现有的 `LayoutStyleContext`，去除组件树切换逻辑。风格值改为 `"neo-brutalism"` | `"zzz-dark"`（默认 `"neo-brutalism"`）。
- **数据流**：
  ```
  [localStorage / Supabase] → LayoutStyleContext → <html> 类名 → CSS 变量 → 所有 ZZZ 组件
  ```
- **变更**：
  - 默认值从 `"zzz-immersive"` 改为 `"neo-brutalism"`
  - `isZzzStyle()` / `isZzzNeoBrutalism()` 等服务器端条件渲染函数废弃
  - `[game]/layout.tsx` 不再做组件树分支，始终渲染 ZZZ 组件
  - `[game]/mods/[id]/page.tsx` 等路由页不再做组件树分支
- **边缘情况**：旧用户可能有 `"zzz-immersive"` cookie，应映射到 `"zzz-dark"`（迁移兼容）

**功能 5: 子主题联动**

- **描述**：Neo 皮肤下 `ThemeToggle` 正常工作（切换 arcade/neon-night/sunset-flyer 三种子主题）；深色皮肤下 `ThemeToggle` 隐藏。
- **实现**：`ThemeToggle` 组件根据 `layoutStyle` 判断可见性；深色皮肤使用独立的固定调色板，不参与子主题切换。
- **边缘情况**：从深色切回 Neo 时，恢复用户上次选择的子主题（从 localStorage 读取 `wavemod-theme` key）

**功能 6: 引导页/收藏页/支持页适配**

- **描述**：这三个页面当前使用共享组件，需要适配深色皮肤。
- **方案**：这些页面位于 `[game]/layout.tsx` 的 children 内，自动继承布局的背景色。需要确保页面内部的卡片、文字颜色使用 CSS 变量而非硬编码。
- **边缘情况**：这些页面在两种皮肤下布局不变，仅颜色变化

### 不在 MVP 范围内

- 将深色皮肤推广到鸣潮/原神分站
- 风格预览/对比模式
- A/B 测试框架集成
- 新增 Neo 皮肤专用背景图片资源（MVP 使用纯色/简单 CSS 纹理）
- 风格切换快捷键

---

## Technical Constraints

### 性能

- 切换响应时间 < 100ms（从点击到开始过渡动画）
- 过渡动画持续时间：300-500ms（`opacity` 过渡）
- 切换过程 Cumulative Layout Shift (CLS) = 0
- CSS 变量方案不增加 JS bundle 体积（纯 CSS）
- 深色皮肤的背景图片在 Neo 默认时不加载（按需加载）

### 安全

- localStorage 偏好值使用 Zod 校验（仅允许 `"neo-brutalism"` 和 `"zzz-dark"`）
- Supabase 同步仅更新 `profiles.layout_style` 字段
- 旧值 `"zzz-immersive"` 迁移映射到 `"zzz-dark"`，防止无效值

### 兼容性

- 浏览器：Chrome 90+、Firefox 90+、Safari 15+、Edge 90+
- 移动端：iOS Safari 15+、Android Chrome 90+
- CSS 变量 `var()` 支持：目标浏览器均原生支持
- 屏幕宽度：320px – 2560px

### 集成

- **Supabase**：复用 V1 已实现的 `profiles.layout_style` 字段和同步逻辑
- **ThemeProvider**：保留现有子主题系统，Neo 皮肤下联动，深色皮肤下隐藏
- **LayoutStyleContext**：重构为纯 CSS 类名切换，移除组件树选择逻辑
- **路由页面**：移除所有 `isZzzStyle()` / `isZzzNeoBrutalism()` 条件分支，始终渲染 ZZZ 组件

### 技术栈约束

- TypeScript strict mode
- Next.js App Router (Server Components preferred)
- 纯 CSS 变量方案，不引入新库
- 遵循项目 Feature-Sliced Design 目录结构

---

## MVP 范围与分阶段计划

### Phase 1: MVP（首次发布）

- [ ] CSS 变量双皮肤系统定义（`globals.css` 中 `.theme-zzz-neo` / `.theme-zzz-dark`）
- [ ] `ZenlessGlassNav` 硬编码颜色 → CSS 变量重构
- [ ] `ZenlessHomePage` 及子组件硬编码颜色 → CSS 变量重构
- [ ] `ZenlessModsPage` 及子组件硬编码颜色 → CSS 变量重构
- [ ] `ZenlessRankingPage` 及子组件硬编码颜色 → CSS 变量重构
- [ ] `ZenlessModDetailPage` 及子组件硬编码颜色 → CSS 变量重构
- [ ] Guide / Favorites / Support 页面深色适配
- [ ] 风格状态管理重构（默认值改为 `neo-brutalism`，移除组件树分支）
- [ ] 风格切换按钮更新（适配新视觉，子主题联动逻辑）
- [ ] 子主题联动（Neo 可用，深色隐藏）
- [ ] 旧值迁移（`zzz-immersive` → `zzz-dark`）
- [ ] 移动端适配验证

**MVP 定义**：绝区零分站默认使用 Neo 视觉皮肤，用户可通过导航栏按钮切换为深色沉浸式皮肤。两种皮肤下所有页面布局和功能完全一致，仅视觉呈现不同。

### Phase 2: 增强（发布后）

- [ ] Neo 皮肤专用背景纹理资源设计
- [ ] 风格切换埋点 + 数据分析
- [ ] 深色皮肤背景图懒加载优化
- [ ] 风格切换过渡动画优化（Framer Motion AnimatePresence）

### 未来考虑

- [ ] 将深色皮肤作为独立「暗色模式」推广到其他分站
- [ ] 新用户首次访问时的风格引导 tooltip
- [ ] 根据系统 `prefers-color-scheme` 自动选择默认皮肤

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| 硬编码颜色重构遗漏导致部分组件颜色不随皮肤变化 | 高 | 中 | 逐组件审查 + 视觉回归测试清单 |
| CSS 变量在某些嵌套场景下不生效（Tailwind 任意值语法兼容性） | 中 | 中 | 使用 `var()` 时注意 Tailwind 的 `[var(--x)]` 语法，避免在 `@apply` 中使用 |
| 旧用户 `zzz-immersive` cookie 迁移失败 | 低 | 低 | Zod schema 中增加迁移映射，无效值时回退默认 |
| Neo 默认皮肤下背景图片未加载，切换深色时出现闪烁 | 中 | 低 | 深色背景图在切换时动态加载，使用 `loading="lazy"` 或 JS 预加载 |
| 子主题与皮肤切换交互复杂导致状态不一致 | 低 | 中 | 明确的优先级：皮肤 > 子主题；深色皮肤下子主题状态保留但不生效 |

---

## Dependencies & Blockers

**依赖项：**

- **CSS 变量命名规范**：需要与现有 `--neo-*` 变量协调，避免冲突。由前端开发定义。
- **ZZZ 组件重构**：所有 ZZZ 组件中的硬编码颜色需替换为 CSS 变量。由前端开发执行。
- **背景图片资源**：Neo 皮肤的背景纹理资源（Phase 2，MVP 可用纯色替代）。

**已知阻塞项：**

- 无阻塞项。所有依赖均为内部可控。

---

## Appendix

### Glossary

- **新粗野主义 (Neo-Brutalism)**：WaveMod 全站的默认视觉风格——粗黑 4px 边框、零圆角、8px 投影、高对比色彩、全大写排版
- **深色沉浸式风格 (ZZZ Dark)**：绝区零分站的暗色视觉皮肤——黑色/深棕背景 + PNG 背景图片 + 毛玻璃面板 + 柔和边框
- **子主题**：新粗野主义风格下的三个颜色变体（theme-arcade、theme-neon-night、theme-sunset-flyer），由 `ThemeProvider` 管理
- **CSS 变量皮肤**：通过 CSS 自定义属性（`--zzz-*`）在不同 CSS 类名下定义不同值，实现视觉切换
- **CLS**：Cumulative Layout Shift，衡量页面视觉稳定性的 Web Vitals 指标

### V1 → V2 核心变更

| 方面 | V1（废弃） | V2（目标） |
|------|-----------|-----------|
| 实现方式 | 组件树替换 | CSS 变量切换 |
| 默认风格 | `zzz-immersive` | `neo-brutalism` |
| 导航栏 | ZenlessGlassNav ↔ SiteHeader | 始终 ZenlessGlassNav |
| 首页 | ZenlessHomePage ↔ DefaultGameHomePage | 始终 ZenlessHomePage |
| MOD 列表 | ZenlessModsPage ↔ DefaultGameModsPage | 始终 ZenlessModsPage |
| 排行榜 | ZenlessRankingPage ↔ DefaultGameRankingPage | 始终 ZenlessRankingPage |
| MOD 详情 | ZenlessModDetailPage ↔ GameModDetailContent | 始终 ZenlessModDetailPage |
| 布局变化 | 完全不同 | 零变化 |
| 子主题 | 两种风格均可用 | 仅 Neo 可用，深色隐藏 |

### References

- 项目编码规范：`docs/Coding-Standards.md`
- AI 交互指南：`docs/AI-Interaction-Guidelines.md`
- 游戏配置：`src/config/games.ts`
- 主题系统：`src/components/layout/theme-provider.tsx`
- 全局样式：`src/app/globals.css`
- ZZZ 专用组件：`src/features/games/zenless-zone-zero/`
- V1 PRD：`docs/zzz-style-switch-prd.md`

---

*本 PRD 通过交互式需求收集和质量评分系统生成，确保全面覆盖业务、功能、用户体验和技术维度。*
