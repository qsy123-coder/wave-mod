# Product Requirements Document: 分享面板导出 PNG + 每日更新批量导出

**Version**: 1.0
**Date**: 2026-11-19
**Author**: YG（站主）
**前置 PRD**: `docs/mod-share-qrcode-prd.md`（本功能把它明确列为 Out of Scope 的「分享海报/图片生成」补上）

---

## Executive Summary

分享面板（`share-mod-dialog.tsx`）目前只能「复制链接」，用户要把一件资源发到 QQ 群 / 微信群 / 小红书，只能截图或手动转发链接。本次给它加「导出 PNG」：点一下把当前分享面板原样存成一张图，图里带封面、二维码、链接，直接发图就能完成传播。

同时每日更新页（`/updates`）每天几十条资源，逐条点进详情再导出太慢。本次在每个日期分组标题旁加「批量导出」，一次把当天所有资源的分享面板各存一张 PNG，打包成一个 zip 下载。

两个导出都在**浏览器端完成**：不落库、不上传、不新增服务端渲染依赖，与抽卡页「分享图本地生成」同一承诺。

---

## Problem Statement

**Current Situation**
- 分享面板有「复制链接」，但很多传播场景（群聊发图、朋友圈、动态）需要的是**一张图**而不是一段链接。
- 用户现在只能手动截图，截出来会带上面板外的东西、分辨率不可控、二维码可能被裁切。
- 每日更新页是站主/运营每天都要用「发图」的场景，逐条进详情再截图完全不可行。

**Proposed Solution**
1. 分享面板内新增「导出 PNG」按钮，点击把**当前面板原样**（标题 + 封面 + 二维码 + 提示语 + 链接，不含交互按钮）渲染成 PNG 下载。
2. 每日更新每个日期分组标题右侧新增「批量导出」按钮，点击把当天所有 mod 的分享面板逐张渲染成 PNG，打进一个 zip 下载。

**Business Impact**
- 把「分享一件资源」从「复制链接」升级到「直接发图」，贴合 QQ/微信群这一主传播渠道。
- 每日更新的批量导出直接服务运营发图流程，省掉逐条点进详情的重复劳动。

---

## Success Metrics

本版本仍以**可用性与正确性**为验收口径（站内分享链路无埋点）。

- 单张导出正确率 100%：导出的 PNG 与当前面板视觉一致；二维码在图片里仍可被微信/相机识别；横屏封面、竖屏封面两种版式各验证一次。
- 批量导出正确率 100%：导出的 zip 内含当天全部 N 个 mod 的 N 张 PNG，文件名可区分，无缺张、无错位。
- 失败可感知：封面加载失败 / 画布导出失败时给 toast，不静默。

---

## User Stories & Acceptance Criteria

### Story 1: 从分享面板导出单张 PNG

**As a** 分享者
**I want to** 在分享面板里点「导出 PNG」存一张图
**So that** 我直接发图就能把这件资源传播出去

**Acceptance Criteria:**
- [ ] 分享面板底部「复制链接」按钮旁新增「导出 PNG」按钮（同尺寸/同视觉语言）。
- [ ] 导出图内容 = 当前面板去掉交互按钮（关闭 ×、复制链接、导出 PNG 本身）后的全部内容：标题、MOD 副标题、封面、二维码、提示语「微信扫一扫」、链接文本。
- [ ] 导出图版式跟随当前面板自适应：横屏封面 = 图上码下；竖屏封面 = 图左码右。**不强制竖版**。
- [ ] 二维码在导出图里仍是纯黑白、可被扫码识别，内容 = 规范链接。
- [ ] 导出中按钮置灰/显示进行态；成功 toast「分享图已保存」；失败 toast 错误原因，不崩面板。
- [ ] 导出的 PNG 文件名形如 `<标题或角色>-<id 前段>.png`，Windows 非法字符已替换。

### Story 2: 每日更新批量导出当天分享图

**As a** 站主/运营
**I want to** 在每日更新某个日期旁一键导出当天所有分享图
**So that** 我一次拿到当天全部资源的分享图，直接发群

