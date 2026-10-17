# Product Requirements Document: MOD 详情页分享（二维码 + 链接）

**Version**: 1.0
**Date**: 2026-10-17
**Author**: Sarah (Product Owner)
**Quality Score**: 92/100

---

## Executive Summary

用户目前只能通过浏览器地址栏手动复制 `/mods/<id>` 来分享一件外观资源。站内没有分享入口，移动端尤其麻烦：地址栏太长、筛选参数可能被一起带出去、发给好友后对方无从判断内容。

本功能在主站 MOD 详情抽屉的标题栏增加一个「分享」图标，点击后弹出面板，展示**由规范域名生成的二维码**和**可一键复制的短链接**。目标是降低「把一件资源发给朋友」的成本，服务微信群 / QQ 群 / 论坛等现有传播场景。范围刻意收窄：不做海报、不做分站、不做统计，先把核心路径做稳。

---

## Problem Statement

**Current Situation**
- 详情抽屉没有分享入口，用户只能复制浏览器地址栏。
- 从筛选页点开的地址可能带着 `?character=…` 等参数，直接分享会污染链接语义。
- 站内规范域名是 `go.sunnyrose.xyz`，旧域名 `wave-mod.top` / `www.wave-mod.top` 当前返回 410；用户手动复制的域名无法保证可用。

**Proposed Solution**
- 抽屉标题栏加分享按钮 → 弹出分享面板 → 展示二维码 + 规范短链接 + 复制按钮。
- 链接固定为 `https://<规范域名>/mods/<modId>`，不带任何筛选参数。

**Business Impact**
- 降低分享成本，提升站外传播效率（微信群 / QQ 群是当前资源传播主渠道）。
- 统一分享出去的域名口径，避免用户把 410 的旧域名发给别人。

---

## Success Metrics

站内当前没有任何前端埋点，且本次明确不做统计，因此本版本以**可用性与正确性**为验收指标：

**Primary KPIs (本版本)**
- 分享面板可用率 100%：抽屉内可打开、二维码可被微信/系统相机识别、复制按钮成功提示。
- 分享链接正确率 100%：协议、域名、路径均正确，且不含筛选参数。

**Deferred KPIs（接入埋点后补充）**
- 分享面板打开次数、复制链接次数。
- 分享链接落地页访问量（需后续引入 referrer 或 UTM 统计）。

**Validation**
- 上线后人工用微信扫一扫、系统相机扫码各验证一次；复制链接后在无痕窗口打开验证。
- 移动端（375px）与桌面端（≥1024px）各走一遍。

---

## User Personas

### Primary: 资源分享者（访客 / 登录用户）
- **Role**: 在外观资源站浏览、下载并乐于分享的玩家
- **Goals**: 快速把「这件资源」发给群友或朋友
- **Pain Points**: 地址栏链接长；带筛选参数；不确定该发哪个域名
- **Technical Level**: 普通用户，手机为主

### Secondary: 内容创作者
- **Role**: 在群里/论坛发布整合内容的人
- **Goals**: 把单品链接贴进群公告或帖子
- **Pain Points**: 需要可复制的干净链接，二维码便于截图转发

---

## User Stories & Acceptance Criteria

### Story 1: 从详情抽屉分享

**As a** 浏览者
**I want to** 在 MOD 详情抽屉里点分享、看到二维码和链接
**So that** 我能把这件资源发给朋友

**Acceptance Criteria:**
- [ ] 抽屉标题栏（关闭按钮左侧）出现分享图标按钮，带无障碍名称「分享」。
- [ ] 数据加载中或加载失败时按钮不可用（或点击后不出现空二维码）。
- [ ] 点击后弹出分享面板，包含：标题、二维码、完整链接文本、复制按钮。
- [ ] 二维码内容与展示的链接完全一致，均为规范域名 + `/mods/<id>`。
- [ ] 分享链接不含 `?character=` 等筛选参数。
- [ ] 关闭面板后抽屉保持原状态（不重载、不丢失当前 tab）。

### Story 2: 复制链接

**As a** 分享者
**I want to** 一键复制链接
**So that** 我能粘贴到群聊里

**Acceptance Criteria:**
- [ ] 点击「复制链接」成功后出现 toast「链接已复制」。
- [ ] 剪贴板不可用（非安全上下文 / 内嵌 WebView）时降级为 `execCommand`，仍失败则 toast 提示失败。
- [ ] 复制的是带 `https://` 的完整绝对地址。

### Story 3: 扫码打开

**As a** 收到分享的人
**I want to** 扫码直接打开资源页
**So that** 不需要手动输入网址

**Acceptance Criteria:**
- [ ] 二维码为纯黑白、四周留白，可被微信「扫一扫」与系统相机识别。
- [ ] 扫描后落到 `https://go.sunnyrose.xyz/mods/<id>`，页面正常打开对应资源。
- [ ] 二维码在移动端（375px）完整可见，不需要横向滚动。

---

## Functional Requirements

### Core Features

**Feature 1: 分享入口**
- Description: 抽屉固定标题栏内、关闭按钮左侧新增分享图标按钮，沿用现有 neo-brutalist 样式（黑边 + 硬阴影）。
- User flow: 打开任意 MOD 详情 → 点击分享图标 → 分享面板出现。
- Edge cases: 数据未加载完成时禁用；加载失败时禁用。
- Error handling: 无网络不影响面板打开（二维码为本地生成）。

