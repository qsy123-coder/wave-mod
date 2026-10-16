# Product Requirements Document: Neumorphism 新拟物皮肤

**Version**: 1.0
**Date**: 2026-10-09
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

站点当前的视觉语言是「新粗野主义」(neo-brutalism)：`neo-card` / `neo-button-*` 等一整套工具类统一使用 `border: 4px solid #000` + `border-radius: 0` + 硬投影 `8px 8px 0 0 #000`。挂在头部「风格」下拉里的三款皮肤（Arcade / Neon / Sunset）虽然配色不同，但骨架完全一致——都是高对比、硬朗、粗边框，用户反馈「太吵、太像」。

本次需求为风格切换器**新增第 4 款皮肤「新拟物」(Neumorphism)**，严格遵循 `ui_design_docs/Neumorphism/neumorphism-design-spec.md`：同色系浅底 + 双重柔和阴影 + 中等圆角，营造安静、柔和的观感。**核心硬约束是零布局位移**——切换皮肤只改变视觉，任何元素的坐标不得变化。

由于新拟物与新粗野主义几乎逐条冲突（规范明令禁止粗边框、直角、高对比、纯黑/白背景、按钮 translate 位移），本次实现必须**严格作用域隔离**：所有新样式写在 `.theme-neumorphism` 之下，不触碰现有变量与 `neo-*` 定义，确保现有三款皮肤零影响。

---

## Problem Statement

**Current Situation**:
- 三款可选皮肤（Arcade / Neon / Sunset）视觉骨架相同，均为新粗野主义：4px 纯黑描边、直角、硬投影。差异仅停留在配色。
- 用户明确反馈「太吵/太像」，缺少一个安静、柔和、低刺激的选项。
- 现有切换器是 `hidden md:block`，移动端无入口。
- 现有 `ThemeProvider` 在 `useEffect` 中读取 `localStorage`，首屏存在闪烁旧皮肤的窗口（FOUC）。

**Proposed Solution**:
新增 `theme-neumorphism` 皮肤，走既有皮肤切换机制（`<html>` 类 + CSS 变量），视觉规范完全对齐设计文档；同时补齐移动端入口与首屏防闪。

**Business Impact**:
- 为偏好低刺激视觉的用户提供可选项，提升停留与主观满意度。
- 不引入新依赖、不改变渲染路径（纯 CSS 类切换），无性能与包体回退风险。
- 通过作用域隔离将回归风险限制在新增代码内，现有三款皮肤零改动。

---

## Success Metrics

**Primary KPIs:**
- **新皮肤采用率**：上线 30 天后，`theme-neumorphism` 在风格切换数据中占比 ≥ 15%。
- **零布局位移**：改造前后逐页截图 diff，允许 0 像素差（对四个核心页面、多个断点）。
- **零回归**：Arcade / Neon / Sunset 三款的截图与切换行为完全不变。

**Validation**:
- 采用率：读取用户 `wavemod-theme` cookie / 远端 profile 的下发值统计。
- 位移：headless Chrome + CDP 截图 diff（项目已有先例，不引新依赖）。
- 回归：切换三款皮肤逐页目测 + 复用同一套截图 diff 基线。

---

## User Personas

### Primary: Mod 玩家（桌面为主）
- **Role**: 在 PC 上浏览、筛选、下载并安装 mod 的玩家
- **Goals**: 快速找到想要的 mod；页面不刺眼、能长时间浏览
- **Pain Points**: 现有皮肤高对比硬朗，长时间浏览视觉疲劳；三款皮肤观感雷同，切换没有新鲜感
- **Technical Level**: Intermediate（会装 mod，但不关心前端实现）

### Secondary: 移动端访客
- **Role**: 手机上随手逛站的访客
- **Goals**: 能随手切换到自己喜欢的风格
- **Pain Points**: 当前风格切换按钮 `hidden md:block`，手机上**完全没有入口**
- **Technical Level**: Novice

---

## User Stories & Acceptance Criteria

### Story 1: 切换到新拟物皮肤

**As a** Mod 玩家
**I want to** 在头部「风格」下拉里选择「新拟物」
**So that** 整个站点变成柔和、安静的新拟物观感，浏览更舒适

