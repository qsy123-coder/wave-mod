# Product Requirements Document: 香港反代 + Vercel 托管迁移

**Version**: 1.0
**Date**: 2026-10-18
**Author**: Sarah (Product Owner)
**Quality Score**: 92/100

---

## Executive Summary

WaveMod 目前自托管在腾讯云首尔的一台轻量服务器上（PM2 + nginx，`43.133.78.46`），部署链路完全由站主自己维护：改代码后 SSH 上去跑构建脚本。这台机器目前 CPU 78%、内存 97%，且动态接口要跨洋访问首尔的 Supabase。

本次迁移把「域名入口」和「应用本体」拆成两段：**香港轻量服务器做 nginx 反向代理与 TLS 终止**，**Next.js 应用部署到 Vercel**，函数区域固定 `icn1`（首尔，与 Supabase 同城）。这样大陆用户的流量先到香港（物理距离近、链路稳定），再由香港机回源 Vercel；静态资源仍由 Vercel 边缘网络分发。

迁移后运维负担从「守一台机器」变成「只守一个反代」，部署获得 Vercel 的预览环境与一键回滚，月成本控制在现有水平以内。代价是两处必须改造：互动计数与图库原先依赖服务器本地文件，Vercel 无状态环境无法保留，需改存腾讯云 COS。

---

## Problem Statement

**Current Situation**（2026-10-18 实测）：

- 应用与部署工具链全在同一台首尔机器上，CPU 78% / 内存 97%，已接近极限
- 动态路由（详情页、API）每次请求都要从首尔访问韩国的 Supabase，链路长且不可控
- 部署依赖 SSH + 自定义脚本，回滚需要重新 build，分钟级不可保证
- 大陆用户到首尔的链路不稳定，首屏体验受地域影响大

**Proposed Solution**：

```
大陆用户 ──→ 香港 nginx(443, TLS)  ──反代──→  Vercel(icn1)
                                              ├── Supabase（认证 / 数据）
                                              └── COS（图片 / 互动计数）
```

**Business Impact**：

- 大陆访问延迟下降（香港中转 + 首尔函数，替代「用户直连美东/首尔」的不确定链路）
- 故障恢复从「重新构建」缩短到「DNS 切回 / Vercel 回滚」
- 静态托管交给平台，服务器只需承担反代，规格与成本都可降

---

## Success Metrics

**Primary KPIs:**

| 指标 | 目标 | 测量方式 |
|---|---|---|
| 大陆访问 P75 可交互时间 | < 3s（以迁移前首尔机基线为对照） | 真实用户测量脚本 / 手工拨测（大陆网络环境） |
| 站点可用性 | ≥ 99.9%（月度停机 < 43 分钟） | 外部 uptime 监控（香港入口 + Vercel 两段分别探活） |
| 月成本 | ≤ 现行首尔机开销 | 腾讯云账单 + Vercel 用量面板（Hobby ¥0） |
| 回滚耗时 | ≤ 5 分钟 | 演练记录：Vercel 历史部署 Promote / DNS 切回首尔 |
| 互动计数写入成功率 | ≥ 99.9%，读取最终一致 ≤ 60s | 压测 + 线上日志 |

**Validation**：迁移前一周采集首尔机基线；切换后连续 14 天按上表采集，第 30 天复盘决定是否退租首尔机。

---

## User Personas

### Primary: 大陆访客（手机为主）
- **角色**：找 mod、下载、看教程的玩家
- **目标**：打开快、图能看清、点收藏/点赞马上有反馈
- **痛点**：跨境链路慢，首屏白屏时间长；点赞后刷新数字没变
- **技术水平**：普通用户，只会用浏览器

### Secondary: 站主（运维 / 发布）
- **角色**：唯一维护者，每天上传 mod、偶尔改代码
- **目标**：发布简单、出问题能马上回滚、不想半夜修服务器
- **痛点**：SSH 部署链路抖、构建失败排查慢、单机资源吃紧

---

## User Stories & Acceptance Criteria

### Story 1: 访客通过香港入口访问站点

**As a** 大陆访客
**I want to** 打开 `go.sunnyrose.xyz` 正常浏览
**So that** 我不需要关心站点部署在哪

**Acceptance Criteria:**
- [ ] `https://go.sunnyrose.xyz` 证书有效（香港机 certbot，自动续期），HTTP 308 跳 HTTPS
- [ ] 首页、`/mods`、详情页、`/updates`、`/guide` 均 200，静态 chunk 可加载（无无样式页面）
- [ ] 图片仍来自 COS，响应头 `X-Robots-Tag: noindex, nofollow` 与现有缓存头**原样透传**
- [ ] 香港机宕机时返回可读维护页，而不是空白 502