**Acceptance Criteria:**
- [ ] 每个日期分组标题行（`+N` 徽章旁）新增「批量导出」按钮；当天 `mods.length === 0` 的分组不显示。
- [ ] 点击后逐张生成当天全部 mod 的分享面板 PNG（复用 Story 1 的同一渲染口径），进度可感知（按钮显示 `导出中 i/N`）。
- [ ] 全部完成后触发单个 zip 下载，文件名 `每日更新-<YYYY.M.D>.zip`，内含 N 张 PNG。
- [ ] 单张失败（封面跨域/超时）跳过并继续；结束后 toast「已导出 N 张，失败 M 张」。
- [ ] 生成期间再次点击不重复触发（按钮禁用）。

---

## Functional Requirements

### Feature 1: 分享面板「导出 PNG」按钮

- **入口**：`ShareModDialog` 底部「复制链接」按钮旁。
- **导出方式**：DOM 截图。用 `html-to-image` 的 `toPng` 对面板卡片节点截图，`pixelRatio=2` 保证清晰度，`backgroundColor="#fff8ef"` 保留奶油底色。
- **隐藏交互按钮**：卡片上给关闭 ×、复制链接、导出 PNG 三个按钮打 `data-export-exclude` 标记，截图前临时 `visibility:hidden`，截图后恢复。这样导出图 = 面板内容，不含按钮，但仍保留卡片外框/阴影/内边距。
- **为何不用 canvas 重绘**：面板版式是随封面方向自适应的（图左码右 / 图上码下），用户明确「分享面板不一定是竖版」。canvas 重绘要手工复刻这套自适应布局 + 硬阴影 + 字体，且必然和面板有细微出入；DOM 截图天然做到「一模一样」，改动最小。
- **依赖加载**：`html-to-image` 与 `qrcode.react` 一样走 `next/dynamic` 懒加载，只在使用时下载，不进 `/mods` 首屏 bundle（沿用 `mod-share-qrcode-prd.md` 的性能约束）。

### Feature 2: 每日更新「批量导出」

- **入口**：`updates-grid.tsx` 每个 `day` 分组标题行，`+N` 徽章右侧。
- **数据来源**：`day.mods: SiteMod[]` 已作为 client props 传入，含 `id` / `title` / `images` / `coverImage`。分享链接用 `buildModShareUrl(getSiteUrl(), mod.id)` 客户端现拼（`getSiteUrl` 读 `NEXT_PUBLIC_SITE_URL`，客户端可用）。
- **逐张生成**：复用同一套「分享卡片内容」渲染（见下方 Integration），在离屏隐藏容器里一次渲染一张 → 等封面 `load`/`decode` 与二维码挂载完成 → `toPng` 截图 → 存进 `jszip` → 下一张。
- **打包**：`jszip` 动态导入，全部成功后 `generateAsync({ type: "blob" })` → 单个 zip 下载。文件名用 `每日更新-<day.date 转 YYYY.M.D>.zip`；zip 内每张 `sanitizeFileName(`${character}-${title}`)` + `.png`，重名追加序号。
- **进度与失败**：按钮进入导出态显示 `导出中 i/N`；单张失败跳过计数；结束 toast 汇总。

### Out of Scope
- 服务端生成（不引入 node-canvas / puppeteer 等重依赖）。
- 角色分类页（`/mods?character=…`）与绝区零分站的导出。
- 导出图里带统计/埋点/水印。
- 「拼成一张长图」「逐张自动下载」等其他批量形态（本次已明确选 zip）。
- 自定义导出尺寸/背景色。

---

## 数据与接口变更

- **数据库**：无变更。不读写任何表，不影响 `character|title` 去重键，不新增 character 值。
- **新增依赖**（均动态加载，不进首屏 bundle）：
  - `html-to-image`：DOM → PNG。
  - `jszip`：批量打包。
- **复用**：
  - `src/lib/mod-share.ts` 的 `buildModShareUrl`（单张与批量同口径）。
  - `src/lib/site-url.ts` 的 `getSiteUrl`。
  - `src/lib/cos/shared.ts` 的 `withCosImageTransform` + `COS_IMG_CARD`（封面按 800px 卡片档取，不拉原图）。

---

## 技术方案与取舍

| 方案 | 结论 | 理由 |
|---|---|---|
| DOM 截图（`html-to-image`） | ✅ 采用 | 面板自适应版式，天然「一模一样」；改动最小 |
| canvas 重绘（复用抽卡 `share-card.ts`） | ❌ 不采用 | 需手工复刻自适应布局 + 硬阴影，且和面板有出入；用户否定固定竖版 |
| 服务端生成 | ❌ 不采用 | 重依赖、跨域/字体/COS 拉图链路复杂，收益低 |
| 批量 zip | ✅ 采用 | 一次拿全，贴合「所有分享面板图片」；`jszip` 轻量、可动态加载 |

