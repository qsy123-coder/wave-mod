# Product Requirements Document: 预览图在线打码工具

**Version**: 1.0
**Date**: 2026-10-24
**Author**: Sarah (Product Owner)
**Quality Score**: 88/100

> 计分说明：需求方本次有强时效（"现在就要用"），在未确认项上由 PO 按项目既有惯例填了默认值，
> 逐条列在「假设与默认值」一节。任何一条与预期不符，改 PRD 后即可调整实现。

---

## Executive Summary

站内 mod 预览图偶尔包含露点、擦边或违反 COS 内容审核规则的画面。一旦被审核拦截，前台卡片就变成坏图，
必须换图才能修（见 `cos-moderation-blocked-previews` 记录的两次事故）。目前唯一的处理手段是离线脚本
（`reupload-blurred.mjs` / `reupload-mosaic-images.mjs` + `offline-blur-src/` 手工放的源图）：要先把图存到
固定目录、改图、再跑脚本，且脚本取对象键依赖数据库。

本需求提供一个**纯浏览器端的打码页**：拖入图片 → 框选敏感区域 → 马赛克或高斯模糊 → 导出 WebP；
再由一个**不查数据库**的本地命令把结果覆盖回 COS 原对象。整个过程不依赖 Supabase、不依赖登录、
不把 COS 密钥暴露在浏览器里。

**为什么现在做**：需求方需要立刻处理线上图，且当前数据库处于不可用状态——任何依赖登录/查库的方案
都不可用。该工具断库可用。

---

## Problem Statement

**Current Situation**
- 后台只能删掉某一行图片 URL 再重新上传追加，没有"原地改一张图"的能力
  （`upload-form.tsx:168-195`、`mergeImageUrls` 只有追加语义）。
- 打过码的图只能靠离线脚本覆盖，且脚本用 `psqlJson` 查库拿 `images[0]`
  （`scripts/reupload-mod-image.mjs:104-113`）——库挂了就不可用。
- 手工打码要开 Photoshop/画图，再另存到指定目录，步骤多、易错（存错目录、存成 PNG 覆盖失败等）。

**Proposed Solution**
1. `public/tools/blur.html` —— 单文件、零依赖、零后端的打码页，双击本地打开或部署后访问均可。
2. `scripts/overwrite-cos-image.mjs` —— 只凭**原图 URL** 反推对象键并覆盖上传，**完全不查库**。

**Business Impact**
- 一张图的处理时间从"多步脚本"降到 < 1 分钟，且数据库不可用时依然可用。
- 减少因审核拦截导致的线上坏图（每修一次都要重新走一遍上传链路，且前台已有缓存要等）。

---

## Success Metrics

**Primary KPIs**
- 单张预览图打码 + 覆盖上线耗时 < 60 秒（从拖入到终端命令执行完成）。
- 打码后不再触发 COS 审核封禁（主观验收：覆盖后前台卡片可见且内容合规）。
- 断库场景下可用：`supabase` 不可达时，整个流程无需登录即可完成。

**Validation**：上线后用真实的、曾被封禁的两条图片（见 `cos-moderation-blocked-previews`）各跑一次。

---

## User Personas

### Primary: 站主（唯一管理员）
- **Role**：白名单管理员（`ADMIN_EMAIL` / `ADMIN_PHONES`），实际就一个人
- **Goals**：线上出现敏感图时尽快打码换掉，不要让前台挂坏图
- **Pain Points**：现有流程依赖库、步骤多；改图后不确定到底生效没有
- **Technical Level**：Advanced（能在项目根目录跑 node 命令）

---

## User Stories & Acceptance Criteria

### Story 1: 本地打码并导出

**As a** 站主
**I want to** 把图片拖进网页，框出敏感区域并打码，然后导出
**So that** 我能立刻拿到一张可以替换的合规图