### Story 2: 访客的互动计数在 Vercel 上仍然有效

**As a** 访客
**I want to** 点赞 / 收藏 / 浏览后数字保留
**So that** 我的动作不会因为换部署方式而失效

**Acceptance Criteria:**
- [ ] 计数不再写本地文件，改存 COS；页面刷新后数字保留
- [ ] 并发写入不丢失（压测：同一 mod 50 并发点赞，最终计数 ≥ 基线 + 50 − 允许误差）
- [ ] COS 不可用时，接口降级为「只读 + 返回成功」而不是 500，用户无感知
- [ ] 计数与其他实例（多函数实例）之间最终一致（≤ 60s）

### Story 3: 站主发布与回滚

**As a** 站主
**I want to** push 后自动部署、出错一键回滚
**So that** 发布不再依赖 SSH

**Acceptance Criteria:**
- [ ] `push main` → Vercel 自动构建部署，CI 绿后线上生效
- [ ] 每日上传脚本的 `/api/revalidate` ping 经香港入口仍成功
- [ ] 线上出错可在 Vercel 面板 Promote 上一版本，≤ 2 分钟生效
- [ ] 极端故障可把 DNS A 记录切回首尔机，≤ 5 分钟恢复（TTL 提前降为 60s）

### Story 4: 有状态数据完成迁移

**As a** 站主
**I want to** 图库与互动计数不依赖服务器磁盘
**So that** 多实例/无状态环境不会丢数据

**Acceptance Criteria:**
- [ ] `/gallery` 图片可直接访问（COS 或 Vercel 静态），不再走读取本地文件的 API
- [ ] `data/runtime/engagement.json` 不再被生产写入；基线文件仍随代码部署
- [ ] 兜底快照 `data/mods-snapshot.json.gz` 随函数包部署（`outputFileTracingIncludes` 已验证）

---

## Functional Requirements

### Core Features

**F1. 香港入口（nginx 反向代理）**
- 描述：香港轻量机安装 nginx，终止 TLS（certbot 自动续期），将请求反代至 Vercel 部署域名
- 流程：DNS `go.sunnyrose.xyz` A 记录指向香港机 → nginx 按 Host 转发 → 回源 Vercel
- 边缘情况：
  - 回源超时（Vercel 冷启动 > 30s）→ 返回维护页，记录错误日志
  - 证书续期失败 → 告警（到期前 7 天）
  - 大文件/视频请求 → 直连 COS，不经过反代
- 错误处理：5xx 率 > 1% 时触发告警；保留 nginx access log 供流量统计

**F2. Vercel 项目**
- 描述：现有 `wave-mod` 项目重新启用，Hobby 套餐，函数区域 `icn1`
- 验收：响应头 `x-vercel-id` 显示 `icn1`（不是 `iad1`）
- 环境变量：从 `.env.production` 迁移（**注意 BOM 会让第一个变量消失**）
- 边缘情况：Hobby 若无法设置区域 → 记录为「动态路由退化」，评估升 Pro 或改为香港机跑动态

**F3. 有状态数据改造**
- 互动计数：写入 COS，要求原子写入或冲突可接受的方案（分片/事件追加 + 读时聚合）；读取带 30–60s 缓存
- 图库：`public/gallery/` 图片迁到 COS（或确保随部署可用），移除运行时读本地文件的依赖
- 兜底快照：维持现在的 `fs` 读取 + tracing 配置
- 边缘情况：COS 写失败不阻塞用户；累计失败率超阈值时告警

**F4. 切换与热备**
- 迁移前：把 DNS TTL 降到 60s，测一份首尔机基线（P75、带宽）
- 切换窗口：低峰期，切换后立即跑验证清单（首页/列表/详情/互动/登录/下载）
- 热备：首尔机保持运行 30 天，期间不做新功能发布

### Out of Scope
- 不迁移 Supabase（仍为首尔区域）
- 不引入国内 CDN / 备案
- 不改动 UI、不改动每日上传脚本的产出格式
- 不做多区域部署与跨区域故障转移

---

## Technical Constraints

### Performance
- 香港 → Vercel 回源 RTT 目标 < 50ms（新加坡/东京边缘 POP）
- 首屏 JS 体积不因迁移增加（现有客户端包已做过裁剪）
- 计数接口 P95 < 300ms

### Security
- 所有密钥仅存在于 Vercel 环境变量与服务器环境，不进 git
- COS 读写使用现有子账号密钥，最小权限（互动计数单独前缀）
- 计数接口需限流，防止刷量影响 COS 用量
- nginx 透传真实客户端 IP（`X-Forwarded-For`），审计日志保留 7 天

