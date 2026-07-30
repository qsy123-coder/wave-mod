# Product Requirements Document: 修复瀑布流图片加载黑屏抖动

**Version**: 1.0
**Date**: 2026-07-30
**Author**: Sarah (Product Owner)
**Quality Score**: 92/100

---

## Executive Summary

瀑布流模式下，骨架占位卡片消失后真实卡片渲染，但图片尚未加载完毕。此时图片容器因无内容而塌缩为几乎零高度的"横屏"状态。当图片最终加载完成，容器突然撑开到图片自然比例，挤开周围卡片，造成明显的位置跳变。

本需求通过 `img.onLoad` 事件读取图片真实宽高比，动态设置容器 `aspect-ratio`，实现容器尺寸即时稳定。同时对未加载状态设置最小高度兜底，消除"横屏"塌缩。

---

## 问题陈述

**时序分析:**
1. `fetchNextPage` 完成 → React 渲染真实 ModCard 替换骨架
2. `<Image fill>` 渲染，但网络请求图片尚未返回 → 容器高度为 0 → 卡片呈极扁的"横屏"
3. 图片加载完成 → `object-contain` 撑开容器到图片自然比例 → 当前列高度变化 → 列内容被推挤 → 视觉抖动

**根因**: `fill` 模式依赖内容撑开容器，图片未加载时容器无尺寸约束。

**方案**: 图片 onLoad 读取 `naturalWidth/naturalHeight`，计算 `aspect-ratio` 写入容器 CSS。未加载时用估算比例兜底。

---

## 成功指标

- 新卡片出现时不塌缩为横屏，有合理的最小高度
- 图片加载完成后容器无二次尺寸跳变
- 瀑布流滚动加载全程无视觉抖动
- 不影响网格模式

---

## 用户故事

### Story 1: 图片加载不抖动

**作为** mod 浏览者
**我想** 滚动加载新 mod 时，卡片尺寸立即稳定
**以便** 我的浏览位置不被挤开，体验流畅

**验收标准:**
- [ ] 新卡片渲染时图片区域有最小高度，不塌缩为横线
- [ ] 图片加载完成后容器尺寸不变（onLoad 已锁定比例）
- [ ] 周围卡片位置不受新卡片图片加载影响

---

## 功能需求

### 核心: img onLoad 锁定容器 aspect-ratio

**实现要点:**
1. 图片容器设置初始 `style={{ aspectRatio: '4/5' }}`（估算值，保证不塌缩）
2. 主图片 onLoad: 读 `img.naturalWidth / img.naturalHeight`
3. 用 state 存储真实 aspect-ratio，写入容器 style
4. 过渡添加 `transition-[aspect-ratio]` 实现平滑调整

**边界情况:**
- 图片加载失败: 保持估算比例，不崩溃
- 极宽/极高图片: aspect-ratio 计算正确，不做 clamp（保持真实比例）
- 缓存图片（instant load）: onLoad 在渲染前触发，无可见过渡

**仅影响瀑布流模式** (`imageAspectClassName === "auto"`)，网格模式不变。

### 不包含

- 服务端返回图片尺寸（Phase 2 优化）
- 网格模式修改

---

## 技术约束

- 修改仅涉及 `ModCard` 组件的 masonry 渲染分支
- 使用原生 `img.onLoad`，不引入新依赖
- `transition-[aspect-ratio]` 利用 CSS transition 实现平滑过渡

---

## MVP 范围

- `ModCard` 瀑布流图片区域：onLoad 读取尺寸 + 动态 aspect-ratio
- 初始估算比例防塌缩
- 不影响网格模式

---

## 关键文件

- `src/components/common/mod-card.tsx` — 图片渲染逻辑
