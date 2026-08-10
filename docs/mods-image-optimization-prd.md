# Product Requirements Document: Mod 分类页图片加载优化

**Version**: 1.0
**Date**: 2026-08-04
**Author**: Sarah (Product Owner)
**Quality Score**: 94/100

---

## Executive Summary

WaveMod 的 `/mods` 分类页是用户浏览 Mod 内容的核心入口。当前图片直接从腾讯云 COS 源站加载原始分辨率文件，导致首屏加载缓慢、滚动时出现明显白屏。本项目在不改变存储方式（图片仍保留在 COS）的前提下，通过开启 COS CDN 加速域名 + 数据万象（CI）图片处理服务，配合前端骨架屏替代双图加载、preconnect 预连接等优化，将首屏 LCP 降低到 1.5 秒以内，实现"秒开"级别的图片浏览体验。

目标用户为国内玩家群体，优化范围覆盖 `/mods` 页面的全部 Mod 卡片（首屏 + 瀑布流滚动加载）。

---

## Problem Statement

**Current Situation**：
- 图片以原始分辨率（可能 2000px+）从 COS 源站直连加载，单张图片体积大、延迟高
- 固定比例模式下每张卡片请求两次原图（模糊背景 + 清晰主图），带宽翻倍
- 无 CDN 加速，国内用户跨地域访问 COS 源站延迟不稳定
- 无图片格式转换（WebP），浏览器仍加载原始 PNG/JPG
- Next.js `unoptimized: true`，自定义 image loader 为空操作

**Proposed Solution**：
1. COS 控制台开启 CDN 加速域名 + 数据万象图片处理
2. 前端 URL 拼接 CI 参数动态生成缩略图（WebP 格式，400px 宽）
3. 骨架屏替代当前的双 img 标签模式
4. 添加 CDN 域名 preconnect 预处理
5. CI 失败时自动回退原图 URL

**Business Impact**：
- 首屏 LCP 从当前 ~3-5s 降至 < 1.5s
- 图片体积减少 60-80%（WebP 缩略图 vs 原图）
- 降低 COS 源站出流量费用（CDN 命中率 > 90%）
- 提升用户留存率和 Mod 详情页点击转化率

---

## Success Metrics

**Primary KPIs:**
- **LCP（Largest Contentful Paint）**: < 1.5s（目标值），当前约 3-5s（基线值）
- **首屏图片可见时间**: < 1s（用户感知秒开）
- **单张卡片图片体积**: < 50KB（缩略图），原图通常 500KB-2MB

**Validation**：
- 通过 Chrome DevTools Lighthouse / Performance 面板测量
- 对比优化前后的瀑布图（Network 面板）
- 使用 Vercel Analytics / Web Vitals 持续监控 LCP

---

## User Personas

### Primary: 国内 Mod 浏览者
- **Role**: WaveMod 普通用户
- **Goals**: 快速浏览 Mod 列表，通过封面图判断是否感兴趣，点击查看详情
- **Pain Points**: 滚动时图片加载慢，出现白屏或长时间空白；首屏等待 3-5 秒才能看到完整卡片
- **Technical Level**: 普通用户，使用国内网络（电信/联通/移动），桌面端为主，部分移动端

---

## User Stories & Acceptance Criteria

### Story 1: 首屏图片秒开

**As a** Mod 浏览者
**I want to** 打开 /mods 页面后首屏图片立即显示
**So that** 我能快速判断哪些 Mod 值得点进去看

**Acceptance Criteria:**
- [ ] 首屏 4-6 张卡片图片在 1 秒内完成渲染
- [ ] LCP < 1.5s（Lighthouse 测量）
- [ ] 无可见的长时间白屏或大面积空白区域
- [ ] 骨架屏在图片加载前提供视觉占位

### Story 2: 瀑布流滚动不白屏

**As a** Mod 浏览者
**I want to** 向下滚动时新图片快速出现
**So that** 浏览体验流畅不被打断

**Acceptance Criteria:**
- [ ] 滚动触发的卡片在进入视口 500ms 内完成图片加载
- [ ] 骨架屏在图片加载前保持占位，无布局抖动
- [ ] 瀑布流列宽切换时图片不闪烁