### Integration
- **Supabase**：认证回调域名不变（`go.sunnyrose.xyz`），无需改 Redirect URL 白名单；DB 出口配额仍是风险
- **腾讯云 COS**：图片、互动计数；图片变换参数不变
- **GitHub**：每日备份 Action、教程 zip Release 直链
- **Cloudflare**：DNS 灰云（DNS only），A 记录切换与 TTL 调整

### Technology Stack
- Next.js 16 / React 19 / Node Runtime（不得使用 Edge Runtime 读取快照）
- Vercel Hobby：100GB 流量、100 万次 Edge 请求、100 万次函数调用、4 CPU 小时/月
- 香港机：Linux + nginx + certbot；规格按 Phase 0 实测流量确定（暂定 2C2G / 5–10Mbps 或等值流量包）

---

## MVP Scope & Phasing

### Phase 0: 测量与基线（0.5 天）
- 统计首尔机近 30 天 nginx 日志：PV、带宽、峰值并发、5xx
- 测大陆网络下首尔机 P75 基线
- 确认 Vercel 账号套餐、项目状态与 `regions` 是否生效

### Phase 1: 存储改造（2–3 天）
- 互动计数迁移到 COS（含压测）
- 图库去本地文件依赖
- 部署到 Vercel 预发域名，跑通全部只读页面与登录

### Phase 2: 香港入口（1 天）
- 采购香港轻量机，安装 nginx / certbot
- 配置反代、缓存、维护页、日志
- 用 hosts 绑定域名的测试机验证回源正确

### Phase 3: 切换（1 小时窗口 + 观察 24h）
- DNS TTL 提前降为 60s → 切换 A 记录 → 验证清单
- 首尔机保持运行，作为热备

### Phase 4: 复盘与退租（第 30 天）
- 对照 KPIs 复盘；达标后退租首尔机，未达标保持双活

**MVP Definition**：香港入口可访问 + Vercel 部署可用 + 互动计数不丢失，即视为可用。

---

## Risk Assessment

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| Hobby 无法把函数固定在 icn1，动态页重演 2–8s | 中 | 高 | 上线首日看 `x-vercel-id`；不行则升 Pro 或让香港机跑动态接口 |
| Hobby 100GB 流量/100 万调用被打穿 | 中 | 高 | Phase 0 先用日志估算；用 Spend/用量告警；图片全部走 COS |
| Hobby 商用条款导致封号 | 低–中 | 高 | 站内有下载/赞助入口；随时可切 Pro，保留独立 DNS 回滚路径 |
| COS 并发写导致计数丢更新 | 中 | 中 | 原子写入方案 + 压测验收；必要时临时降级为只读 |
| 香港单点故障 | 中 | 中 | 首尔热备 30 天；nginx 维护页；必要时上双机 |
| Supabase 出口配额再次 402 | 中 | 高 | 保持快照兜底；计数已不在 Supabase；监控 402 响应 |
| 域名缓存未过期导致切换不彻底 | 低 | 中 | 提前 24h 降 TTL 到 60s |

---

## Dependencies & Blockers

**Dependencies:**
- Vercel 账号与 `wave-mod` 项目（曾出现 `DEPLOYMENT_DISABLED`，需确认已恢复）
- 腾讯云 COS 子账号密钥与桶权限（新增互动计数前缀）
- 香港服务器采购（与流量档位相关，依赖 Phase 0 测量）
- Cloudflare DNS 控制权（灰云记录、TTL 调整）

**Known Blockers:**
- 互动计数的一致性方案需在技术设计阶段定稿（COS 无原子自增）
- `vercel.json` 的 `regions` 在 Hobby 下是否被接受，需实际上线验证
- 每日上传脚本里的 revalidate 地址需改成最终入口（8 个脚本默认值）

---

## Appendix

### Glossary
- **反代（反向代理）**：外部请求先到香港 nginx，由它转发给后端（Vercel），用户不直连后端
- **icn1**：Vercel 首尔区域，与 Supabase `ap-northeast-2` 同城
- **Hobby**：Vercel 免费套餐，仅限非商业用途，额度硬上限
- **ISR**：增量静态再生成，页面按 revalidate 周期后台刷新

### References
- 现有部署：`scripts/deploy-update.sh`、`docs/双平台部署指南.md`、`docs/香港服务器部署指南.md`
- 域名拓扑：`docs/域名入口拓扑.md`
- 计数实现（待改造）：`src/lib/engagement/store.ts`
- 图库路由（待改造）：`src/app/api/gallery/[...filename]/route.ts`
- 快照兜底：`src/lib/mods-domain/snapshot.ts`、`next.config.ts` 的 `outputFileTracingIncludes`

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
