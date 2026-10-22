# Product Requirements Document: 列表卡片预览图清晰度提升

**Version**: 1.0
**Date**: 2026-10-22
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

用户在电脑与手机的 **mod 列表卡片**上明确反馈「图片还是太糊」。排查后确认根因不在前端渲染参数，而在**图源上限**：COS 里绝大多数预览图对象本身只有 560px 宽（随机抽样：近 30 天 12 张中 8 张 560、4 张 750；更早 12 张中 11 张 560）。渲染层请求 `imageMogr2/thumbnail/800x%3E`，`%3E` 的语义是「只缩不放」，因此请求 800/1280 拿回来的仍是 560 那张 —— 参数怎么调都不会更清楚。

本 PRD 定义一次「**抬高图源 + 按需回源重做**」的清晰度工程：新上传直接存 1000px；存量按曝光优先级重做（近 30 天 + 浏览 Top200 共 425 条）；渲染层补一档 srcset。目标是在**手机首屏图片体积 ≤1.2MB** 的预算内，让 2x 屏下的列表卡片不再发虚。

它接续 `docs/mods-image-optimization-prd.md`（2026-08-04，94 分）：那一期为了 LCP 把图压到 560，本期是在带宽与清晰度之间重新找平衡点。

---

## Problem Statement

**Current Situation**

- 列表卡片从 COS 取 `thumbnail/800x%3E`，`srcset` 档位 [320, 480, 560, 800]，但存量对象就是 560 宽，800 档返回的是同一张 560（`%3E` 不放大）。
- `/mods` 默认是**瀑布流**：手机 2 列、桌面 5 列。**宽高比 >1.1 的横屏卡横跨两列**，这才是吃像素的大卡 —— 手机约 355 CSS px、桌面 5 列约 490 CSS px，2x 屏分别要 ~710 / ~980 设备像素，560 被放大 1.3–1.8 倍。
- 普通竖屏卡（手机约 175 CSS px、桌面 5 列约 235 CSS px）560 其实够用；但桌面切 3 列时单卡就约 427 CSS px，2x 屏要 854，同样不够。
- `sizes` 是对的：瀑布流按布局算出卡片真实像素宽（含跨两列），问题只在图源上限。
- 原图多数已不在本地：日期目录只剩 65 张图（近 9 天），`offline-blur-src/图片` 只有 143 张打码图；爬虫侧缓存的也是缩略图（arca 100×100、GameBanana 530 宽、可可站 167×300），**不能用来重做**。

**Proposed Solution**

1. **抬高新图源规格**：每日上传管道由 750px 提到 1000px（`scripts/upload-daily-by-date.mjs` 的 sharp resize）。
2. **存量按优先级重做**：近 30 天 ∪ 浏览 Top200 = **425 条**，能用本地原图的先做（约 57 条），其余回源重取原图后重生成。
3. **写新对象键**：`preview-hd.webp`，避免覆盖同键带来的最长 7 天缓存不可见（现有 `Cache-Control: max-age=604800`）。
4. **渲染层补档**：卡片 `srcset` 由 [320,480,560,800] 调整为 [400,560,800,1000]，给 2x/3x 屏各留一档。

**Business Impact**

- 手机列表卡片在 2x 屏下从「放大 1.25~1.9 倍」变为「原生或轻微放大」，是用户最先感知的体验改善。
- 卡片单张 60–90KB，手机首屏图片总量控制在 ≤1.2MB（现状约 570–800KB，但那是靠 560 换来的）。
- 不改变信息架构，不动详情页，风险与工程量都可控。

---

## Success Metrics

**Primary KPIs**

