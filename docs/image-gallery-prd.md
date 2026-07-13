# Product Requirements Document: 独立图库页面 (Image Gallery)

**Version**: 1.0
**Date**: 2026-07-13
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

为 WaveMod 站点新增一个独立的 **`/gallery` 图库页面**，完整复刻 [chenglou.me](https://chenglou.me)（GitHub: [chenglou/chenglou.github.io](https://github.com/chenglou/chenglou.github.io)）的交互体验。该图库与现有 Mod 业务完全解耦，专注于展示用户本地收藏的精美图片（100+ 张，混合比例）。

MVP 阶段使用 React + Framer Motion + Tailwind CSS 重写参考项目的全部核心交互：网格/行视图切换、面积自适应布局、弹簧物理动画、虚拟化渲染（occlusion culling）、每图独立 URL 路由、键盘+鼠标完整导航。图片通过 JSON 配置文件管理，存放于 `public/` 目录。后续迭代将加入用户上传功能和 Supabase Storage 存储。

---

## Problem Statement

**当前状况**：WaveMod 站点仅有 Mod 详情页的简单截图展示区（5 张缩略图直接链接原图），缺乏一个独立的、体验优秀的图片浏览功能。

**解决方案**：新增 `/gallery` 独立图库页面，提供专业级的图片浏览体验——双视图切换、流畅动画、高性能虚拟化渲染、可分享的图片链接。

**业务价值**：提升站点内容丰富度，为用户提供沉浸式图片浏览体验，增加站点停留时间和回访率。图库作为独立模块可复用至更多场景。

---

## Success Metrics

**主要 KPI：**
- **图库页面 PV**：上线后首月目标 500+ PV
- **浏览深度**：用户平均浏览图片数 ≥ 30 张/次
- **分享率**：图片独立链接被分享/访问的次数
- **性能**：Lighthouse Performance 评分 ≥ 90（100+ 图片场景下）

**验证方式**：上线后通过 Vercel Analytics 和 Supabase 埋点统计。

---

## User Personas

### Primary：图片浏览者

- **角色**：任何访问站点的用户
- **目标**：浏览精美图片、沉浸式观看、分享喜欢的图片给朋友
- **痛点**：现有的截图区简陋、无法全屏浏览、无法快速切换图片
- **技术水平**：Any（所有用户）

---

## User Stories & Acceptance Criteria

### Story 1：网格浏览图片

**As a** 图片浏览者
**I want to** 在网格视图中浏览所有图片缩略图
**So that** 我可以快速概览图库内容并找到感兴趣的图片

**Acceptance Criteria:**
- [ ] 默认以网格视图展示所有图片
- [ ] 图片尺寸根据视觉面积自适应调整（方形图缩小、宽图放大），视觉上大小均衡
- [ ] 只渲染视口内的图片（occlusion culling），100+ 图片不卡顿
- [ ] 渐进式加载：先显示低分辨率占位，再加载高清原图
- [ ] 响应式布局，支持桌面和移动端

### Story 2：行视图切换

**As a** 图片浏览者
**I want to** 切换到水平行视图逐张浏览图片
**So that** 我可以更专注地查看每张图片的细节

**Acceptance Criteria:**
- [ ] 提供网格/行视图切换按钮
- [ ] 行视图下图片水平排列，当前图片居中高亮
- [ ] 前后图片有模糊 + 亮度降低效果，聚焦中心图片
- [ ] 支持鼠标滚轮横向滚动或拖拽
- [ ] 行视图 ↔ 网格视图切换有平滑过渡动画

### Story 3：图片详情灯箱

**As a** 图片浏览者
**I want to** 点击图片查看放大版本
**So that** 我可以看到图片的高清细节

**Acceptance Criteria:**
- [ ] 点击图片全屏/灯箱展示
- [ ] 支持左右键切换上一张/下一张
- [ ] 支持 ESC 关闭灯箱
- [ ] 左右点击区域延伸至窗口边缘（thin image 也能轻松点击）
- [ ] 点击区域不随图片过渡动画移动（防止误操作）

### Story 4：分享链接

**As a** 图片浏览者
**I want to** 每张图片有独立 URL
**So that** 我可以复制链接分享给朋友

**Acceptance Criteria:**
- [ ] 每张图片有唯一 URL（如 `/gallery?image=3` 或 `/gallery/3`）
- [ ] 打开 URL 直接定位到对应图片的灯箱/行视图
- [ ] 浏览器前进/后退正常切换图片
- [ ] 分享链接的 OG 元数据包含对应图片预览

### Story 5：键盘与手势导航

**As a** 高级用户
**I want to** 使用键盘和手势快速导航
**So that** 我可以高效浏览大量图片

**Acceptance Criteria:**
- [ ] 左右箭头：切换图片
- [ ] ESC：关闭灯箱/返回网格
- [ ] 行视图下鼠标悬停图片有磁吸跟随效果
- [ ] 移动端支持左右滑动手势
- [ ] 多输入并发（键盘+鼠标同时操作）正确处理
- [ ] 提供 reduced-motion 选项

---

## Functional Requirements

### Core Features

**Feature 1：网格视图 (Grid View)**
- 描述：默认展示模式，自适应网格排列所有图片
- 用户流程：进入 `/gallery` → 看到图片网格 → 滚动浏览 → 点击图片进入详情
- 边缘情况：窗口 resize 时保持用户当前浏览位置不丢失；首尾行有橡皮筋边界效果
- 错误处理：图片加载失败显示占位图 + 重试按钮

**Feature 2：行视图 (Line/Row View)**
- 描述：水平排列、单行浏览模式，中心图片高亮
- 用户流程：点击切换按钮 → 图片变为水平排列 → 滚轮/拖拽浏览 → 点击图片全屏查看
- 边缘情况：首尾图片滚到边界有橡皮筋效果；快速连续点击不会误触
- 错误处理：图片加载失败时该位置保持占位

**Feature 3：全屏灯箱 (Lightbox)**
- 描述：点击图片全屏查看，支持键盘/鼠标导航
- 用户流程：点击图片 → 灯箱展开 → 左右键/点击边缘切换 → ESC 或点击空白区关闭
- 边缘情况：灯箱内切换图片更新 URL 不刷新页面；快速连按左右键不跳图
- 错误处理：图片加载失败显示重试提示

**Feature 4：图片路由 (Per-Image URL)**
- 描述：每张图片对应独立 URL，可分享、可书签
- 用户流程：浏览到某张图 → URL 自动更新 → 复制 URL 分享 → 其他人打开直接定位
- 边缘情况：无效图片 ID 回退到图库首页；并发路由切换正确处理
- 错误处理：404 图片 ID 显示友好提示

**Feature 5：JSON 配置管理 (MVP)**
- 描述：通过 JSON 文件管理图片列表
- 用户流程：管理员编辑 `data/gallery-images.json` → 添加图片路径 → 部署生效
- 边缘情况：重复路径去重；配置格式校验
- 错误处理：JSON 解析失败显示错误提示 + 降级空列表

### Out of Scope (MVP)
- 用户上传图片功能（Phase 2）
- Supabase 数据库存储（Phase 2）
- 图片审核/管理后台
- 按标签/分类筛选
- 图片排序方式切换
- 自动播放幻灯片模式
- 用户评论/点赞

---

## Technical Constraints

### Performance
- **虚拟化渲染**：仅渲染视口内可见图片（occlusion culling），DOM 节点数硬上限
- **帧率解耦动画**：动画不依赖稳定帧率，120Hz 高刷屏和掉帧场景均流畅
- **电量友好**：避免触发 Safari 标签页能耗警告
- **渐近加载**：先加载低清缩略图，再异步加载全分辨率图
- **Lighthouse ≥ 90**

### Security
- MVP 阶段：静态图片 + JSON 配置，无安全风险
- Phase 2 用户上传：需文件类型校验、大小限制、XSS/CSRF 防护

### Integration
- **路由**：Next.js App Router，`/gallery` 路由页
- **样式**：Tailwind CSS v4 + 参考项目核心 CSS（内联背景噪声、圆角阴影等）
- **动画**：Framer Motion（spring physics）
- **状态管理**：URL search params + React state（无需 Zustand）
- **图片存储**：`public/gallery/` 目录
- **配置文件**：`data/gallery-images.json`

### Technology Stack
- React 19 + Next.js 16 (App Router)
- TypeScript (strict mode)
- Tailwind CSS v4
- Framer Motion 12
- shadcn/ui（仅按钮/图标等基础组件）
- 零额外依赖（不引入第三方图库库）

---

## MVP Scope & Phasing

### Phase 1：MVP（静态图库）
- [ ] 网格视图 + 面积自适应布局
- [ ] 行视图 + 水平滚动 + 居中高亮
- [ ] 全屏灯箱 + 键盘/鼠标导航
- [ ] 每图独立 URL 路由
- [ ] 虚拟化渲染（100+ 图片不卡顿）
- [ ] 弹簧物理动画（视图切换、灯箱进出）
- [ ] JSON 配置文件管理图片
- [ ] 渐进式图片加载
- [ ] 响应式适配（桌面 + 移动端）
- [ ] 浏览器前进后退支持

**MVP 定义**：完整复刻 chenglou.me 核心交互，100+ 图片流畅浏览。

### Phase 2：增强（用户上传）
- [ ] 用户上传图片功能
- [ ] Supabase Storage 存储
- [ ] 上传队列 + 进度展示
- [ ] 管理员审核机制
- [ ] 图片标签/分类

### Future Considerations
- [ ] AI prompt 展示（如参考项目）
- [ ] 图片排序（最新/最热/随机）
- [ ] 瀑布流/砖石布局选项
- [ ] 暗色/亮色主题切换
- [ ] 播放列表/自动播放
- [ ] 多游戏多图库支持

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| 参考项目交互逻辑复杂，React 重写工作量大 | 中 | 高 | 分模组分阶段实现，优先核心交互（网格+灯箱），行视图可稍后 |
| 100+ 图片首屏加载性能 | 低 | 高 | 虚拟化渲染 + 缩略图预生成 + 懒加载 |
| Framer Motion 弹簧动画性能 | 中 | 中 | 大量图片场景下对非可视图片禁用动画；使用 `layoutId` 优化 |
| 移动端体验差异 | 中 | 中 | 移动端优先用网格 + 灯箱，行视图移动端可选实现 |
| 参考项目开源协议 | 低 | 低 | MIT 协议，安全可用；代码为 React 重写非直接复制 |

---

## Dependencies & Blockers

**Dependencies:**
- Framer Motion 12（已在项目中，版本无需升级）
- Tailwind CSS v4（已在项目中）
- Next.js 16（已在项目中）
- 100+ 张图片素材准备（需用户提供）

**Known Blockers:**
- 无技术阻塞项。所有依赖已就位。

---

## Appendix

### 参考项目核心架构（简化的游戏引擎循环）

```
1. 初始化（一次性）：状态声明 → 静态 DOM 分块 → 事件注册（委托）
2. 渲染循环：
   a. 批量 DOM 读取
   b. 按序处理状态：输入 → 布局/光标计算 → 动画 tick → 提交状态变更
   c. 执行遮挡剔除 + 批量 DOM 写入
   d. 动画进行中则调度下一帧渲染
```

React 重写时保留核心理念：状态集中管理、批量 DOM 操作、帧内同步渲染。

### Glossary

- **Occlusion Culling（遮挡剔除）**：只渲染视口内可见的 DOM 节点，非可见图片不挂载 DOM
- **面积自适应布局**：根据图片视觉面积（而非宽度）调整展示尺寸，使不同比例的图片看起来大小均衡
- **Spring Physics（弹簧物理）**：基于物理模拟的动画曲线，非固定的 ease-in-out，更自然
- **Line View（行视图）**：图片水平单行排列的浏览模式

### References

- 参考项目 GitHub：[chenglou/chenglou.github.io](https://github.com/chenglou/chenglou.github.io)
- 参考项目在线：[chenglou.me](https://chenglou.me)
- 视频演示：[YouTube demo](https://youtu.be/OwzPOJnj2Vw)
- 项目视觉风格参考：`src/features/games/zenless-zone-zero/` 下的 ZZZ 风格组件

---

*本 PRD 通过交互式需求收集流程生成，质量评分 91/100，涵盖业务、功能、UX 和技术四个维度。*
