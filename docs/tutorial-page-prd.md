# Product Requirements Document: 教程页面（先看我）

**Version**: 1.1
**Date**: 2026-07-27
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

将 WaveMod 站点现有的占位教程页 `(site)/guide` 改造为以图片为主的完整 5 章节教程——从工具准备、解压、XXMI 安装、游戏内效果到 JASM 管理器。77 张截图已包含文字说明，页面作为图片展示框架。采用 Neo-Brutalist 风格，单栏全宽布局（移除侧边栏），垂直滚动 + 灯箱放大 + 顶部章节锚点导航，移动端自适应。

---

## Problem Statement

**Current Situation**：`(site)/guide` 目前是占位页，只有 4 条纯文字步骤，无法提供真正的安装指导。图片教程已准备好但未接入。

**Proposed Solution**：用 77 张截图按 5 个章节组织，以图片为主、文字为辅，用户可流畅滚动浏览完整安装流程。

**Business Impact**：降低评论区重复提问，提升新用户安装成功率。

---

## Success Metrics

- 教程页访问 → MOD 下载页的转化率
- 评论区安装相关问题减少量
- 教程页停留时长（验证用户是否在阅读）

---

## User Personas

### Primary: 新入坑 MOD 用户
- **Role**：游戏玩家，想装 MOD 但不知道从何下手
- **Goals**：按照教程一步步完成工具安装和 MOD 导入
- **Pain Points**：文字教程看不懂，需要看到实际界面截图
- **Technical Level**：初级，不熟悉 MOD 工具

---

## User Stories & Acceptance Criteria

### Story 1: 浏览完整教程

**As a** 新入坑 MOD 用户
**I want to** 从 00 到 04 依次浏览教程
**So that** 了解安装 MOD 的完整流程

**Acceptance Criteria:**
- [ ] 页面顶部显示 5 个章节锚点导航（00-04）
- [ ] 点击锚点平滑滚动到对应章节
- [ ] 章节之间有清晰视觉分隔
- [ ] 页面加载时图片懒加载，不影响首屏渲染

### Story 2: 查看图片细节

**As a** 新入坑 MOD 用户
**I want to** 放大查看截图中的文字
**So that** 看清具体操作步骤

**Acceptance Criteria:**
- [ ] 点击任意图片打开灯箱（lightbox）
- [ ] 灯箱中可缩放/拖动查看细节
- [ ] 灯箱支持左右切换同一章节内的图片
- [ ] ESC 或点击遮罩关闭灯箱

### Story 3: 在移动端阅读教程

**As a** 手机用户
**I want to** 在手机上也能看清教程图片
**So that** 边看手机边操作电脑

**Acceptance Criteria:**
- [ ] 图片自适应屏幕宽度
- [ ] 双击图片放大查看细节
- [ ] 章节导航在移动端不遮挡内容

### Story 4: 了解需要哪些工具（00 章节）

**As a** 准备入门的用户
**I want to** 在开始前知道需要下载哪些工具软件
**So that** 一次性准备好所有前置条件

**Acceptance Criteria:**
- [ ] 00 章节以文字列表形式展示工具清单
- [ ] 提供工具下载链接（如适用）
- [ ] 视觉风格与整体 Neo-Brutalist 保持一致

---

## Functional Requirements

### 页面结构

```
┌─────────────────────────────────┐
│  标题：「先看我」                  │
│  副标题：MOD 安装完整教程          │
├─────────────────────────────────┤
│  [00] [01] [02] [03] [04]  ← 锚点│
├─────────────────────────────────┤
│  00 需要的工具和软件               │
│  ┌─ 文字列表 ─────────────────┐  │
│  │  • 工具名称 + 描述          │  │
│  │  • 下载链接（可选）         │  │
│  └────────────────────────────┘  │
├─────────────────────────────────┤
│  01 工具的解压                    │
│  ┌─ 0.png ────────────────────┐  │
│  └────────────────────────────┘  │
│  ┌─ 1.png, 1-1.png, 1-2.png ─┐  │
│  └────────────────────────────┘  │
│  ┌─ 2.png ────────────────────┐  │
│  └────────────────────────────┘  │
├─────────────────────────────────┤
│  02 XXMI 的安装以及 mod 导入      │
│  ┌─ 3.png ────────────────────┐  │
│  └────────────────────────────┘  │
│  ... (共 36 张，3-38.png)        │
├─────────────────────────────────┤
│  03 游戏内 mod 效果及修复器       │
│  ... (共 9 张，39-47.png)        │
├─────────────────────────────────┤
│  04 JASM mod 管理器安装及导入     │
│  ... (共 28 张，48-75.png)       │
└─────────────────────────────────┘
```

### 图片映射

