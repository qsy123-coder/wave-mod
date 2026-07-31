# Product Requirements Document: Mod 预览图迁移至腾讯云 COS

**Version**: 1.0
**Date**: 2026-07-31
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

WaveMod 当前使用 Supabase Storage 存储 Mod 预览图，由于 Supabase 服务器位于海外，国内用户访问时图片加载超过 3 秒，严重影响用户体验。本项目将 Mod 预览图从 Supabase Storage 迁移到腾讯云 COS（对象存储），利用国内 CDN 节点加速，目标将图片加载时间降低到 1 秒以内。

迁移采用**双写 + 平滑切换**策略：新上传的图片同时写入 Supabase 和 COS，前端逐步切换到 COS URL；存量 200-1000 张图片通过批量脚本迁移；验证通过后移除 Supabase Storage 依赖。全流程可回滚，零停机。

---

## Problem Statement

**当前状况**：Mod 预览图存储在 Supabase Storage（海外） → `next/image` 展示 → 国内用户加载 >3 秒，首屏图片缓慢出现，体验极差。

**建议方案**：将 Mod 预览图迁移至腾讯云 COS（国内节点）→ 通过 COS 默认 CDN 域名访问 → 加载时间 <1 秒。

**业务影响**：
- 大幅提升国内用户体验，减少因加载慢导致的用户流失
- 利用腾讯云免费额度（50GB + 10GB/月流量），前 6 个月零成本
- 统一图片存储方案，降低 Supabase Storage 依赖

---

## Success Metrics

**主要 KPI：**
- **Mod 图片首屏加载时间**：从 >3s 降到 <1s（Lighthouse / WebPageTest 测量）
- **图片加载成功率**：>99.5%（CDN 可用性保障）
- **迁移覆盖率**：100% 存量 Mod 图片完成迁移

**验证方法**：部署后在 Chrome DevTools Network 面板验证 COS URL 响应时间

---

## User Personas

### 主要用户：国内访客
- **角色**：浏览 Mod 的普通用户
- **目标**：快速浏览 Mod 列表和详情，图片秒加载
- **痛点**：Supabase 海外服务器导致图片加载 >3 秒
- **技术水平**：任意

### 次要用户：管理员
- **角色**：上传 Mod 的管理员
- **目标**：上传 Mod 预览图后，图片能快速被用户访问
- **痛点**：上传到 Supabase 后用户加载慢
- **技术水平**：中级

---

## User Stories & Acceptance Criteria

### Story 1: 管理员上传 Mod 图片到 COS

**As a** 管理员
**I want to** 上传 Mod 预览图到腾讯云 COS
**So that** 国内用户能快速加载图片

**Acceptance Criteria:**
- [ ] 管理员在 Mod 编辑页上传图片时，图片自动上传到 COS
- [ ] 上传组件 UI 保持不变，底层存储切换为 COS
- [ ] 上传过程中显示进度条和状态反馈
- [ ] 上传失败时显示明确错误提示，且图片仍写入 Supabase 作为备份
- [ ] 支持 PNG/JPEG/WebP/GIF 格式，单文件 ≤ 20MB

### Story 2: 用户浏览 Mod 时快速加载图片

**As a** 国内用户
**I want to** 浏览 Mod 列表和详情时图片秒加载
**So that** 我不需要等待就能看到 Mod 预览

**Acceptance Criteria:**
- [ ] Mod 卡片、详情页、轮播图中的图片使用 COS URL
- [ ] 国内用户图片加载时间 < 1 秒
- [ ] 图片加载失败时自动回退到 Supabase URL
- [ ] `next.config.ts` 中已添加 COS 域名到 `remotePatterns`

### Story 3: 存量图片批量迁移

**As a** 开发者
**I want to** 一键将 Supabase Storage 上的所有 Mod 图片迁移到 COS
**So that** 已有 Mod 的图片也能享受 COS 加速

**Acceptance Criteria:**
- [ ] 批量迁移脚本从 Supabase Storage 下载图片并上传到 COS
- [ ] 迁移完成后更新数据库中 `mods.images` 的 URL
- [ ] 支持断点续传（已迁移的图片不重复上传）
- [ ] 迁移过程有进度输出和错误日志

---

## Functional Requirements

### 核心功能 1：COS 上传组件

- **描述**：改造现有 `StorageImageUpload` 组件，底层从 Supabase Storage 切换到 COS SDK 直传
- **用户流程**：
  1. 管理员在 Mod 编辑页选择图片
  2. 组件调用 COS SDK 上传到 `mods/{character}/{modId}/{filename}`
  3. 上传成功后返回 COS 公开 URL
  4. 同时保留 Supabase 上传作为双写备份