**Acceptance Criteria:**
- [ ] 头部下拉中出现第 4 个选项「新拟物」，与现有三款并列
- [ ] 选中后 `<html>` 挂上 `theme-neumorphism`，页面即时变为浅色同色系（画布 #e0e5ec 系）
- [ ] 卡片、按钮、输入、下拉菜单、卡片 hover 态均呈现双阴影/同色系/圆角，一眼可辨为新拟物
- [ ] 「风格」下拉控件**自身**也同步变为新拟物外观（不出现"贴上去"的割裂感）
- [ ] 不依赖新第三方库；切换为纯 CSS 类切换，无网络请求

### Story 2: 切换零位移

**As a** Mod 玩家
**I want to** 在任何页面切换皮肤时元素位置纹丝不动
**So that** 阅读位置不丢失、不发生重排抖动

**Acceptance Criteria:**
- [ ] 新拟物去掉了 `border-4`，但通过等效补偿（保留 4px 透明/同色边框或等效内边距）使盒子尺寸与坐标**完全不变**
- [ ] 按钮 `:active` 的 `translate(2px,2px)` 位移被移除（规范禁止按钮位移），改用 inset 阴影表达按下态，且不影响兄弟元素布局
- [ ] `.neo-card-lift:hover` 的 `translateY(-6px)` 被移除（transform 不回流，但规范禁止浮起），改用收窄阴影
- [ ] 四个核心页面在桌面（≥1280px）与移动（390px）断点下，切换前后截图 diff = 0

### Story 3: 首屏不闪、刷新保持

**As a** Mod 玩家
**I want to** 刷新页面时直接就是我选的皮肤，不闪一下
**So that** 观感稳定

**Acceptance Criteria:**
- [ ] 主题值改由 cookie 承载，并在**服务端渲染阶段**写入 `<html>` 的 class（复用 `LayoutStyleProvider` 已有的 cookie 读法）
- [ ] 首屏 HTML 即带正确主题类，无「先渲染默认皮肤再闪成所选皮肤」的窗口
- [ ] 刷新、跨标签、回访均保持所选皮肤

### Story 4: 移动端可切换

**As a** 移动端访客
**I want to** 在手机上也能切换风格
**So that** 不必被迫接受默认皮肤

**Acceptance Criteria:**
- [ ] 窄屏导航区提供可用的风格切换入口（当前为 `hidden md:block`）
- [ ] 所有可点击目标 ≥ 44px
- [ ] 下拉/弹层在窄屏不溢出视口

### Story 5: 现有三款不受影响

**As a** 站点维护者
**I want to** 新皮肤的引入不触碰现有三款
**So that** 不产生回归

**Acceptance Criteria:**
- [ ] 所有新样式严格写在 `.theme-neumorphism` 作用域内，不修改 `:root` / `.theme-arcade` / `.theme-neon-night` / `.theme-sunset-flyer` 及基础 `.neo-*` 定义
- [ ] 切回 Arcade / Neon / Sunset 时，视觉与行为与改造前完全一致（截图 diff = 0）
- [ ] 新拟物 + ZZZ 深色同时被选中时，**新拟物优先**（整页统一为新拟物，不出现两套语言打架）

### Story 6: 可访问性达标

**As a** 有视觉/操作障碍的用户
**I want to** 新皮肤下文字可读、键盘可导航、动效可关闭
**So that** 我能正常使用

**Acceptance Criteria:**
- [ ] 正文/次要文字对 #e0e5ec 底色的对比度满足 WCAG AA
- [ ] 每个可交互元素保留清晰可见的键盘焦点环（不得因去掉黑边框而丢失焦点提示）
- [ ] 移动端触控目标 ≥ 44px
- [ ] 尊重 `prefers-reduced-motion`，关闭过渡动效
- [ ] 交付前逐条过一遍规范「禁止项」

---

## Functional Requirements

### Core Features

**Feature 1: 新增 `theme-neumorphism` 皮肤**
- Description: 在 `themes` 列表与 `globals.css` 中新增皮肤定义，激活时在 `<html>` 挂 `theme-neumorphism` 类。
- User flow: 点击头部「风格」→ 选择「新拟物」→ 即时生效 → 写入 cookie + 同步远端 profile。
- Edge cases: 与 `theme-zzz-dark` 同时存在时，新拟物优先。
- Error handling: 远端同步失败时静默降级为本地 cookie 值（沿用现有策略）。

**Feature 2: 新拟物设计令牌映射**