| 章节 | 图片范围 | 数量 |
|------|----------|------|
| 01 工具的解压 | 0.png, 1.png, 1-1.png, 1-2.png, 2.png | 5 |
| 02 XXMI 安装及 mod 导入 | 3.png ~ 38.png | 36 |
| 03 游戏内 mod 效果及修复器 | 39.png ~ 47.png | 9 |
| 04 JASM 管理器安装及导入 | 48.png ~ 75.png | 28 |

### 灯箱（Lightbox）

- **触发**：点击任意教程图片
- **功能**：
  - 全屏遮罩显示大图
  - 图片可缩放（滚轮/捏合）
  - 左右箭头切换同章节图片
  - 显示当前图片序号（如 "3 / 36"）
  - ESC / 点击遮罩 / X 按钮关闭
- **键盘支持**：← → 切换图片，ESC 关闭

### 章节导航

- **位置**：标题下方，sticky 定位
- **交互**：当前章节高亮，点击平滑滚动
- **滚动监听**：滚动时自动更新当前激活章节

### 错误/空状态

- **图片加载中**：显示模糊占位符（`blurDataURL`）或骨架屏
- **图片加载失败**：显示占位图 + "图片加载失败"文字
- **图片数量为 0**：该章节不渲染（防御性编程）

---

## Technical Constraints

### 性能
- 图片存放：`public/tutorial/` 静态托管，同源 CDN
- 懒加载：`next/image` + `loading="lazy"`，仅加载视口附近图片
- 格式优化：保留 PNG 原格式（截图含文字，WebP 可能影响可读性）
- 灯箱图片按需加载（点击时才加载原图）

### 技术栈约束
- Next.js 16 App Router + Server Component 优先
- Tailwind CSS + shadcn/ui
- 保持现有 Neo-Brutalist 设计风格
- TypeScript 严格模式

### 文件规划

| 路径 | 用途 |
|------|------|
| `src/app/(site)/guide/page.tsx` | 站点级教程页（Server Component） |
| `src/features/guide/` | 教程相关组件（新建） |
| `src/features/guide/components/guide-chapter.tsx` | 章节容器（Client Component，含灯箱交互） |
| `src/features/guide/components/guide-lightbox.tsx` | 灯箱组件 |
| `src/features/guide/components/guide-nav.tsx` | 章节锚点导航 |
| `src/features/guide/config.ts` | 教程数据结构 |
| `public/tutorial/` | 77 张截图 |
| `src/lib/constants/install-guide.ts` | 可删除（被新 config 替代） |

---

## MVP Scope & Phasing

### Phase 1: MVP（本次交付）
- [x] 5 章节图片展示（垂直滚动）
- [x] 灯箱（点击放大 + 左右切换）
- [x] 章节锚点导航（sticky）
- [x] 移动端自适应 + 双击放大
- [x] 00 章节文字内容（用户自行提供）

### Phase 2: 后续增强
- [ ] 图片懒加载的模糊占位（blurhash / 缩略图）
- [ ] 灯箱支持键盘快捷键提示
- [ ] 滚动位置记录（回到页面时恢复上次位置）
- [ ] 一键复制安装指引文字

---

## Design Decisions (Finalized)

| 决策项 | 结论 |
|--------|------|
| 整体布局 | 单栏全宽，图片优先，移除原侧边栏卡片 |
| 00 工具展示 | 简洁列表（工具名 + 下载链接） |
| 图片样式 | Neo-Brutalist 黑边框 + 硬阴影 (`border-4 border-black shadow-[6px_6px_0px_0px_#000]`) |
| 图片查看 | 垂直滚动 + 点击灯箱放大 + 左右切换 |
| 章节导航 | 顶部 sticky 锚点导航，滚动高亮当前章节 |
| 移动端 | 自适应缩放 + 双击放大 |
| 图片存放 | `public/tutorial/` |
| 改动范围 | 仅 `(site)/guide/page.tsx` |

### 00 章节内容

| 类别 | 工具名称 | 链接来源 |
|------|----------|----------|
| MOD 工具 | JASM mod 管理器 | 网盘（待提供） |
| MOD 工具 | XXMI 启动器 | 网盘（待提供） |
| MOD 工具 | 鸣潮 mod 修复工具 | 网盘（待提供） |
| 解压缩工具 | 360 压缩 | 官网：https://yasuo.360.cn/ |
| 解压缩工具 | WinRAR | 官网：https://www.win-rar.com/ |
| 解压缩工具 | 7-Zip | 官网：https://www.7-zip.org/ |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| 77 张图首次加载慢 | Medium | High | 懒加载 + 仅加载首屏图片 |
| 图片内文字在移动端太小 | Medium | Medium | 灯箱缩放 + 双击放大 |
| 后续图片更新维护 | Low | Low | 文件名对应章节，public 目录直接替换 |

---

## Dependencies

- 77 张教程截图已就绪（`教程截图/` 目录）
- 00 章节文字内容待用户提供
- 无外部 API 依赖

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