| 指标 | 目标 | 测量方式 |
|---|---|---|
| Phase 1 目标记录图源宽度 | ≥800px 的比例 ≥90%（425 条中 ≥383 条） | 脚本对每条记录 `?imageInfo` 取宽，产出报表 |
| 2x 屏不糊抽检 | 抽 20 张卡片，实际加载图宽 ≥ 显示宽×2 的比例 ≥95% | 手机实机 DevTools Network 逐条核对 |
| 手机首屏图片体积 | ≤1.2MB | 冷启动清缓存后 Network 汇总（图片类） |
| 单张卡片图体积 | ≤90KB | 同一报表统计 |

**Validation**：Phase 0 上线后 3 天内跑一次抽样；Phase 1 完成后跑全量报表并附上前 10 条最糊的截图对比。

### 首屏预算实测（2026-10-22，`scripts/measure-first-screen-images.mjs`）

用 headless Chrome + CDP 设真机视口，读 `performance.getEntriesByType('resource')` 的
`transferSize`（只统计 `initiatorType === 'img'`）：

| 场景 | 图片张数 | 图片合计 | 主要档位 |
|---|---|---|---|
| 手机 390×844 @2x | 7 | **229KB** | 800w ×7 |
| 手机 390×844 @3x | 19 | **656KB** | 1000w ×7（371KB）+ 480w ×12（284KB） |
| 桌面 1440×900 @2x | 54 | **937KB** | 1000w ×10（569KB）+ 480w ×13（368KB） |

三档都在 1.2MB 预算内（2x 手机只用了 19%）。注意 2x 屏的大卡落在 **800w** 档而不是
1000w —— 浏览器按 `sizes` 算出的 710 设备像素选了 800，这正是预期行为，不是漏配。

---

## User Personas

### Primary: 手机端逛 mod 的玩家
- **Role**：下班后用手机刷新上架的 mod，靠卡片图判断「这个皮肤好不好看」
- **Goals**：快速判断外观质量，决定要不要点进去下载
- **Pain Points**：单列大卡片上人脸/服装细节发虚，像「十年前的手游截图」
- **Technical Level**：普通用户，不关心分辨率概念，只关心「清不清楚」

### Secondary: 桌面端多列浏览用户
- **Role**：一次浏览几十条，靠缩略图筛选
- **Goals**：扫读、加收藏
- **Pain Points**：3 列模式下（约 300 CSS px）2x 屏轻微发虚；5 列模式其实没问题
- **Technical Level**：中级

---

## User Stories & Acceptance Criteria

### Story 1: 手机跨列大卡不再糊

**作为** 手机端玩家
**我想要** 瀑布流里横跨两列的大卡在 2x 屏上细节清晰
**以便** 一眼判断这个 mod 值不值得点进去

**Acceptance Criteria**
- [ ] 手机上跨两列大卡（约 355 CSS px）在 2x 屏加载的图宽 ≥710px
- [ ] 普通两列竖卡片（约 175 CSS px）不因新档位多下载字节
- [ ] 同一张卡在 3x 屏上加载 ≥1000px 档（在预算内尽力，不作为硬指标）
- [ ] 图源本身小于 700px 的（如 447×1268 竖图）**不放大**，保持原宽并有兜底，不产生模糊的二次插值

### Story 2: 桌面大卡与 3 列版式不发虚

**作为** 桌面端浏览用户
**我想要** 跨列大卡和切到 3 列时也清楚
**以便** 快速筛选

**Acceptance Criteria**
- [ ] 5 列下的跨两列大卡（约 490 CSS px）2x 屏加载 ≥980px 图
- [ ] 3 列版式单卡（约 427 CSS px）2x 屏加载 ≥854px 图
- [ ] 5 列普通卡（约 235 CSS px）不因新档位多下载字节（浏览器按 `sizes` 自选）

### Story 3: 新上传的 mod 天然清晰

**作为** 站长
**我想要** 新图入库时就是 1000px
**以便** 不用为每天的新内容再补一次工

**Acceptance Criteria**
- [ ] 上传脚本产出 webp 宽 1000px，单张 ≤90KB
- [ ] 上传后 `?imageInfo` 实测宽 = 1000（源图 ≥1000 时）
- [ ] 上传日志仍打印压缩前后体积，便于回归

