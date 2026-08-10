# Product Requirements Document: 首页全屏滚动改版

**Version**: 1.0
**Date**: 2026-08-04
**Author**: Sarah (Product Owner)
**Quality Score**: 94/100

---

## Executive Summary

WaveMod 主站首页 `/` 当前承载过多排名榜单（本周热门、高评分精选、最新发布、优秀创作者），导致页面冗长、信息密度过高。本次改版将首页精简为两个全屏区域——保留现有 Hero 轮播区作为第一屏，下方替换为绝区零分站首页整体（大屏轮播 + 精选内容区）作为第二屏。通过纯 CSS scroll-snap 实现区域间的丝滑切换，每个区域占满一整屏高度，给用户带来沉浸式的浏览体验。

目标用户为国内鸣潮 Mod 玩家群体，首页作为流量入口，改版后应提升视觉冲击力和内容发现效率。

---

## Problem Statement

**Current Situation**：
- 首页 Hero 下方堆叠了 4 个排名榜单 + 角色分类标签 + 支持卡片，共 6 个 section
- 页面过长，用户需要大量滚动才能浏览全部内容
- 排名榜单在首页曝光有限（每个只展示 3 个 MOD），信息效率低
- 绝区零分站首页的设计更现代、更有冲击力，但主站首页未能复用

**Proposed Solution**：
1. 删除现有 Hero 下方的全部排名榜单、角色分类标签、支持卡片
2. **第一屏**：保留现有 Hero 区域（左侧文案 + 右侧 HeroCarousel 轮播），不做改动
3. **第二屏**：复用绝区零分站首页整体——`ZenlessHeroStage`（大屏轮播） + `ZenlessLowerHome`（精选内容区），轮播和内容数据替换为鸣潮 MOD
4. 实现纯 CSS scroll-snap 全屏滚动：现 Hero → ZZZ 首页整体
5. 每个区域高度 = `calc(100vh - header高度)`，Header 固定吸顶
6. 第二屏内容较多（Hero + LowerHome 组合），区域内部可独立滚动
7. Hero 区域突破 `max-w-[1680px]` 容器，撑满视口宽度

**Business Impact**：
- 减少首页认知负荷，聚焦核心 Hero 展示
- 复用已验证的 ZZZ 分站设计语言，降低设计成本
- 全屏沉浸式体验提升用户停留时长和内容点击率

---

## Success Metrics

**Primary KPIs:**
- **首页跳出率**：改版后首页跳出率降低 10%+（通过 analytics 对比改版前后 2 周数据）
- **Hero 轮播点击率**：Hero 区域 MOD 卡片点击率提升（点击进入详情页 / 首页总 PV）
- **精选内容区互动率**：下方 ZZZ 风格区域中 MOD 卡片、分类标签的点击率

**Validation**：改版上线后 2 周，对比 Google Analytics / Vercel Analytics 的改版前后数据。

---

## User Personas

### Primary: 鸣潮 Mod 浏览者
- **Role**：鸣潮玩家，寻找角色 MOD
- **Goals**：快速发现热门 MOD、浏览高清预览图、找到想要的 MOD 并下载
- **Pain Points**：首页内容太多太杂，滚动很久才能看完；排名榜单只有 3 个位置，不够丰富
- **Technical Level**：初级到中级，以移动端访问为主

---

## User Stories & Acceptance Criteria

### Story 1: 全屏滚动浏览首页

**As a** 鸣潮 Mod 浏览者
**I want to** 通过轻轻滚动鼠标/手指就能在首页两个区域间切换
**So that** 获得流畅、沉浸的浏览体验

**Acceptance Criteria:**
- [ ] 首页有两个全屏 snap 区域：现有 Hero 区域 + ZZZ 首页整体
- [ ] 每个区域高度占满视口（减去固定 Header 高度），即 `calc(100vh - 64px)`
- [ ] 使用 CSS `scroll-snap-type: y mandatory` 实现自动吸附
- [ ] 滚动必须平滑，吸附到最近区域，无"卡在中间"的状态
- [ ] 桌面端和移动端均支持 scroll-snap
- [ ] 区域 2 内容较多（ZenlessHeroStage + ZenlessLowerHome），内部可独立滚动（`overflow-y: auto`）

### Story 2: 第一屏 — 现有 Hero 区域保留

**As a** 鸣潮 Mod 浏览者
**I want to** 在首页顶部看到熟悉的 Hero 轮播和站点介绍
**So that** 网站品牌认知保持一致