| 令牌 | 取值 |
|---|---|
| 画布底 | `#e0e5ec` |
| 面板/卡片 | `#e0e5ec`（同色系）或 `#f0f0f3` |
| 高光阴影 | `#ffffff` |
| 暗部阴影 | `#b8bcc2` |
| 强调色 | `#6d5dfc` |
| 正文墨色 | 待 AA 校验的深墨色（候选 `#3d4468`） |
| 圆角 | 16px（对应规范 `rounded-xl` 量级） |
| 凸起 | `8px 8px 16px #b8bcc2, -8px -8px 16px #ffffff` |
| 凹陷 | `inset 8px 8px 16px #b8bcc2, inset -8px -8px 16px #ffffff` |
| hover（收窄阴影） | `4px 4px 8px` |
| focus | `6px 6px 12px / -6px -6px 12px` + 强调色焦点环 |

- 光源方向恒定：亮阴影必须在左上（-X/-Y），暗阴影在右下（+X/+Y）。

**Feature 3: 零位移的边框补偿（核心实现）**
- Description: `neo-card` 系列现有 `border: 4px solid #000`。新拟物下**不得删除边框宽度**，而是把边框颜色改为透明或与背景同色，视觉上无框、布局上尺寸不变。
- User flow: 无感知。
- Edge cases: 需要覆盖所有带 `border-4` 的 `neo-*` 工具类与直接写在组件里的 `border-4 border-black`。
- Error handling: 若某处漏改，截图 diff 会立刻暴露位移。

**Feature 4: 切换控件语义挂钩**
- Description: 给「风格」下拉的按钮/面板/选项加语义类名（如 `theme-switcher-item`），使 CSS 可按皮肤重写其外观；加类名本身不改变布局。
- Edge cases: 组件内联的 Tailwind 工具类（`border-4`、`shadow-[10px_10px_0px...]`、`hover:-translate-y-0.5`、`active:translate-x-[2px]`）与新规则会形成同优先级冲突——需要保证覆盖规则的优先级稳定（见技术约束）。
- Error handling: 覆盖失败表现为控件保持粗野风，验收时肉眼可见。

**Feature 5: 移动端入口**
- Description: 在窄屏导航区增加紧凑的风格切换入口。
- Edge cases: 窄屏弹层需避免溢出；触控目标 ≥ 44px。

**Feature 6: 首屏防闪**
- Description: 主题值改由 cookie 承载，在 `layout.tsx` 服务端读取并写 `<html>` class。
- Edge cases: 未设置 cookie 时回落到默认皮肤；非法 cookie 值回落到默认。
- Error handling: 读 cookie 抛错时静默回落默认。

### Out of Scope
- ZZZ 路由专属皮肤（`zzz-immersive` / `zzz-dark`）本身的重做
- 非核心页面（后台、教程页等）的组件级新拟物精修（归二期）
- 引入任何视觉回归测试框架
- 深色版新拟物变体（本次只做规范指定的浅色同色系一款）

---

## Technical Constraints

### Performance
- 纯 CSS 变量 + 类切换实现，**零新增运行时依赖**（遵守 CLAUDE.md「不引入未在项目中使用的库」）。
- 切换不得触发额外网络请求；不得改变渲染路径与数据获取。
- 新样式体积需可控（非硬指标，但避免逐组件复制粘贴）。

### Security
- 无认证/支付等敏感面。
- 主题 cookie 为非敏感偏好项，沿用现有 `SameSite=Lax`。

### Integration
- **`src/components/layout/theme-provider.tsx`**：扩展 `themes` 列表，由 `localStorage` 迁移到 cookie（同时保留迁移逻辑）。
- **`src/app/globals.css`**：新增 `.theme-neumorphism` 作用域块与控件覆盖规则。
- **`src/app/layout.tsx`**：服务端读取主题 cookie 并注入 `<html>` class。
- **`src/components/layout/theme-toggle.tsx`**：新增语义类名 + 移动端入口。
- **`src/components/layout/layout-style-provider.tsx`**：协调 `theme-zzz-dark` 与新拟物的优先级（新拟物优先时不再挂 `zzz-dark` 类）。
- Tailwind v4 分层注意：新覆盖规则应置于**无 `@layer` 区域**（非分层样式优先于任何 `@layer` 内样式），以稳定压过组件内联的 Tailwind 工具类。
- 优先级冲突兜底：`.theme-neumorphism` 与 `.theme-zzz-dark` 同为 (0,1,0)，同分须靠源码顺序或显式组合选择器（`.theme-neumorphism.theme-zzz-dark`）解决。

