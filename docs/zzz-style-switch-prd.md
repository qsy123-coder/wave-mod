# Product Requirements Document: 绝区零分站视觉风格切换

**版本**: 1.0
**日期**: 2025-06-15
**作者**: Sarah (Product Owner)
**质量评分**: 90/100

---

## Executive Summary

绝区零分站目前使用一套专属的深色沉浸式视觉风格（暗色背景 + 毛玻璃面板 + 背景图片 + 多列布局），与全站其他分站的新粗野主义（Neo-Brutalism）经典风格截然不同。当前两种风格通过硬编码 `game.key === "zenless-zone-zero"` 选择，用户无法自主切换。

本功能在绝区零分站导航栏中添加风格切换按钮，使用户可以在「ZZZ 深色沉浸式风格」和「经典新粗野主义风格」之间自由切换。切换即时生效（300-500ms 淡入淡出过渡），偏好持久化存储（localStorage + 登录用户跨设备同步）。目标是让偏好经典风格的老用户留在绝区零分站，降低因视觉风格差异导致的用户流失。

---

## Problem Statement

**当前状况**：
- 绝区零分站强制使用深色沉浸式风格，用户无法选择
- 两种风格是完全独立的组件树（不同导航、不同布局、不同卡片），通过路由文件中的 `game.key === "zenless-zone-zero"` 硬编码决定
- `useCustomLayout` 配置字段已定义但从未被实际使用，存在死代码
- 已有的全局主题系统（`ThemeProvider` + 3 个子主题）仅控制颜色变量，无法切换组件树级别的风格

**解决方案**：
- 引入 `LayoutStyle` 状态（`"zzz-immersive"` | `"neo-brutalism"`），替代硬编码的 key 判断
- 在绝区零导航栏中提供切换入口，动态渲染对应的组件树
- 复用已有 `ThemeProvider` 的 localStorage 持久化模式，扩展为风格偏好存储
- 同时渲染两套组件树，通过 CSS `opacity` + `transition` 实现交叉渐变

**业务影响**：
- 预期风格切换按钮点击率 > 5%（衡量功能发现性）
- 经典风格用户的页面停留时长不低于 ZZZ 风格用户
- 降低因视觉偏好不匹配导致的跳出

---

## Success Metrics

**主要 KPI：**

- **切换按钮点击率 > 5%**：在绝区零分站的独立访客中，至少 5% 会点击风格切换按钮。通过前端埋点（自定义事件 `style_switch_click`）统计。

- **经典风格用户停留时长对比**：切换到经典风格的用户，在绝区零分站的平均页面停留时长不低于 ZZZ 深色风格用户。通过前端性能监控（`performance.now()` 或 Web Vitals 扩展）统计。

**验证方式**：功能上线 2 周后进行数据回顾，对比切换用户与未切换用户的行为指标。

---

## User Personas

### Primary: 新粗野主义偏好型 MOD 玩家

- **角色**：绝区零 MOD 用户，之前使用过鸣潮/原神分站
- **目标**：在绝区零分站浏览和下载 MOD，但更喜欢全站统一的新粗野主义视觉风格
- **痛点**：绝区零的深色风格与熟悉的经典风格差异太大，导航位置和布局不同导致操作不习惯
- **技术水平**：中级——熟悉 Web 应用，能发现并点击 UI 按钮

### Secondary: 视觉探索型用户

- **角色**：对所有视觉风格好奇的 MOD 玩家
- **目标**：尝试不同的视觉风格，找到自己最喜欢的
- **痛点**：当前无法切换，只能接受默认风格
- **技术水平**：初级到中级

---

## User Stories & Acceptance Criteria

### Story 1: 切换视觉风格

**作为** 绝区零分站的访客
**我想要** 在导航栏中点击风格切换按钮
**以便** 在 ZZZ 深色沉浸式风格和经典新粗野主义风格之间选择我喜欢的视觉呈现