**Acceptance Criteria:**
- [ ] 保留现有的两栏布局（左侧文案 + 右侧 HeroCarousel）
- [ ] HeroCarousel 保持自动轮播、暂停/播放、指示点导航功能
- [ ] 左侧文案区域内容不变（「鸣潮角色 MOD」标题、描述、CTA 按钮）
- [ ] Hero 区域背景突破 max-w 容器，撑满视口宽度
- [ ] 整体适配全屏高度 `calc(100vh - 64px)`

### Story 3: 第二屏 — ZZZ 首页整体（鸣潮数据）

**As a** 鸣潮 Mod 浏览者
**I want to** 向下滚动后看到 ZZZ 风格的全屏轮播和精选内容
**So that** 享受更沉浸的视觉体验并发现更多 MOD

**Acceptance Criteria:**
- [ ] 区域 2 分为上下两部分：`ZenlessHeroStage`（大屏轮播）+ `ZenlessLowerHome`（精选内容），内部可滚动
- [ ] 大屏轮播：复用 ZZZ 全屏大图轮播设计（渐变遮罩、毛玻璃文字效果），轮播数据使用鸣潮 `getFeaturedMods(6)`
- [ ] 轮播 slide 的标题、角色名、描述 Fallback 替换为鸣潮角色（今汐、长离、漂泊者等）
- [ ] 精选内容：StatsBar + FeaturedMods 走马灯 + CreatorCta + CreatorsBar + LatestUpdates + PopularCategories
- [ ] 所有数据使用默认游戏（鸣潮，`wuthering-waves`）查询
- [ ] 各个子组件若数据为空，显示合理空状态占位

### Story 4: 首页独立布局

**As a** 产品负责人
**I want to** 首页使用独立布局，不使用 (site) 的通用 Footer
**So that** 页面干净收尾，符合全屏沉浸设计

**Acceptance Criteria:**
- [ ] 首页不渲染 SiteFooter
- [ ] 第二屏内容结束后页面自然结束
- [ ] 其他 `(site)` 路由页面不受影响，仍然使用 SiteFooter
- [ ] Header 保持固定吸顶，在 scroll-snap 容器上方

---

## Functional Requirements

### Core Features

**Feature 1: 全屏 Scroll-Snap 容器**
- Description: 创建一个 scroll-snap 容器包裹两个全屏区域，实现 CSS 原生全屏滚动捕捉
- User flow:
  1. 用户访问 `/` → 看到现有 Hero 区域占满视口
  2. 向下滚动滑轮/触屏滑动 → 自动吸附到第二屏（ZZZ 首页整体）
  3. 在第二屏内部继续滚动 → 浏览 ZZZ 大屏轮播和精选内容
  4. 向上滚动 → 吸附回 Hero 区域
- Edge cases:
  - 第二屏内部内容超出一屏高度 → 内部 `overflow-y: auto` 独立滚动
  - 移动端软键盘弹出 → 视口高度变化时 snap 仍正常工作
  - 快速连续滚动 → `scroll-snap-stop: always` 确保不会跳过区域
- Error handling: scroll-snap 是 CSS 特性，不依赖 JS，浏览器兼容性问题时降级为普通滚动

**Feature 2: 第一屏 — 现有 Hero 保留**
- Description: 保持现有 Hero 两栏布局，适配全屏高度
- User flow: 用户看到全屏 Hero，左侧站点介绍 + 右侧 embla 轮播
- Edge cases: MOD 数据为空时显示 fallback 占位卡片
- Error handling: 数据获取失败时显示骨架屏

**Feature 3: 第二屏 — ZZZ 首页整体（鸣潮数据）**
- Description: 将 `ZenlessHomePage` 整体（`ZenlessHeroStage` + `ZenlessLowerHome`）重构为通用组件，支持传入 game 参数
- User flow: 用户向下滚动，先看到 ZZZ 大屏轮播 → 继续滚动看到精选内容（统计条 → MOD 走马灯 → 创作者 CTA → 分类标签 → 最新更新）
- Edge cases: 各数据源为空时组件显示空状态占位，轮播 fallback 使用鸣潮角色名
- Error handling: 异步数据使用 Suspense + 骨架屏，单个组件数据失败不影响其他区域

### Out of Scope
- 不在首页添加第三个 snap 区域
- 不修改 SiteHeader 的结构
- 不改变非首页路由的布局
- 不修改 ZZZ 分站的 Hero 和 LowerHome 现有功能

---

## Technical Constraints

### Performance
- CSS scroll-snap 是纯 CSS 方案，无 JS 开销，不影响首屏性能
- 数据获取复用现有 `getFeaturedMods()`、`getLatestMods()`、`getTopCreators()` 等函数
- 图片继续使用 COS CDN + 数据万象处理（已有优化）
- LCP 目标：改版后不高于当前首页的 LCP