### Story 4: 存量按优先级重做

**作为** 站长
**我想要** 先把近 30 天和热门 mod 修好
**以便** 投入产出比最高

**Acceptance Criteria**
- [ ] 脚本支持 `--from-local`（日期目录原图）与 `--from-db`（按 created_at/views 选集合）
- [ ] 默认 dry-run，打印「可本地做 / 需回源 / 源不可用」三类计数
- [ ] 回源失败的记录保持 560 原样，写入失败清单，不阻塞整批
- [ ] 写库后自动重发兜底快照 + ping `/api/revalidate`

---

## Functional Requirements

### Feature 1: 上传管道提到 1000px

- **Description**：`convertToWebP` 的 `resize({ width: 750 })` → 1000，质量保持 80。
- **User flow**：每日脚本 → sharp 转码 → COS `mods/{角色}/{modId}/preview.webp`。
- **Edge cases**：源图 <1000 宽时不放大（`withoutEnlargement: true` 已具备）。
- **Error handling**：转码失败沿用现有重试与占位图逻辑。

### Feature 2: 卡片 srcset 补档

- **Description**：`CARD_IMAGE_WIDTHS` 由 [320,480,560,800] → [400,560,800,1000]；`COS_IMG_CARD` 保持 800 作为 `src` 兜底。
- **User flow**：浏览器按 `sizes` 自选，无交互变化。
- **Edge cases**：非 COS 图（Supabase/本地头像）不受影响（函数已短路返回）。
- **Error handling**：`_retry` 逻辑保持，src 与 srcset 都要带。

### Feature 3: 存量重做脚本 `scripts/rebuild-hd-previews.mjs`

- **Description**：按集合选记录 → 取原图 → 生成 1000px webp → 写新键 `preview-hd.webp` → 更新 `images[0]`。
- **User flow**：`--dry-run` 看清单 → `--apply` 执行 → 自动发快照 + ping。
- **Edge cases**：原图 <800 → 跳过并记录；源不可用 → 保留 560；同一条已有 `preview-hd` → 幂等跳过。
- **Error handling**：单条失败不影响整批，结束时打印成功/跳过/失败三行汇总。

### Out of Scope（本期不做）

- 详情页大图 / 轮播位（已有 srcset 640/960/1280/1920，单独评估）
- 全量 5500 张重做（来源大量失效，见风险表）
- 引入 CDN、图片格式升级（AVIF）、以及任何数据库结构变更
- 改变卡片尺寸或布局

---

## Technical Constraints

### Performance
- 手机首屏图片总量 ≤1.2MB；单张卡片 ≤90KB
- 图片仍走 COS 数据万象现场变换，不新增构建期产物
- **不改库结构**，只更新 `mods.images[0]` 字符串

### Security
- 沿用现有 COS 公开读 + STS 直传；不新增权限面
- 无用户上传路径变更

### Integration
- **COS 数据万象**：`thumbnail/{w}x%3E/format/webp` 行为已实测（`%3E` 不放大）
- **Supabase（直连 5432）**：脚本沿用 `scripts/psql-db.mjs`
- **快照 + 缓存**：写库后必须重发 COS 快照并 ping `/api/revalidate`

### Technology Stack
- Next.js 16 App Router + Tailwind；`images.unoptimized: true`（不改）
- sharp 已在依赖内；**不引入新库**
- 必须处理 Windows/MSYS 下中文与 `.exe` 同名坑（历史教训）

### Cache 约束（关键）
现有对象头 `Cache-Control: public, max-age=604800, stale-while-revalidate=86400`。**原地覆盖同键最快也要 7 天才全网可见**，故本期一律写新对象键 `preview-hd.webp`，不覆盖 `preview.webp`。

---

## Scope & Phases