### Technology Stack
- Next.js 15 App Router / React / Tailwind CSS v4 / TypeScript（沿用现有栈）
- 浏览器：现代常青浏览器；验证覆盖桌面 ≥1280px 与移动 390px 两个断点
- 不新增构建配置

---

## MVP Scope & Phasing

### Phase 1: MVP（首页跑通）
- `theme-neumorphism` 令牌与作用域定义
- 头部下拉新增第 4 个选项 + 控件自身新拟物化
- 首屏 SSR 注入防闪 + cookie 持久化
- **首页**组件级精修 + 零位移验收（截图 diff）
- 与 `zzz-dark` 的优先级裁定

**MVP Definition**: 用户能在首页选中「新拟物」并看到一套完整、自洽、零位移的新拟物界面，且现有三款完全不受影响。

### Phase 2: 铺开（核心页面）
- mod 列表页 / mod 详情页 / 收藏页的组件级精修
- 每页跑一遍截图 diff 与可访问性清单
- 移动端入口在窄屏导航中的最终打磨

### Future Considerations
- 深色版新拟物变体
- 非核心页面（后台、教程）的统一
- 新拟物动效的进一步打磨（保持 reduced-motion 兼容）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 边框补偿遗漏导致像素位移 | High | High | 逐页截图 diff（0 像素容差）作为硬门禁；先首页跑通验证方法论 |
| 内联 Tailwind 工具类覆盖失败（控件仍为粗野风） | Med | Med | 覆盖规则置于无 `@layer` 区域；先做最小可复现验证再用类名挂钩 |
| `theme-zzz-dark` 与新拟物同分冲突 | Med | Med | 显式在 provider 层裁定优先级，辅以组合选择器兜底 |
| 新拟物天然低对比导致可访问性不达标 | High | Med | 墨色采用深墨（非灰）并做 AA 校验；补强调色焦点环 |
| 全局浅色画布影响非核心页面观感 | Med | Low | 一期即声明范围；非核心页面跟随变量、二期精修 |
| 与现有三款皮肤产生意外耦合 | Low | High | CSS 作用域严格隔离 + 三款回归 diff 基线 |

---

## Dependencies & Blockers

**Dependencies:**
- `ui_design_docs/Neumorphism/neumorphism-design-spec.md`（设计规范，已就位）
- 项目已有的 headless Chrome + CDP 验证能力（用于截图 diff）

**Known Blockers:**
- 无硬阻塞。唯一需要开工前确认的是：截图 diff 的基线如何取得（改造前需先对四个核心页面各断点截一版基线）。

---

## Appendix

### Glossary
- **Neumorphism（新拟物派）**：介于扁平与拟物之间的风格，用双重柔和阴影模拟元素从同色背景中"挤压"或"凹陷"的效果。
- **零位移**：皮肤切换前后，元素坐标与盒子尺寸完全一致，截图像素差为 0。
- **FOUC**：首屏闪错皮肤（Flash of Unstyled/Incorrect Content）。
- **neo-* 工具类**：站内新粗野主义基础样式（`neo-card` / `neo-button-primary` 等）。

### References
- 设计规范：`ui_design_docs/Neumorphism/neumorphism-design-spec.md`
- 创意简报：`ui_design_docs/Neumorphism/neumorphism-creative-brief.md`
- 现有风格切换实现：`src/components/layout/theme-provider.tsx`、`src/components/layout/theme-toggle.tsx`
- 现有皮肤令牌：`src/app/globals.css`
- 既有相关 PRD：`docs/zzz-style-switch-prd-v2.md`、`docs/mod-layout-toggle-prd.md`

### 交付检查（源自设计规范，逐条自检）
- [ ] 替换示例内容后，页面仍一眼识别为新拟物派
- [ ] 按钮、卡片、输入、空状态、错误、加载状态共享同一套视觉语言
- [ ] 无 `border-2` 及以上粗边框被通用组件库默认样式带进来
- [ ] 无纯黑/纯白背景、无高对比配色、无渐变背景、无直角
- [ ] 按钮无任何 translate 位移
- [ ] hover 时阴影缩小而非增大
- [ ] 光源方向一致（亮在左上、暗在右下）

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