**Acceptance Criteria**
- [ ] 支持拖入、点击选择、剪贴板粘贴（Ctrl+V）三种方式载入图片
- [ ] 支持填写 COS 原图链接直接载入（依赖桶的 CORS 配置，失败时给出可执行的替代提示）
- [ ] 在图上拖拽生成矩形区域，可叠加多个区域
- [ ] 每个区域可单独选择「马赛克」或「高斯模糊」，并调整强度
- [ ] 选中区域可拖动位置、拖右下角改大小、按 Delete 删除
- [ ] 导出的图保持原图分辨率（不放大不缩小），格式 WebP，文件名 `<原名>-blur.webp`
- [ ] 导出的图**不含**任何框选边框/手柄

### Story 2: 覆盖回 COS 原对象

**As a** 站主
**I want to** 用一条命令把打码图覆盖回去
**So that** 前台立刻显示打码后的图，且不需要改数据库

**Acceptance Criteria**
- [ ] 页面生成可直接复制的命令，并预填原图 URL
- [ ] 命令不查数据库（URL → 对象键），断库可用
- [ ] 覆盖时写入 `Cache-Control: no-cache`，保证换图可见（沿用 `reupload-mod-image.mjs:170-173` 的结论）
- [ ] 支持 `--dry-run`，先打印目标对象键与文件信息再决定
- [ ] URL 含中文时走 `--url-file`，不把中文放进命令行参数（`powershell-ansi-encoding-traps` 记录的坑）
- [ ] 非 COS 地址、带查询串的地址、非图片扩展名一律拒绝并给出原因

### Story 3: 幂等与安全

**As a** 站主
**I want to** 工具不会误覆盖无关对象
**So that** 我不会把别的 mod 的图打坏

**Acceptance Criteria**
- [ ] 只接受 `https://{COS_BUCKET}.cos.{region}.myqcloud.com/...` 形态的地址
- [ ] 覆盖前打印完整对象键；`--dry-run` 不下发任何写请求
- [ ] 浏览器端不保存、不请求任何 COS 密钥

---

## Functional Requirements

### Core Features

**Feature 1: 图片载入**
- Description：拖拽区 / 文件选择 / 粘贴 / URL
- User flow：拖入 → 立即进入编辑态
- Edge cases：非图片文件 → 提示；URL 跨域失败 → 提示"先把原图下载到本地再拖进来"
- Error handling：所有失败都停留在载入态并给出下一步动作

**Feature 2: 框选打码**
- Description：在画布上拖拽生成矩形；每块独立记录 `{x,y,w,h,mode,strength}`
- User flow：拖出矩形 → 默认继承当前工具栏的模式与强度 → 选中后可改参数
- Edge cases：小于 8px 的拖拽视为误触、不生成区域；图片边界外自动裁剪
- Error handling：无

**Feature 3: 导出与命令生成**
- Description：导出 WebP；根据原图 URL 生成覆盖命令
- User flow：点「下载打码图」→ 出现命令块 → 点「复制命令」→ 粘到终端
- Edge cases：URL 非 ASCII → 自动切换为 `--url-file` 形态并额外提供一个 `blur-url.txt` 下载
- Error handling：URL 不是 COS 地址时给黄色警告，仍然允许下载图片

### Out of Scope
- 笔刷涂抹 / 圆形 / 任意多边形
- 直接写库、改 `images[]`、发快照、ping `/api/revalidate`（URL 不变，都不需要）
- CDN 缓存刷新 API（见风险表）
- 后台登录态集成（`/admin/tools/blur` 留给 Phase 2）
- 批量处理多张图

---

## Technical Constraints

### Performance
- 2560×1600 图片的每次重绘 < 100ms（区域数 ≤ 10）；拖拽中用 overlay 画临时框，松开才重绘底图。

### Security
- 浏览器端**不含任何密钥**；COS 鉴权只走本地脚本读 `.env.local`。
- 页面本身是公开静态资源，但无密钥、无写能力，泄露无风险。