### Phase 0：管道与渲染（0.5 天，立即生效）
- 上传改 1000px
- 卡片 srcset 加 1000 档
- 验收：新传一条 → `?imageInfo` 宽 1000；手机 2x 屏卡片实测 ≥700

### Phase 1：本地原图批量重做（0.5 天）
- 日期目录现存 65 张原图（2560×1097 一类），脚本直接重做
- 验收：这 57 条对应卡片 2x 屏不糊

### Phase 2：近 30 天 ∪ Top200 回源（1–2 天）

**范围已按实测收窄**：425 条目标里，本地原图的 62 条已在 Phase 1 做完；**另有 164 条在 COS 桶里还留着非 webp 原图**（`mods/<slug>/<modId>/preview.png|jpg`，900–1000px、约 1.2MB，2026-07 转 webp 时没删），用 `rebuild-hd-previews.mjs --from-cos` 直接重建，不需要任何下载。做完后全库 HD 图共 **226 条**。

剩下 349 条里**只有 38 条是横图且 <800px**（宽高比 >1.1，即瀑布流里跨两列的大卡），其余竖图在手机 2 列（约 175 CSS px）下 560 已够用、看不出发虚。

- 47 条横图里 38 条宽度 <800，是真正需要换源的那批（清单见 `scripts/logs/pending-landscape.json`）
- 原图只能从夸克/迅雷的 mod 包里取（库里 `mod_author_url` 全为空，爬虫侧缓存只有 100–530px 的缩略图），需要先把这 47 个包下载回本地
- 验收：47 条里 ≥90% 达到 ≥800px；失败清单留档

### Phase 3（后续）
- 详情页大图、轮播位评估
- 按热度继续从 425 条往外扩

**MVP 定义**：Phase 0 + Phase 1 完成即交付「新图清晰 + 最近一周卡片清晰」的最小闭环。

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| 回源失败（arca 需 nahida.live 中转、夸克需重下整包） | High | Med | 先用本地原图与可直接抓的源；失败保持 560 并留清单；不追求 100% |
| 覆盖同键缓存 7 天不可见 | High（若忽略） | High | 强制写新键 `preview-hd.webp` |
| 首屏体积失控 | Med | Med | srcset 分档 + 单张 ≤90KB 硬约束 + 上线后实测 ≤1.2MB |
| 3x 屏用户仍觉糊 | Med | Low | 明确本期目标为 2x；3x 依赖 1000 档尽力 |
| `images` 字符串被多处精确比较 | Med | High | 只换对象键不改结构；上线前跑占位图/收藏/后台回填三处回归 |
| 弱网 + 校园网丢包放大体积代价 | Med | Med | 分档让低 DPR 设备不多下；Phase 1 先小批量观察 |

---

## Dependencies & Blockers

**Dependencies**
- COS 数据万象可用（已验证）
- 每日上传脚本与 `psql-db.mjs`（已在用）
- 本地原图：日期目录 65 张、`offline-blur-src` 143 张

**Known Blockers**
- 多数老图的原图**已不可本地获取**，回源是唯一路径；能否达标取决于源的可访问性
- arca.live 有 Cloudflare 挑战，抓取需走已配置的爬虫或人工导出

---

## Appendix

### Glossary
- **DPR**：设备像素比，2x 屏 1 CSS px = 2 设备像素
- **`%3E`**：URL 编码的 `>`，`thumbnail/800x%3E` 表示「仅当比 800 宽才缩小」
- **preview-hd.webp**：本期新增的高清对象键，避免覆盖缓存

### References
- `docs/mods-image-optimization-prd.md`（本期前置方案，560 决策来源）
- `src/lib/cos/shared.ts`（`COS_IMG_CARD` / `cosImageSrcSet` / transform 语义）
- `src/components/common/mod-card.tsx`（`CARD_IMAGE_WIDTHS` 与重试逻辑）
- `scripts/upload-daily-by-date.mjs`（转码与上传管道）

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