**验收标准：**
- [ ] 绝区零导航栏（`ZenlessGlassNav`）右侧显示风格切换按钮（图标 + 文字标签）
- [ ] 当前激活的风格在按钮上有视觉标识（高亮/下划线/填充）
- [ ] 点击未激活的风格选项后，页面内容以 300-500ms 淡入淡出过渡切换
- [ ] 切换后无页面布局抖动（CLS ≈ 0）
- [ ] 经典风格下，导航栏使用 `SiteHeader` 组件（浅黄色背景 + "W" 标志）
- [ ] ZZZ 风格下，导航栏使用 `ZenlessGlassNav` 组件（透明毛玻璃 + "Z" 标志）

### Story 2: 风格偏好持久化

**作为** 绝区零分站的访客
**我想要** 我的风格选择被浏览器记住
**以便** 下次访问时自动应用我偏好的风格，无需重新切换

**验收标准：**
- [ ] 风格偏好存储在 `localStorage` 中，key 为 `wavemod-layout-style`
- [ ] 下次访问绝区零分站时，自动读取偏好并应用对应风格
- [ ] 默认值（无存储记录时）为 `"zzz-immersive"`（保持现有用户体验不变）
- [ ] 无效/被篡改的存储值自动回退到默认值

### Story 3: 跨设备同步（登录用户）

**作为** 已登录的绝区零 MOD 玩家
**我想要** 我的风格偏好同步到我的账户
**以便** 在手机、平板、其他电脑上访问时自动使用相同风格

**验收标准：**
- [x] 登录用户在切换风格后，偏好同步写入 Supabase 用户档案
- [x] 页面加载时优先读取 Supabase 偏好，其次回退到 localStorage
- [x] 未登录用户仅使用 localStorage，不报错
- [x] 同步失败时静默降级（仅使用 localStorage），不阻塞页面渲染

### Story 4: 引导页和收藏页降级处理

**作为** 使用经典风格的绝区零访客
**我想要** 在引导页（guide）和收藏页（favorites）也能看到一致的经典风格
**以便** 整个分站的视觉风格统一

**验收标准：**
- [ ] 引导页（`/zenless-zone-zero/guide`）和收藏页（`/zenless-zone-zero/favorites`）在经典风格下使用默认共享组件
- [ ] ZZZ 风格下保持现有行为（使用默认共享组件，因这些页面无 ZZZ 专属版本）
- [ ] 两种风格下功能完全一致，仅视觉呈现不同

### Story 5: 移动端导航适配

**作为** 使用手机访问绝区零分站的用户
**我想要** 切换风格后导航栏在手机上也能正常使用
**以便** 在移动设备上获得一致的体验

**验收标准：**
- [ ] 经典风格在移动端使用 `SiteHeader` 的响应式导航
- [ ] ZZZ 风格在移动端保持底部横向滚动导航栏
- [ ] 两种风格在移动端均无横向溢出或布局错乱
- [ ] 风格切换按钮在移动端可见且可点击（触摸目标 ≥ 44×44px）

---

## Functional Requirements

### 核心功能

**功能 1: 风格切换 UI**

- **描述**：在绝区零导航栏中嵌入风格切换按钮。ZZZ 风格时在 `ZenlessGlassNav` 右侧添加；经典风格时在 `SiteHeader` 右侧添加。
- **用户流程**：
  1. 用户进入绝区零分站任意页面
  2. 在导航栏右侧看到风格切换按钮（显示当前风格名称/图标）
  3. 点击按钮展开两个选项：「🎮 ZZZ 沉浸式」和「🧱 经典新粗野主义」
  4. 选择后立即触发风格切换
- **边缘情况**：
  - 经典风格下，ZZZ 专属导航项（「角色分类」「先看我」）映射为默认导航项或隐藏
  - 建议：经典风格使用 `SiteHeader` 的通用导航（首页/MOD/排行/指引）+ 保留「角色分类」作为 MOD 页的筛选参数
- **错误处理**：切换过程中组件渲染失败时，回退到默认 ZZZ 风格并显示 toast 提示

**功能 2: 风格状态管理**