### Integration
- **COS**：`cos-nodejs-sdk-v5` 的 `putObject`，覆盖同 key。
- **现有脚本惯例**：对象键从 URL 反推、`Cache-Control: no-cache`、不改库、不发快照
  （与 `scripts/reupload-mod-image.mjs` 的注释结论一致）。
- **技术栈**：原生 HTML/CSS/JS，不引入任何新依赖（Canvas API 足够）。

---

## MVP Scope & Phasing

### Phase 1: MVP（本次交付）
- 单文件打码页
- 覆盖脚本（URL → key，断库可用）
- 单测：URL → 对象键解析

### Phase 1.5: 审阅台（同批追加，2026-10-24）
需求方追加：「我有很多图要改，最好边看哪些图有问题直接就打模糊」。单张上传->处理->跑命令
的循环对批量场景太慢，因此追加：

- `GET /api/tools/blur-index` —— 读本地 `data/mods-snapshot.json.gz` 生成图片清单（**不查库**）
- `/tools/blur` —— 把全站 5509 张预览图铺成卡片网格，可搜标题、按角色筛
- 卡片点开即在该图上框选打码，保存后收回网格并打「已打码」标
- 一次性导出 `blur-batch.zip`（零依赖 STORE zip）+ `blur-jobs.json`（打码图名 → 原图 URL）
- `scripts/overwrite-cos-images-batch.mjs` 按清单批量覆盖，同样不查库

**为什么不在真实 `ModCard` 上加按钮**：管理员判定走 Supabase 登录，库不可用时判不出来 ——
按钮要么不出现、要么对所有人出现；且改 `ModCard` 需要重新部署，而库挂着时 build 有把空数据
烤进产物的前科。审阅台把同样「卡片 + 按钮」的体验隔离在一个独立路由里，零风险可用。

### Phase 2: Enhancements
- 覆盖后自动校验：拉一次图片 ETag 对比
- 审阅台支持多图 mod（目前只处理 `images[0]`）

### Future Considerations
- 批量打码（一个 mod 的多张图）
- 打码预设（脸/胸口等固定区域模板）

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| COS 未对本站开放 CORS，URL 直接载入失败 | 中 | 低 | 主路径是本地文件；URL 失败时明确提示替代动作 |
| 覆盖同 key 后，已缓存的 `?imageMogr2` 缩略图仍返回旧图 | 中 | 中 | 原对象写 `no-cache`；验收时用无痕窗口核对卡片缩略图，必要时等缓存过期或改用新 key |
| 命令行传中文路径被 PowerShell 5.1 破坏 | 中 | 中 | 提供 `--url-file`；`--latest` 自动在下载目录挑选，避免传中文参数 |
| 误覆盖到别的对象 | 低 | 高 | 只接受本桶 URL；`--dry-run` 默认建议先跑；打印完整 key |

---

## Assumptions & Defaults（PO 填的默认值，可推翻）

1. 产物格式统一 WebP（站点预览图已是 WebP；导出质量 0.92）。
2. 导出时**不缩放**，脚本上传时可选 `--width=1000`（默认 1000，与 `upload-daily-by-date.mjs` 的 `PREVIEW_WIDTH` 一致，不放大）。
3. 覆盖的是用户在页面里填的那**一张** URL，不做同 mod 其它图的联动。
4. 页面部署位置 `public/tools/blur.html`，无导航入口，直接输 URL 访问。
5. 打码强度以**源图像素**计量（马赛克方块边长 / 模糊半径），与导出分辨率解耦。

---

## Appendix

### Glossary
- **对象键（object key）**：COS 里对象的路径，如 `mods/卡提希娅/abc/preview.webp`
- **同键覆盖**：用同一 key 重新上传，URL 不变，因此不需要改库

### References
- `src/lib/cos/shared.ts:8-19`（缓存策略）
- `scripts/reupload-mod-image.mjs:85-96,157-180`（反推对象键与 `no-cache` 覆盖的先例）
- `docs/card-preview-sharpness-prd.md`（换图与缓存的相关结论）
