# Product Requirements Document: 问题解答页面

**Version**: 1.0
**Date**: 2026-08-10
**Author**: Sarah (Product Owner)
**Quality Score**: 93/100

---

## Executive Summary

为 WaveMod 站点新增"问题解答"独立页面，承载《鸣潮 Mod 问题解答》文档的全部内容（35 个 Q&A，分为 6 大分类）。页面采用侧边目录 + 折叠手风琴布局，使用分割线而非卡片划定区域，保持 Neo-brutalism 风格但简洁克制。

同时在导航栏添加"问题解答"入口，在教程页（/guide "先看我"）添加引导提示，形成「教程 → 问题解答」的用户帮助闭环。

内容更新频率低，采用 Markdown 文件（`content/troubleshooting/`）+ COS 图片托管存储，用 `react-markdown` 渲染。无需数据库，编辑时直接改 .md 文件即可。

---

## Problem Statement

**Current Situation**：用户在使用 Mod 过程中遇到安装失败、闪退、贴图错误等问题时，只能通过 QQ 群或 B 站频道求助，没有站内自助排查渠道。"先看我"教程页只覆盖安装流程，不涉及故障排查。

**Proposed Solution**：新建 `/troubleshooting` 页面，将可可 HXL 编写的《鸣潮 Mod 问题解答 v2.2.4》文档结构化呈现，提供分类导航和折叠式问答，让用户快速定位问题并获取解决方案。

**Business Impact**：
- 减少 QQ 群/B 站频道的重复性问题咨询
- 提升用户在站内的停留时间和满意度
- 形成"教程 → 问题解答"的完整体验闭环

---

## Success Metrics

**Primary KPIs:**
- **页面访问量**：上线后首月 > 500 PV（通过 Vercel Analytics 或类似工具统计）
- **教程页 → 问题解答跳转率**：/guide 页的提示链接点击率 > 10%
- **用户反馈**：QQ 群内重复性问题咨询量减少

**Validation**：上线 1 个月后对比 Analytics 数据与人工观察

---

## User Personas

### Primary: 鸣潮 Mod 使用者（遇到问题的玩家）
- **Role**：鸣潮玩家，正在使用或尝试安装 Mod
- **Goals**：快速找到当前问题的解决方法，自助排查
- **Pain Points**：不知道去哪儿求助、QQ 群消息太多找不到答案、视频教程太慢
- **Technical Level**：初级~中级（大部分不懂技术，需要步骤截图和详细说明）

### Secondary: 教程页浏览者（想预防问题）
- **Role**：正在阅读"先看我"教程的新用户
- **Goals**：了解如果出问题该怎么办
- **Pain Points**：刚装完 Mod 不知道出问题找谁
- **Technical Level**：初级

---

## User Stories & Acceptance Criteria

### Story 1: 浏览问题分类找到答案

**As a** 遇到 Mod 问题的玩家
**I want to** 在问题解答页面按分类浏览常见问题
**So that** 我能快速找到当前问题的解决方法

**Acceptance Criteria:**
- [ ] 页面加载后显示完整的 6 大分类目录，当前阅读位置高亮
- [ ] 点击侧边目录中的分类，页面平滑滚动到该分类
- [ ] 每个分类下的 Q&A 条目默认折叠，点击展开查看解决方法
- [ ] 展开一个 Q&A 不会自动折叠其他已展开的条目
- [ ] 桌面端侧边目录粘性固定（sticky），移动端目录收起至顶部

### Story 2: 从教程页导航到问题解答

**As a** 正在阅读教程的用户
**I want to** 在教程页看到问题解答的引导提示
**So that** 我知道遇到问题时有地方可以求助

**Acceptance Criteria:**
- [ ] /guide 页标题区域新增提示文案，告知用户"遇到问题请查看问题解答"
- [ ] 提示文案包含指向 /troubleshooting 的可点击链接
- [ ] 提示样式与页面已有 Neo-brutalism 风格一致

### Story 3: 从导航栏进入问题解答

**As a** 任何站点访客
**I want to** 在导航栏看到"问题解答"入口
**So that** 我可以随时访问该页面

**Acceptance Criteria:**
- [ ] 桌面端导航栏 primaryNav 区域新增"问题解答"链接
- [ ] 移动端侧滑菜单同步新增"问题解答"入口
- [ ] 当前页面为问题解答时，导航链接有 active 状态标识

---

## Functional Requirements

### Core Features