- **描述**：创建 `LayoutStyleContext`（或扩展 `ThemeProvider`），管理当前风格状态。风格值为 `"zzz-immersive"` | `"neo-brutalism"`。
- **数据流**：
  ```
  [localStorage / Supabase] → LayoutStyleContext → 各页面条件渲染 → 对应组件树
  ```
- **边缘情况**：
  - SSR 阶段无法读取 localStorage，默认设为 `"zzz-immersive"`，hydration 后再同步
  - 使用 `suppressHydrationWarning` 或 Client-only 包裹避免 hydration mismatch
- **错误处理**：读取存储失败时静默回退默认值

**功能 3: 组件树切换**

- **描述**：在每个路由页面中，用风格状态替代硬编码的 `game.key === "zenless-zone-zero"` 判断。
- **受影响的文件**：
  - `src/app/[game]/layout.tsx` — 导航栏选择
  - `src/app/[game]/page.tsx` — 首页组件选择
  - `src/app/[game]/mods/page.tsx` — MOD 列表页组件选择
  - `src/app/[game]/mods/[id]/page.tsx` — MOD 详情页组件选择
  - `src/app/[game]/ranking/page.tsx` — 排行榜页组件选择
- **边缘情况**：
  - 两种组件树通过 `next/dynamic` 懒加载，减少初始包体积
  - 切换时两套组件短暂共存（用于交叉渐变），需处理 z-index 层级

**功能 4: 淡入淡出过渡**

- **描述**：使用 CSS `opacity` 过渡 + `position: absolute` 叠加两套组件，在 300-500ms 内完成交叉渐变。
- **实现方案**：
  - 切换触发 → 新组件树以 `opacity: 0` 渲染在旧组件上方 → `requestAnimationFrame` 后新组件 `opacity: 1`，旧组件 `opacity: 0` → 过渡结束后卸载旧组件
  - 使用 Framer Motion `AnimatePresence` + `mode="wait"` 简化实现
- **性能要求**：过渡期间不触发布局重计算（仅 `opacity` 变化），避免 CLS

### 不在 MVP 范围内

- 将 ZZZ 风格推广到鸣潮/原神分站（仅绝区零分站支持切换）
- 风格切换的子主题联动（经典风格下的 arcade/neon-night/sunset-flyer 三个子主题保持独立，不受风格切换影响）
- 风格预览/对比模式
- A/B 测试框架集成

---

## Technical Constraints

### 性能

- 切换响应时间 < 100ms（从点击到开始过渡动画）
- 过渡动画持续时间：300-500ms
- 切换过程 Cumulative Layout Shift (CLS) = 0
- 默认组件树（ZZZ 风格）在初始加载时同步渲染；备选组件树通过 `next/dynamic` 懒加载
- 备选组件树首次加载时间 < 2s（含 JS bundle 下载 + 解析）

### 安全

- localStorage 偏好值使用 Zod 校验，防止 XSS（仅允许 `"zzz-immersive"` 和 `"neo-brutalism"`）
- Supabase 同步仅更新用户档案中的 `layout_style` 字段，不影响其他数据

### 兼容性

- 浏览器：Chrome 90+、Firefox 90+、Safari 15+、Edge 90+
- 移动端：iOS Safari 15+、Android Chrome 90+
- 屏幕宽度：320px – 2560px（响应式适配两种风格）

### 集成

- **Supabase**：用户档案表 `profiles` 增加 `layout_style` 字段（`text`，nullable）
- **ThemeProvider**：不修改现有主题系统，风格切换是正交的新维度
- **导航组件**：
  - `ZenlessGlassNav`：接收 `onStyleSwitch` 回调 + `currentStyle` props
  - `SiteHeader`：接收 `onStyleSwitch` 回调 + `currentStyle` props（仅在绝区零分站显示切换按钮）

### 技术栈约束

- TypeScript strict mode
- Next.js App Router (Server Components preferred)
- 不引入新的第三方状态管理库（复用 Zustand 或 React Context）
- 遵循项目 Feature-Sliced Design 目录结构