**Feature 2: 分享面板**
- Description: 居中弹层。包含标题「分享这个资源」、MOD 首张预览图（缺图时省略）、二维码、链接文本框、复制按钮、关闭按钮。
- 图片口径：`mod.images[0] ?? mod.coverImage`，复用 `withCosImageTransform(..., COS_IMG_CARD)`（800px 卡片档），不直接拉原图。
- 排列规则：按图片自然方向自适应。**横屏 → 图片在上、二维码在下**；**竖屏 → 图片在左、二维码在右**。
- 尺寸：面板 `max-w-xl`（576px）。二维码桌面 224px（并排窄屏降到 144px）；竖屏预览桌面高 384px（窄屏 224px），横屏预览桌面高 256px（窄屏 192px）。
- 完整显示：`object-contain` 不裁切；预览外框宽度按「高度 × 图片宽高比」计算，**方框紧贴图片，不留左右白边**。
- User flow: 打开后即可扫码或复制；点遮罩/关闭按钮退出。
- Edge cases:
  - 抽屉自身是带 `transform` 的固定定位元素，面板必须通过 portal 挂到 `document.body`，否则会被抽屉的定位块裁剪。
  - 小屏下宽度不超过 `calc(100vw - 2rem)`。
- Error handling: 二维码渲染库加载失败时显示「二维码加载失败，请直接复制链接」并保留复制按钮。

**Feature 3: 链接口径**
- Description: 链接一律为 `${siteUrl}/mods/${encodeURIComponent(modId)}`，其中 `siteUrl` 取自 `src/lib/site-url.ts`（生产为 `https://go.sunnyrose.xyz`）。
- Edge cases: `siteUrl` 末尾多余斜杠要去掉；id 需要 URL 编码。
- Error handling: 若 `NEXT_PUBLIC_SITE_URL` 未配置，退回现有 `getSiteUrl()` 行为（与全站 canonical 保持一致）。

### Out of Scope
- 角色分类页（`/mods?character=…`）的分享。
- 绝区零分站详情页（`/zenless-zone-zero/mods/<id>`）。
- 原生系统分享（`navigator.share`）。
- 分享海报/图片生成。
- 分享次数统计与埋点。
- 复制时自动追加 UTM / referrer 参数。

---

## Technical Constraints

### Performance
- 二维码库不得进入 `/mods` 首屏 bundle：分享面板与其依赖必须动态加载，仅在用户打开面板时下载。
- 二维码在客户端生成，不新增网络请求、不依赖第三方二维码服务。

### Security
- 链接只由站内规范域名 + mod id 拼接，不接收用户输入的自由 URL。
- 二维码内容不包含用户身份、筛选条件或任何隐私数据。

### Integration
- `src/lib/site-url.ts`：复用现有 `getSiteUrl()`，不新起第二套域名口径。
- `src/lib/clipboard.ts`：复用现有 `copyToClipboard`，包含非安全上下文降级。
- `src/components/ui/dialog.tsx`：现有 Dialog 的 Portal 是空实现，且在 transform 祖先下定位会失效；分享面板需自行 `createPortal` 到 `body`。
- 二维码库：新增 `qrcode.react`（客户端渲染 SVG），通过 `next/dynamic` 懒加载。

### Technology Stack
- Next.js 16 App Router + React 19 + TypeScript strict。
- Tailwind CSS + 现有设计 token。
- 浏览器：现代移动端 / 桌面端；不支持 IE。
- 测试：Vitest（纯函数），交互用 headless Chrome + CDP 手工验收（项目无 jsdom）。

---

## MVP Scope & Phasing

### Phase 1: MVP (Required for Initial Launch)
- 抽屉标题栏分享入口。
- 分享面板：二维码 + 完整链接 + 复制按钮 + 关闭。
- 规范域名链接生成（含纯函数单测）。
- 二维码库懒加载。

### Phase 2: Enhancements (Post-Launch)
- 角色分类页分享。
- 绝区零分站详情页分享。
- 原生系统分享按钮（`navigator.share`，移动端）。
- 分享次数埋点与漏斗。

### Future Considerations
- 带角色头像/名称的分享海报。
- 分享链接 UTM 归因。

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 分享面板被抽屉的 transform 定位块裁剪 | High | High | 面板通过 `createPortal` 挂到 `document.body`，并用 `fixed inset-0` 遮罩 |
| 新增二维码库增大 /mods 首屏 JS | Med | Med | `next/dynamic` 懒加载，库只在面板打开时下载 |
| 生产环境 `NEXT_PUBLIC_SITE_URL` 未正确注入，二维码指向 localhost | Low | High | 复用全站 `getSiteUrl()`；上线后用真实扫码验收；部署检查已有 `.env.production` 校验 |
| 二维码在深色/小屏下不易识别 | Low | Med | 白底黑码、固定留白；面板宽度自适应 |
| 二维码库不支持 React 19 | Low | Med | 选用支持 React 19 的 `qrcode.react` 最新版；安装后跑 `npm run build` 验证 |

---

## Dependencies & Blockers

**Dependencies:**
- `qrcode.react`：新增客户端依赖，需执行 `npm install`。
- `.env.production` 中的 `NEXT_PUBLIC_SITE_URL` 必须为 `https://go.sunnyrose.xyz`（已配置）。

**Known Blockers:**
- 无。

---

## Appendix

### Glossary
- **规范域名**: 站内 `getSiteUrl()` 返回的对外域名，当前为 `go.sunnyrose.xyz`。
- **分享链接**: `${siteUrl}/mods/<id>`，不带任何查询参数。
- **详情抽屉**: 主站 `/mods` 与 `/mods/[id]` 上以 Sheet 形式打开的 MOD 详情视图。

### References
- `src/components/features/mods/detail/mod-detail-drawer.tsx`
- `src/lib/site-url.ts`
- `src/lib/clipboard.ts`
- `src/app/(site)/mods/[id]/page.tsx`

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