**Feature 1: Markdown 内容文件（`content/troubleshooting/`）**
- Description：6 个 `.md` 文件，每个文件对应一个分类，存放该分类下的全部 Q&A
- 目录结构：
  ```
  content/troubleshooting/
  ├── 01-installation.md       ← 安装与更新（Q1-Q4）
  ├── 02-crashes.md            ← 启动与闪退（Q5-Q10）
  ├── 03-models.md             ← 模型与贴图（Q11-Q19）
  ├── 04-loading.md            ← Mod 加载与生效（Q20-Q24）
  ├── 05-management.md         ← Mod 管理与配置（Q25-Q32）
  └── 06-performance.md        ← 性能与其他（Q33-Q35）+ 附录
  ```
- Markdown 格式约定：
  - `## Q1 · 问题标题` 作为每个 Q&A 的标记
  - 答案内容使用标准 Markdown 语法（段落、列表、粗体）
  - 图片引用 COS URL：`![描述](https://cos.../xxx.png)`
  - 外部链接用标准 `[文字](url)` 格式
- 57 张截图从 docx 导出后上传至 COS（路径：`troubleshooting/{filename}`），在 md 中引用 COS URL
- 页面对应的分类元信息（中文名、排序）在 `troubleshooting-config.ts` 中维护，md 文件名作为 key 关联
- 编辑流程：改 .md → 提交推送 → Vercel 自动部署

**Feature 2: 问题解答页面（`/troubleshooting`）**
- Description：Server Component 读取静态配置渲染页面
- User flow：
  1. 页面加载 → 显示标题 + 侧边目录（桌面端）/ 顶部下拉目录（移动端）
  2. 用户滚动页面 → 目录中当前分类高亮
  3. 用户点击目录项 → 平滑滚动到对应分类
  4. 用户点击 Q&A 条目 → 展开/折叠
  5. 用户点击外部链接 → 新标签页打开
- Edge cases:
  - 直接访问带 hash 的 URL（如 `/troubleshooting#q5`）→ 自动展开对应 Q&A 并滚动
  - 内容较长时的滚动性能 → 使用 CSS `scroll-behavior: smooth`
- Error handling：静态配置解析失败 → 构建时报错（Zod parse），页面不渲染错误状态

**Feature 3: 导航栏集成**
- Description：在 `site.ts` primaryNav 和 `site-header-client.tsx` 中添加"问题解答"入口
- 同样遵循 Neo-brutalism 导航按钮风格
- 移动端菜单同步添加

**Feature 4: 教程页引导提示**
- Description：在 /guide 页标题区域添加引导文案
- 位置：放在 VideoHintBanner 旁边或下方
- 文案："遇到无法解决的问题？"
- 链接文字："查看问题解答 →"
- 样式：Neo-brutalism 风格按钮/标签

**Feature 5: 布局设计**
- 桌面端（≥1024px）：
  - 左侧 240px 粘性目录（sticky top-24），6 个分类名 + 当前高亮
  - 右侧主内容区，分类标题 + 分割线 + Q&A 折叠列表
- 移动端（<1024px）：
  - 顶部粘性目录条（横向可滚动 / 下拉选择）
  - 主内容区全宽，同上

### Out of Scope
- 搜索功能（内容仅 35 条，分类导航 + 浏览器 Ctrl+F 已足够）
- 后台编辑功能（内容更新频率低，修改配置文件 + 重新部署即可）
- 国际化/多语言
- 用户反馈/评论功能

---

## Technical Constraints

### Performance
- 静态页面生成（SSG），首屏加载 < 1s
- 无客户端数据请求
- 折叠/展开动画使用 CSS transition，不引入额外 JS 库

### Technology Stack
- Next.js 16 App Router（Server Component 优先）
- TypeScript + Zod（配置校验）
- Tailwind CSS v4（样式，复用 CSS 自定义属性 `--neo-*`）
- `react-markdown` + `remark-gfm`（Markdown 渲染）
- `framer-motion`（折叠动画，项目已有）
- `lucide-react`（图标，项目已有）
- **新增依赖**：`react-markdown`, `remark-gfm`

### Integration
- **导航系统**：修改 `src/lib/constants/site.ts`（primaryNav）+ `site-header-client.tsx`（移动端菜单）
- **教程页**：修改 `src/app/(site)/guide/page.tsx`
- **路由**：新增 `src/app/(site)/troubleshooting/page.tsx`

### Compatibility
- 现代浏览器（Chrome / Firefox / Edge / Safari 最近 2 个大版本）
- 移动端响应式（≥320px 宽度）

---

## MVP Scope & Phasing

