# PRD: 筛选/排序点击即时加载反馈

**Version**: 1.0
**Date**: 2026-07-30
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

Mod 列表页面中，角色筛选和排序切换采用整页跳转（URL 变化），点击后存在短暂空白期——从点击到 Suspense 骨架屏出现之间无任何视觉反馈，用户无法感知操作已生效。本需求在点击后立即展示**页面顶部进度条（NProgress 风格）+ 卡片区域骨架屏**，消除"点击后无响应"的体验问题。

MVP 范围限定在全局 Mods 页面（`/mods`），涉及角色筛选侧边栏和排序下拉。

---

## Problem Statement

**现状**: 角色筛选（CharacterSidebar）和排序切换（ModsToolbar Sort 下拉）通过 `<Link>` 跳转和 `router.push()` 改变 URL 参数触发整页重新渲染。点击后用户看到：
1. 短暂空白（浏览器等待新页面）
2. Suspense fallback 骨架屏出现
3. 数据加载完成后渲染真实内容

第 1→2 步的空白期让用户感到"卡顿"，甚至重复点击。

**解决方案**: 利用 React `useTransition` / Next.js App Router 的路由事件机制，在导航开始时立即渲染 Suspense fallback（骨架屏）并显示顶部进度条，消除空白期。

**预期效果**: 点击后 < 100ms 内看到视觉反馈，用户明确感知操作已生效。

---

## Success Metrics

| 指标 | 目标 | 测量方式 |
|---|---|---|
| 点击到视觉反馈延迟 | < 100ms | React DevTools / Performance 面板 |
| 用户重复点击率 | 降低 80% | 事件埋点统计 |
| 感知性能评分 | 用户反馈正面 | 上线后收集 |

---

## User Stories

### Story 1: 角色筛选即时反馈

**As a** Mod 浏览用户
**I want to** 点击角色筛选后立即看到页面有响应
**So that** 我知道筛选操作已经生效，不用等待或重复点击

**Acceptance Criteria:**
- [ ] 点击角色侧边栏的角色标签后，立即（< 100ms）显示顶部进度条
- [ ] Mod 卡片区域立即切换为骨架屏（ModGridSkeleton）
- [ ] 数据加载完成后进度条自动消失，卡片从骨架屏过渡为真实内容
- [ ] 如果加载失败，进度条消失，展示错误信息

### Story 2: 排序切换即时反馈

**As a** Mod 浏览用户
**I want to** 切换排序方式后立即看到加载状态
**So that** 我知道排序操作正在处理中

**Acceptance Criteria:**
- [ ] 点击排序下拉（默认/最新/热度/收藏/评分）后，立即显示顶部进度条
- [ ] 卡片区域立即切换为骨架屏
- [ ] 数据加载完成后进度条消失，内容正常显示

---

## Functional Requirements

### Core Feature: 页面级路由加载反馈

**描述**: 当用户通过角色筛选或排序触发页面导航时，在页面渲染前就展示加载状态。

**涉及组件**:
- `CharacterSidebar` — 角色筛选链接
- `ModsToolbar` — 排序下拉（`router.push`）

**技术方案**:
1. **顶部进度条**: 在 `src/app/(site)/mods/layout.tsx` 中添加一个全局进度条组件，监听 Next.js 路由事件（`usePathname` + `useSearchParams` 变化），导航开始时动画启动，页面渲染完成后结束。
2. **骨架屏**: 利用已有的 `ModGridSkeleton` 组件，确保 Suspense boundary 在导航开始时立即 fallback 到骨架屏。

**用户流程**:
1. 用户在 `/mods` 页面点击角色"椿"或切换排序为"热度"
2. URL 立即变化（`/mods?character=椿` 或 `/mods?sort=hot`）
3. 顶部进度条立即出现并开始动画
4. Suspense fallback 展示 `ModGridSkeleton`
5. 服务端返回新数据
6. 进度条完成动画并消失
7. 骨架屏替换为真实 Mod 卡片

**边界情况**:
- 快速连续切换：每次切换重置进度条，不累加
- 加载超时：进度条显示 5 秒后自动消失，展示 timeout 提示
- 同页面内 Link 跳转（如 `/mods` → `/mods?character=椿`）：Next.js 的客户端导航应触发 Suspense fallback

### Out of Scope (MVP)
- ZZZ Mods 页面的筛选反馈
- 游戏 Mods 页面（`[game]/mods`）的筛选反馈
- NSFW/直链客户端筛选的反馈（无需改动，已瞬间响应）
- 搜索栏输入后的反馈

---

## Technical Constraints

### 技术方案

**进度条实现**:
- 方案：使用轻量 NProgress 风格的 CSS 动画进度条（避免引入额外 npm 包）
- 位置：`src/app/(site)/mods/layout.tsx` 的 Layout 中
- 触发：通过 Next.js `useSearchParams` 变化检测导航开始，通过 `useEffect` 控制动画生命周期

**骨架屏**:
- 复用已有 `ModGridSkeleton` 组件（`src/components/layout/data-skeletons.tsx`）
- 确保 `ModsListing` 中 Suspense 的 fallback 在客户端导航时也能正常触发

### 性能
- 进度条动画使用 CSS transform，不影响主线程
- 骨架屏仅在加载期间渲染，加载完成后立即卸载

### 兼容性
- 需确保与现有 `useLayoutPreference` localStorage 逻辑无冲突
- 需确保与 TanStack Query 的 `initialData` 机制无冲突
- 不影响客户端筛选（NSFW/直链）的即时响应体验

---

## MVP Scope

**Phase 1: MVP（本次）**
- 全局 Mods 页面（`/mods`）的角色筛选和排序切换
- 顶部进度条 + 卡片骨架屏

**Phase 2: 扩展（后续）**
- 游戏 Mods 页面（`[game]/mods`）
- ZZZ Mods 页面（如需要）

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Next.js 客户端导航不触发 Suspense fallback | 中 | 高 | 验证 `router.push` / `<Link>` 在 App Router 中 Suspense 的行为，备选使用 `startTransition` |
| 进度条与现有骨架屏视觉冲突 | 低 | 低 | 进度条在顶部、骨架屏在内容区，空间不重叠 |
| 性能回退 | 低 | 中 | CSS 动画不阻塞主线程，性能影响可忽略 |

---

## Dependencies

- 已有组件: `ModGridSkeleton`, `ModsListing` Suspense boundary
- 已有框架: Next.js App Router, TanStack Query
- 无新增外部依赖

---

*This PRD was created through interactive requirements gathering with quality scoring (90/100).*