- **边界情况**：上传失败 → 显示错误信息，Supabase 备份仍可用
- **错误处理**：COS 上传超时/失败 → retry 3 次 → 降级到 Supabase only

### 核心功能 2：图片 URL 切换

- **描述**：所有 Mod 预览图展示位置从 Supabase URL 切换为 COS URL
- **涉及组件**：
  - `mod-card.tsx` — 列表/首页 Mod 卡片
  - `mod-preview-gallery.tsx` — Mod 详情图库
  - `hero-carousel.tsx` — 首页轮播
  - `wuwa-hero-carousel.tsx` — 鸣潮轮播
  - `zenless-hero-carousel-client.tsx` — 绝区零轮播
  - `zenless-mods-card.tsx` — 绝区零 Mod 卡片
  - `profile-mod-mini-card.tsx` — 个人页 Mod 卡片
- **URL 格式**：`https://{bucket}.cos.{region}.myqcloud.com/mods/{character}/{modId}/{filename}`
- **回退机制**：COS URL 加载失败 → 自动使用 Supabase URL（需修改 `ModCard` 的 retry 逻辑）

### 核心功能 3：存量迁移脚本

- **描述**：Node.js 脚本批量从 Supabase Storage 下载 → 上传到 COS → 更新数据库
- **输入**：Supabase Storage `mod-assets` bucket 中的所有图片
- **输出**：COS 中对应路径的图片 + 更新后的数据库记录
- **幂等性**：跳过已存在的 COS 对象

### 不在范围内
- ❌ ZIP 文件迁移（继续使用阿里云 OSS）
- ❌ Gallery / 角色头像 / 背景图迁移（仍使用本地 public/ 目录）
- ❌ 腾讯云万象 CI 图片处理（原图存储）
- ❌ 自定义 CDN 域名配置（使用 COS 默认域名）

---

## Technical Constraints

### 性能
- 图片加载时间：国内用户 <1 秒
- 上传时间：单张图片 <5 秒

### 安全
- COS Bucket 设为公共读（public-read）
- 上传使用临时密钥（STS），不暴露主账号密钥
- 服务端签名 API（`/api/cos/sign`）验证管理员身份

### 集成
- **腾讯云 COS SDK**：`cos-nodejs-sdk-v5`
- **腾讯云 STS SDK**：`tencentcloud-sdk-nodejs-sts`
- **Supabase Storage**：保留作为双写备份

### 环境变量
```
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=
COS_PUBLIC_DOMAIN=
```

---

## MVP 范围与分阶段

### Phase 1：COS SDK 集成 + 上传组件改造（MVP 核心）
- 安装 COS SDK 和 STS SDK
- 创建 `/api/cos/sign` 签名接口
- 改造 `StorageImageUpload` 支持双写（COS + Supabase）
- 更新 `next.config.ts` 添加 COS 域名

### Phase 2：前端 URL 切换
- 修改所有 Mod 图片展示组件使用 COS URL
- 添加 COS URL 加载失败回退到 Supabase 的机制
- 创建 `toCosUrl()` / `isCosUrl()` 工具函数

### Phase 3：存量图片迁移
- 编写 `scripts/migrate-to-cos.mjs` 批量迁移脚本
- 执行迁移并验证
- 更新数据库 URL

### Phase 4：清理
- 验证 COS 方案稳定运行 1 周
- 移除 Supabase Storage 双写逻辑
- 清理 Supabase Storage 旧图片（可选）

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| COS 上传失败 | 低 | 中 | 双写 Supabase 备份，降级使用 |
| 存量迁移数据丢失 | 低 | 高 | 不删除 Supabase 源文件，先在 COS 验证 |
| COS 费用超出预期 | 低 | 低 | 前 6 个月免费额度，后续按量计费很低 |
| 免费额度到期后忘记续费 | 中 | 中 | 设置 6 个月后日历提醒 |
| 某些地区 CDN 不可用 | 低 | 低 | 回退到 Supabase URL |

---

## Dependencies & Blockers

**依赖：**
- 腾讯云账号实名认证
- 开通 COS 服务并领取免费额度
- 获取 API 密钥（SecretId / SecretKey）

**已知阻塞：**
- 无

---

## Appendix

### Glossary
- **COS**：腾讯云对象存储（Cloud Object Storage）
- **STS**：临时安全凭证（Security Token Service），用于生成有时效性的访问密钥
- **万象 CI**：腾讯云数据万象（Cloud Infinite），图片处理和识别服务
- **CDN**：内容分发网络，将图片缓存到离用户最近的节点

### References
- 腾讯云 COS 免费额度：https://cloud.tencent.com/document/product/436/6240
- COS Node.js SDK：https://cloud.tencent.com/document/product/436/8629
- 临时密钥生成：https://cloud.tencent.com/document/product/436/14048

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