### Phase 1: MVP（本次交付）
- [x] 6 个 Markdown 内容文件（从 docx 提取文本 + 导出图片上传 COS）
- [x] `troubleshooting-config.ts` — 分类元信息配置（名称、排序、md 文件映射）
- [x] `/troubleshooting` 页面 — 侧边目录 + 折叠手风琴 + 分割线布局
- [x] Markdown 渲染（react-markdown），外部链接新标签打开
- [x] 导航栏新增"问题解答"入口（桌面 + 移动）
- [x] /guide 页添加引导提示

**MVP Definition**：用户可以访问问题解答页面，通过目录导航找到问题分类，展开查看带图片的解决方法，从导航栏和教程页均可进入。

### Phase 2: 增强（后续考虑）
- 直接链接到具体 Q&A（URL hash 自动展开）
- 滚动时目录自动高亮当前分类（Intersection Observer）
- 内容版本号和更新日期显示

### Future Considerations
- 多语言版本
- 打印友好样式
- 集成到管理后台（动态编辑 + COS 存储）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 文档内容过时 | Med | Med | 配置文件易于修改，作者更新文档后仅需更新 config.ts + 重新部署 |
| 长内容移动端体验差 | Low | Low | 折叠手风琴减少滚动量，目录条提供快速跳转 |
| 外部链接失效 | Low | Med | 链接集中管理在配置文件的 links 数组中，易于检查和更新 |

---

## Dependencies & Blockers

**Dependencies:**
- 无外部依赖。内容已从 docx 提取完毕

**Known Blockers:**
- 无

---

## Appendix

### 内容结构

```
一、安装与更新 (Q1-Q4)
   Q1 · 有弹窗显示软件包下载失败？
   Q2 · 解压不了？或者怎么批量解压？
   Q3 · 安装 XXMI 时弹出"缺少 C++"的弹窗？
   Q4 · 安装 XXMI 时出现安装失败的弹窗？

二、启动与闪退 (Q5-Q10)
   Q5 · 点击启动进入游戏直接闪退，或 XXMI 弹窗加载失败？
   Q6 · 游戏闪退并出现弹窗显示 UE4 崩溃？
   Q7 · 游戏出现多开弹窗，强制退出后重新进入还是这样？
   Q8 · 进入游戏时弹出 ACE 安全中心弹窗？
   Q9 · 游戏内出现弹窗显示"参数获取异常"？
   Q10 · XXMI 一直显示"正在等待 Client-Win64-shipping.exe 启动..."？

三、模型与贴图 (Q11-Q19)
   Q11 · 角色模型贴图错误？
   Q12 · 全部角色脸部撕裂模糊错误？
   Q13 · 角色模型变成不规则几何体、有倒刺、疯狂闪屏或抽搐？
   Q14 · 武器类 Mod 贴图错误？
   Q15 · 尤诺 Mod 头皮会秃？
   Q16 · 科考摩托 Mod 贴图错误或不生效？
   Q17 · 游戏界面出现角色或怪物剪影？
   Q18 · 角色模型扭曲怎么办？
   Q19 · 仇远的 Mod 贴图错误？

四、Mod 加载与生效 (Q20-Q24)
   Q20 · 反虚化 + 发光前置 Mod 不生效？
   Q21 · 打了角色 Mod，剧情或实机里面不生效？
   Q22 · Mod 完全不生效（非贴图错误）？
   Q23 · 切换键不生效？
   Q24 · 游戏内所有 Mod 的控制面板都打不开？

五、Mod 管理与配置 (Q25-Q32)
   Q25 · 怎么修改 Mod 的切换键？
   Q26 · 怎么修改或保存可切换类 Mod 的初始形态？
   Q27 · 怎么在游戏内切换 Mod？
   Q28 · JASM 管理器怎么在角色分区勾选多个 Mod？
   Q29 · 怎么在游戏内快速取消启用所有 Mod？
   Q30 · 游戏内出现写满英文的黑色弹窗怎么关闭？
   Q31 · JASM 管理器设置的路径错了怎么修改？
   Q32 · JASM 管理器怎么添加新角色的分区？

六、性能与其他 (Q33-Q35)
   Q33 · 冲刺时有倒刺拖影？
   Q34 · 装了 Mod 掉帧卡顿怎么办？
   Q35 · 游戏内左上角有红字报错怎么办？

附录 · 关于本文档 / 联系方式
```

### References
- 源文档：`鸣潮mod问题解答v2.2.4-专业版.docx`（可可 HXL 编写）
- 参考实现：`src/features/tutorial/config.ts`（静态配置模式）
- 参考页面：`src/app/(site)/guide/page.tsx`（教程页结构）

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