**单张与批量共用渲染**：把分享面板的「卡片内容」（标题 + 封面 + 二维码 + 提示语 + 链接）抽成可复用的展示组件 `ShareModCard`（`forwardRef` 暴露卡片 DOM 节点）。`ShareModDialog` 包一层 overlay/关闭/复制/导出按钮；批量导出在离屏容器里逐张渲染同一个 `ShareModCard`。避免两套视觉分叉。

---

## 边界与异常

| 场景 | 处理 |
|---|---|
| 封面图加载失败 / 跨域被拒 | 单张：toast「生成失败」；批量：该张跳过并计数，其余继续 |
| 二维码库 chunk 加载失败 | 沿用现有 `QrErrorBoundary`，导出图降级为「无二维码」或整张失败并提示 |
| 无封面图（`images[0]` 与 `coverImage` 都空） | 卡片省略封面，只导出二维码 + 链接（与面板一致） |
| 当天 mod 很多（>20） | 逐张生成，按钮显示进度；`jszip` 内存可控（每张约 1–2MB） |
| 移动端下载 | 单张 PNG 正常；zip 在 iOS Safari 可能直接预览而非保存，记已知限制 |
| `html-to-image` 对 `next/image` 输出 | 面板封面已按 COS 直链/同源代理加载；截图时由库重新内联，COS 已配 CORS |
| 文件名含 Windows 非法字符（`/ : * ? " < > |`） | `sanitizeFileName` 纯函数替换为全角/下划线，配单测 |

---

## 验收标准（可勾选清单）

- [ ] 分享面板出现「导出 PNG」按钮，点击下载一张 PNG。
- [ ] 导出图与面板视觉一致（横屏、竖屏封面各验一次），二维码可扫码打开规范链接。
- [ ] 每日更新每个有内容的日期分组标题旁出现「批量导出」。
- [ ] 批量导出得到 `每日更新-YYYY.M.D.zip`，解压后 PNG 数 = 当天 mod 数，无错位。
- [ ] 单张失败不中断批量，结束 toast 汇总成功/失败数。
- [ ] `npm run lint` + `npx tsc --noEmit` + `npm run build` 全绿。
- [ ] `/mods` 与 `/updates` 首屏 bundle 不因新依赖变大（依赖懒加载）。

---

## 测试计划

- **纯函数单测（Vitest）**：`sanitizeFileName`（非法字符替换、重名序号）、批量文件名拼装。项目无 jsdom，组件交互不上单测。
- **组件/交互验收（CDP 手工）**：
  - 打开详情抽屉 → 分享 → 导出 PNG，落盘文件可打开、二维码可扫。
  - 横屏封面 mod 与竖屏封面 mod 各导出一次，核对版式。
  - `/updates` 某日期批量导出，核对 zip 内 PNG 数量与当天 mod 数一致。
- **回归**：确认原有「复制链接」、Esc 关闭、焦点循环、二维码懒加载均不受影响。

---

## 分期

- **Phase 1（本次）**：单张「导出 PNG」+ 每日更新批量 zip。共用 `ShareModCard` 抽取。
- **Phase 2（后续，可选）**：角色分类页导出；导出图加水印/作者署名；`navigator.share` 直接分享图片。

---

## 风险评估

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `html-to-image` 内联 SVG/图片在个别浏览器失败 | Med | Med | 包 try/catch，失败 toast；二维码走现有 ErrorBoundary |
| 新依赖进首屏 bundle | Low | Med | 与 `qrcode.react` 一样 `next/dynamic` 懒加载 |
| 批量生成耗时长（图多） | Med | Low | 进度显示 + 逐张生成；单张超时跳过 |
| iOS 下载 zip 不落盘 | Med | Low | 已知限制，文档标注；桌面端不受影响 |

---

## Dependencies & Blockers

- 新增依赖 `html-to-image`、`jszip`（需 `npm install`，走代理）。
- 无已知 blocker。COS CORS 已配置（抽卡分享图已在用同一跨域加载口径）。