---

## MVP 范围与分阶段计划

### Phase 1: MVP（首次发布）

- [x] `LayoutStyleContext` 状态管理（localStorage 持久化）
- [x] 绝区零导航栏风格切换按钮
- [x] 五个路由页面的风格条件渲染（首页/MOD列表/MOD详情/排行榜/layout）
- [x] 淡入淡出过渡动画
- [x] 引导页/收藏页降级处理
- [x] 移动端适配
- [x] 登录用户 Supabase 偏好同步

**MVP 定义**：绝区零分站用户可以通过导航栏按钮切换两种视觉风格，偏好被持久化，所有页面正常工作，移动端体验一致。

### Phase 2: 增强（发布后）

- 风格切换埋点 + 数据分析看板
- 经典风格下 MOD 详情页的 ZZZ 专属功能适配（如 `ZenlessDetailLayoutSwitch` 切换为经典风格兼容版本）
- 风格切换快捷键（如 `Ctrl+Shift+S`）

### 未来考虑

- 将 ZZZ 深色风格作为「暗色主题」推广到其他分站
- 风格切换的用户引导（首次访问 tooltip 提示）
- 社区投票：让用户决定默认风格

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| 两套组件树共存导致 bundle 体积显著增大 | 中 | 中 | 使用 `next/dynamic` 懒加载备选组件树，按需下载；监控 bundle 体积变化 |
| 风格切换时布局闪烁（CLS > 0） | 中 | 高 | 严格限制过渡动画仅使用 `opacity`；使用 `position: absolute` 叠加组件避免回流；`will-change: opacity` 提示 GPU 加速 |
| Supabase 同步失败影响用户体验 | 低 | 低 | 同步失败静默降级到 localStorage；添加重试逻辑（最多 3 次，指数退避） |
| 经典风格下 ZZZ 专属功能不可用 | 高 | 中 | MVP 阶段接受功能降级；在切换按钮旁标注「部分 ZZZ 专属功能在经典风格下不可用」 |
| 用户混淆风格切换与子主题切换 | 中 | 低 | 在风格切换按钮旁添加明确标签区分；子主题切换器保持独立 |

---

## Dependencies & Blockers

**依赖项：**

- **Supabase `profiles` 表 schema 更新**：需要添加 `layout_style` 字段（`text, nullable`）。由后端/Supabase 管理员执行 migration。
- **`ZenlessGlassNav` 和 `SiteHeader` 组件改造**：需要在两个导航组件中添加风格切换 UI 入口。由前端开发执行。
- **`LayoutStyleContext` 创建**：需要新建状态管理模块，可能复用 `ThemeProvider` 的模式。由前端开发执行。

**已知阻塞项：**

- 无阻塞项。所有依赖均为内部可控。

---

## Appendix

### Glossary

- **新粗野主义 (Neo-Brutalism)**：WaveMod 全站的默认视觉风格——粗黑 4px 边框、零圆角、8px 投影、高对比色彩、全大写排版
- **ZZZ 深色沉浸式风格**：绝区零分站的专属视觉风格——黑色/深棕背景 + PNG 背景图片 + 毛玻璃面板 + 多列布局
- **子主题**：新粗野主义风格下的三个颜色变体（theme-arcade、theme-neon-night、theme-sunset-flyer），由 `ThemeProvider` 管理
- **CLS**：Cumulative Layout Shift，衡量页面视觉稳定性的 Web Vitals 指标

### References

- 项目编码规范：`docs/Coding-Standards.md`
- AI 交互指南：`docs/AI-Interaction-Guidelines.md`
- 游戏配置：`src/config/games.ts`
- 主题系统：`src/components/layout/theme-provider.tsx`
- 全局样式：`src/app/globals.css`
- ZZZ 专用组件：`src/features/games/zenless-zone-zero/`
- 共享默认页面：`src/features/games/shared/`

---

*本 PRD 通过交互式需求收集和质量评分系统生成，确保全面覆盖业务、功能、用户体验和技术维度。*