### Security
- 无新增安全风险，数据查询沿用现有 Prisma 查询和权限控制

### Integration
- **ZenlessHeroStage 重构**：`ZenlessHeroStage` + `ZenlessHeroCarouselClient` 从 `src/features/games/zenless-zone-zero/` 抽取为 `src/features/games/shared/` 下的通用组件，支持传入 `game` 参数和鸣潮 slide 数据
- **ZenlessLowerHome 重构**：从 `src/features/games/zenless-zone-zero/components/zenless-lower-home.tsx` 抽取为 `src/features/games/shared/` 下的通用组件
- **首页布局**：需要在 `src/app/(site)/page.tsx` 或新建 `src/app/page.tsx` 中实现独立布局
- **数据层**：`getAvailableCharacters()`、`getTopCreators()` 需确认支持 defaultGameKey 参数

### Technology Stack
- CSS `scroll-snap-type` + `scroll-snap-align`（原生 CSS，无需额外依赖）
- 复用现有 Next.js 15 + TypeScript + Tailwind CSS 栈
- 复用现有数据获取函数

---

## MVP Scope & Phasing

### Phase 1: MVP (Required for Initial Launch)
- 保留现有 Hero 区域（第一屏），适配全屏高度
- 删除 Hero 下方所有排名榜单、角色分类标签、支持卡片
- 将 `ZenlessHeroStage` + `ZenlessHeroCarouselClient` + `ZenlessLowerHome` 组合重构，接入鸣潮数据
- 实现 CSS scroll-snap 容器（2 个 snap 区域）
- 第二屏内部可滚动（ZenlessHeroStage + ZenlessLowerHome 内容超出视口时）
- 首页独立布局（无 Footer）
- 两个区域突破 max-w 容器撑满视口

### Phase 2: Enhancements (Post-Launch)
- 添加 snap 区域导航指示点（显示当前在第几个区域）
- 键盘上下箭头支持区域切换
- 滚动动画微调（snap 过渡效果）

### Future Considerations
- 第三个 snap 区域（如创作者推荐、社区动态）
- 首页背景视频/动态效果
- 个性化推荐（基于用户浏览历史）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| CSS scroll-snap 在旧浏览器不兼容 | Low | Medium | 降级为普通滚动，不影响可用性；检查 Can I Use 数据，iOS Safari 9.1+、Chrome 69+ 均支持 |
| 移动端全屏 snap 内容被截断 | Medium | Medium | 内容区内部设置 `overflow-y: auto` 和 `min-height: 100vh`，确保内容可完整浏览 |
| ZZZ 组件重构影响 ZZZ 分站 | Low | High | 抽取时保持原有 API 签名兼容，重构后在 ZZZ 分站首页验证无误 |
| ZenlessHeroCarouselClient 硬编码 ZZZ 角色名 | Medium | Medium | 抽取时通过 props 传入 slide 数据，鸣潮 fallback 使用鸣潮角色名（今汐、长离等） |
| 第二屏内部滚动与 snap 冲突 | Medium | Medium | 第二屏设置 `overflow-y: auto`，仅在内容区域内部已滚动到顶部/底部时才允许 snap 切换 |
| 全宽布局与现有 (site) layout 样式冲突 | Medium | Low | 使用负 margin 技巧或 CSS 自定义属性让 snap 区域突破容器限制 |

---

## Dependencies & Blockers

**Dependencies:**
- `getAvailableCharacters()` 需确认返回鸣潮的角色数据（当前已有 `defaultGameKey` 支持）
- `getTopCreators()` 已接受 `gameKey` 参数，可直接复用
- `getFeaturedMods(6, gameKey)` 已支持 gameKey 参数，Hero 轮播和精选内容均可复用
- `ZenlessHeroStage` + `ZenlessLowerHome` 组件需重构为通用组件，依赖 ZZZ 分站功能正常

**Known Blockers:**
- 无已知阻塞项

---

## Appendix

### Glossary
- **Scroll-snap**：CSS 原生滚动捕捉机制，容器设置 `scroll-snap-type`，子元素设置 `scroll-snap-align`，滚动停止时自动吸附到最近的 snap 点
- **ZenlessHeroStage**：绝区零分站首页的全屏大图轮播组件，带毛玻璃文字效果和渐变遮罩
- **ZenlessLowerHome**：绝区零分站首页的"下半部分"内容组件，包含统计条、精选 MOD 走马灯、分类标签等

### References
- [CSS Scroll Snap MDN 文档](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap)
- [Can I Use - CSS Scroll Snap](https://caniuse.com/css-snappoints)

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