### Story 3: 弱网环境降级可用

**As a** 网速较慢的用户
**I want to** 即使图片处理服务异常，也能看到 Mod 列表
**So that** 我不会因为技术问题而无法浏览

**Acceptance Criteria:**
- [ ] COS 万象 CI 处理失败时，自动回退到原图 URL
- [ ] 回退后的重试机制正常工作（已有的指数退避 3 次重试）
- [ ] 所有重试失败后显示 ImageOff 占位图标（已有功能保持不变）

---

## Functional Requirements

### Core Features

**Feature 1: COS CDN 加速域名**
- Description: 在 COS 控制台为存储桶开启 CDN 加速，获得 CDN 域名
- User flow: 无用户感知，系统层面自动通过 CDN 节点分发图片
- Edge cases: CDN 节点缓存未命中时回源 COS
- Error handling: CDN 不可用时不影响原 COS 直连 URL 的访问

**Feature 2: COS 万象 CI 图片处理**
- Description: 通过 URL 参数动态生成缩略图（`?imageMogr2/format/webp/thumbnail/400x`）
- User flow: 前端请求带 CI 参数的 URL → COS 实时处理并返回缩略图
- Edge cases:
  - CI 未开启时参数被忽略，返回原图
  - 处理超时回退原图 URL
- Error handling: `onError` 触发时，下一次重试使用不含 CI 参数的原图 URL

**Feature 3: 骨架屏替代双图加载**
- Description: 移除固定比例模式下的一张模糊背景 `<img>`，改用纯 CSS 骨架屏
- User flow: 卡片渲染 → 骨架屏显示 → 图片加载完成 → 骨架屏消失
- Edge cases: 骨架屏需匹配卡片的 aspect-ratio（grid: `aspect-[4/5]`, masonry: 自动）
- Error handling: 图片加载失败后骨架屏保持显示（或切换为 ImageOff 图标）

**Feature 4: preconnect 预连接**
- Description: 在 `<head>` 中添加对 CDN 域名的 `<link rel="preconnect">`
- User flow: 浏览器提前建立与 CDN 的 TCP/TLS 连接
- Edge cases: 仅在 CDN 域名可用时添加
- Error handling: preconnect 失败不影响页面正常加载

### Out of Scope
- ❌ 不改变图片存储位置和上传流程
- ❌ 不生成 BlurHash / LQIP（使用骨架屏替代）
- ❌ 不修改详情页（mod detail drawer）图片加载
- ❌ 不修改 Hero Carousel 首屏大图
- ❌ 不添加 Service Worker 级别的图片缓存

---

## Technical Constraints

### Performance
- LCP < 1.5s（桌面端，国内网络）
- 缩略图单张 < 50KB（`thumbnail/400x` + WebP）
- CDN 缓存策略：图片 7 天缓存，`Cache-Control: public, max-age=604800`
- preconnect 仅在 CDN 域名可用的环境生效

### Security
- `referrerPolicy="no-referrer"` 保持不变（绕过 COS 防盗链）
- CDN 域名需配置防盗链白名单（Referer: wavemod 域名）
- COS 源站禁止公网直接访问（仅允许 CDN 回源）

### Integration
- **COS 控制台**：开启 CDN 加速 + 数据万象图片处理
- **前端 URL 拼接**：`lib/cos/shared.ts` 中新增 `buildCosThumbnailUrl()` 函数
- **mapMod mapper**：`coverImage` 字段可选择返回缩略图 URL 或原图 URL
- **next.config.ts**：可选添加 CDN 域名到 `remotePatterns`

### Technology Stack
- Tencent Cloud COS + CDN + 数据万象（CI）
- Next.js 16 + React 19
- TanStack Query（无限滚动）
- Tailwind CSS（骨架屏动画）

### Constraints（硬性约束）
- 不改变 COS 存储方式和上传流程
- 不影响现有 retry 降级逻辑
- 改动范围仅限 `/mods` 页面 ModCard，不影响其他使用 ModCard 的地方（除非确认受益）

---

## MVP Scope & Phasing

### Phase 0: COS 配置（先于代码）
**谁做**：有 COS 控制台权限的人
1. 在 COS 控制台开启 CDN 加速，获取 CDN 域名
2. 配置 CDN 防盗链 Referer 白名单
3. 开启数据万象图片处理服务
4. 验证 CDN 域名可访问 + CI 参数生效

**验证方式**：浏览器直接访问 `https://cdn.example.com/path/image.jpg?imageMogr2/format/webp/thumbnail/400x`，确认返回压缩后的 WebP 图片

### Phase 1: 前端代码改造（核心 MVP）
1. `lib/cos/shared.ts`：新增 `buildCosCdnUrl()` 和 `buildCosThumbnailUrl()` 函数
2. `lib/mods-domain/mappers.ts`：`mapMod()` 区分列表缩略图 / 详情原图
3. `components/common/mod-card.tsx`：
   - 移除固定比例模式下的模糊背景 `<img>`
   - 添加骨架屏占位 div（带 shimmer 动画）
   - 图片 URL 使用缩略图版本
4. `app/(site)/mods/layout.tsx`：添加 CDN preconnect `<link>`
5. 清理 `mods-infinite-grid.tsx` 中的调试 console.log

### Phase 2: 验证与监控
1. Lighthouse 性能测试，确认 LCP < 1.5s
2. 国内不同网络环境下的加载速度测试
3. 确认 CDN 命中率 > 90%
4. 确认 CI 处理失败时的回退逻辑正常

### Future Considerations
- 详情页 ModDetailDrawer / ModPreviewGallery 统一使用缩略图 + 点击查看原图
- Hero Carousel 图片加入 CDN
- 移动端适配（更小的缩略图尺寸，如 200px）
- 接入 Vercel Analytics Web Vitals 持续监控

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| COS 万象 CI 处理失败或超时 | Low | Medium | 前端自动回退原图 URL + 现有重试机制；CI 参数被忽略时原图正常返回 |
| CDN 节点缓存雪崩（大量回源） | Low | Low | 设置合理的缓存 TTL（7 天）；源站有带宽保障 |
| 骨架屏动画导致 CLS | Medium | Medium | 骨架屏与图片使用相同的 aspect-ratio；瀑布流已有 colMap 防抖机制 |
| COS 费用增加（CDN 流量 + CI 处理） | Low | Low | 缩略图体积远小于原图，总出流量预计下降；CI 基础处理有大量免费额度 |
| 国内 CDN 域名需备案 | High | High | 确认域名已完成 ICP 备案；CS 提供备案服务支持 |

---

## Dependencies & Blockers

**Dependencies:**
- **COS 控制台权限**：需要有腾讯云账号权限的人员开启 CDN + CI 服务
- **ICP 备案**：CDN 加速域名（自定义域名）需已完成 ICP 备案
- **COS 域名信息**：前端需要知道 CDN 加速域名（环境变量 `NEXT_PUBLIC_COS_CDN_BASE`）

**Known Blockers:**
- 如果 CDN 自定义域名未备案，可先用 COS 默认 CDN 域名过渡
- 如果万象 CI 服务未开启，URL 参数会被忽略，原图正常加载——不阻塞代码改动

---

## Appendix

### Glossary
- **COS**: 腾讯云对象存储（Cloud Object Storage）
- **CI / 万象**: 腾讯云数据万象（Cloud Infinite），图片处理服务
- **CDN**: 内容分发网络
- **LCP**: Largest Contentful Paint，最大内容绘制时间（Web Core Vital）
- **LQIP**: Low Quality Image Placeholder，低质量图片占位
- **WebP**: Google 推出的现代图片格式，比 JPG/PNG 体积小 25-35%

### References
- [COS CDN 加速文档](https://cloud.tencent.com/document/product/436/18669)
- [COS 图片处理文档](https://cloud.tencent.com/document/product/460/36541)
- `src/components/common/mod-card.tsx` — 当前 ModCard 实现
- `src/lib/cos/shared.ts` — COS URL 工具函数
- `src/lib/mods-domain/mappers.ts` — Mod 数据映射

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
