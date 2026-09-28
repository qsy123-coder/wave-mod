# Product Requirements Document: GameBanana 鸣潮 MOD 聚合页

**Version**: 1.0
**Date**: 2026-09-28
**Author**: Sarah (Product Owner)
**Quality Score**: 92/100

---

## Executive Summary

本站现有 5285 条 MOD 全部来自国内网盘（夸克 / 迅雷），内容源单一、更新依赖主理人手工整理。GameBanana 是全球最大的 MOD 社区，其鸣潮专区（game id `20357`）经全量普查后有 **3057 条可入库 MOD**（普查覆盖 99.6%，见 `docs/gamebanana-category-probe.md`），由国际作者持续更新——这是一个本站完全没有覆盖的内容池。

> ⚠️ **注意区分口径**：GameBanana 的 Subfeed 接口报告的总数是 **6075**，但那是**所有投稿类型**的总和，
> 其中 Mod 只有 3057 条，另有 Question 1984、Request 702，以及 Wip/Thread/Tool/Tutorial/Script/Blog 等。
> 同步脚本**必须**按 `_sModelName === "Mod"` 过滤，否则论坛提问与求物帖会一起入库。
> 本 PRD 全文的「MOD 数量」一律指过滤后的 3057 条。

本功能在站内新建一个独立页面 `/gamebanana`，把 GameBanana 的鸣潮 MOD 以「聚合导航」的形式呈现：站内出卡片（封面、作者、热度、分类），点开是站内轻量详情页，下载按钮把用户直接送到 GameBanana 的官方下载链。

**关键定位：本站不存储、不转发 GameBanana 的任何 MOD 文件。** 这是刻意的设计决定——GameBanana 每条 MOD 都带作者授权清单（license checklist），其中「Redistribute this Mod on other sites」在绝大多数条目上是 `ask`（需先征得作者同意）而非 `yes`。因此本功能只做元数据聚合 + 外链跳转，不做文件搬运。

同时，右上角现行主 CTA「直链下载」（指向 `/mods`）文案本身不准确——全库 5285 条中仅个位数真有直链下载——本次一并替换为「Banana 搬运」。自有 MOD 库入口不丢失：导航行第一项已是「角色分类」→ `/mods`。

---

## Problem Statement

**Current Situation**：
- 站内内容源只有国内网盘转载，形态单一，且与国内其他转载站高度同质。
- 更新完全依赖主理人手工整理每日日期目录，个人产能即站点产能上限。
- 国际作者的优质 MOD（尤其是英文圈的技术型 MOD、UI 改件、整合包）站内完全不可见。
- 右上角主 CTA「直链下载」名不副实：`download_url` 入库脚本一律写 `null`，实际只有个位数条记录有直链，用户点进去预期落空。

**Proposed Solution**：
新建独立表 `gamebanana_mods` + 独立页面 `/gamebanana`，通过 GameBanana 公开 API（无需 key）每日增量同步鸣潮 MOD 的元数据，站内展示卡片与轻量详情页，下载按钮直转 GameBanana 官方下载链。

**Business Impact**：
- 站内可索引的 MOD 条目从 5285 条扩充到 8000+ 条，且新增一个持续自动增长的内容源。
- 内容更新不再依赖主理人手工产能，日更能力从「人工日更」升级为「人工日更 + 自动日更」。
- 用户体验路径从「必须转存网盘」扩展为「网盘 / 官方直下」两条路。

---

## Success Metrics

**Primary KPIs:**

| 指标 | 目标值 | 测量方式 |
|---|---|---|
| 同步成功率 | ≥ 99% | crontab 脚本退出码 + `synced_at` 连续性，连续 7 天无缺日 |
| 首次种子入库量 | 300 条 | `SELECT count(*) FROM gamebanana_mods` |
| 增量同步新增 | 每日 ≥ 1 条时报正确条数 | 脚本 stdout 输出「新增 N 条 / 更新 M 条」 |
| **真角色归类率** | ≥ 80% 的入库记录落到**具体角色**（排除 `Skins`/`Other/Misc`/`UI` 三个兜底分类） | `SELECT count(*) FROM gamebanana_mods WHERE character NOT IN ('Skins','Other/Misc','UI')` ÷ 总数。**实测基线：2734/3057 = 89.4% ✅**（`analyze-boundary.mjs` 跑全库得到，2026-09-28 定稿）。加上载具功能分类则 **90.5%**。残差 48 条（1.6%）**已逐条看过，无一条是「某角色换装却没认出来」**，全是武器投影 / NPC / 多角色整合包 / 跨作品换模型，落 `Other/Misc` 是正确终态 |
| **真残差（判不出）** | ≤ 5% 且**逐条可解释** | 只有 `判不出`（判定链跑完仍无归属）才算残差：**48 条 = 1.6% ✅**，已逐条看过，全部可归入「多角色贴图 / NPC 怪物 / 武器 / 跨作品换模型 / 标题乱码」，见 `boundary-analysis.md` 第 3 节。**注意口径**：落 `Other/Misc` 的总数是 223 条（非角色 109 + 根分类兜底 66 + 判不出 48），前 175 条是**判定链主动判定为非角色**的，带 `via` 标签，不算残差。若出现归不进任何一类的新词，说明需要补关键词表 |
| **判定链可解释率** | 100%（每条都有 `via` 标签） | `analyze-boundary.mjs` 每次运行输出 `sum check : 3057 == 3057 OK`；3057 条按落点互斥分桶后合计必须等于总数，任何一个桶对不上就说明判定链漏了分支 |
| **误建分类数** | **必须为 0** | 分类越界（下一行）是硬指标；此行的口径是**把非角色内容错建成角色分类**——代价不对称：载具错落 `Other/Misc` 只是少个分类，非角色错建成角色会让前台多出一个空分类页。因此判定链对不确定项一律落 `Other/Misc`，**不猜** |
| **分类越界数** | **必须为 0** | `SELECT character, count(*) FROM gamebanana_mods` 的每个值都必须 ∈ `characterImageMap` 的 64 个 key。任何越界值都会让前台角色分类页长出计划外分类 |

**Validation**：
- 上线后第 1、7、30 天各跑一次上述 SQL 核对。
- 唯一硬性失败信号：**任何一条记录的 `character` 值不在 `characterImageMap` 内** —— 这会让前台角色分类页长出计划外的新分类（见「技术约束 · 分类隔离」）。

---

## User Personas

### Primary: 国内鸣潮玩家（已有用户）
- **Role**：站内现有的下载型用户
- **Goals**：找到能用的角色外观 MOD，快速拿到文件
- **Pain Points**：站内找不到某些国际作者的 MOD；国内网盘需转存 + 可能要提取码
- **Technical Level**：中级（会装 XXMI，但不熟悉国外站点）
- **对本站新功能的核心诉求**：不要让我去注册 / 翻墙 / 看英文；能看到图、能点下载

### Secondary: 找特定国际 MOD 的进阶玩家
- **Role**：已经在用 GameBanana，但希望有中文索引
- **Goals**：按角色快速检索，不想在 GameBanana 的英文分类树里翻
- **Pain Points**：GameBanana 的角色子分类是英文，且大量 MOD 没有子分类（实测约 30%）
- **Technical Level**：高级

### Explicitly NOT a persona: 希望在本站直接下载文件的人
本功能**不提供文件下载**。用户在 `/gamebanana` 点下载会跳到 GameBanana。这是刻意的产品边界，不因用户反馈而改变（见「Out of Scope」）。

---

## User Stories & Acceptance Criteria

### Story 1: 从导航进入 Banana 精选

**As a** 国内鸣潮玩家
**I want to** 从导航栏一眼看到并进入 GameBanana 内容区
**So that** 我知道站内除了网盘转载还有别的内容

**Acceptance Criteria:**
- [ ] 桌面端右上角主 CTA 文案为「Banana 搬运」，图标与现有 `neo-button-primary` 风格一致，指向 `/gamebanana`
- [ ] 移动端抽屉底部同位置同步替换
- [ ] 原「直链下载」文案在 header 中不再出现（桌面 + 移动）
- [ ] 点击后进入 `/gamebanana`，页面标题为「GameBanana 精选」
- [ ] 导航行「角色分类」→ `/mods` 入口不受影响，自有 MOD 库仍可达
- [ ] 后台路由（`/admin/*`）下该按钮维持现状不渲染（header 已有 `isAdminRoute` 分支）

### Story 2: 浏览 GameBanana 精选列表

**As a** 国内鸣潮玩家
**I want to** 在一个页面里浏览 GameBanana 的鸣潮 MOD，并按角色筛选
**So that** 我能快速定位到我关心的角色

**Acceptance Criteria:**
- [ ] `/gamebanana` 展示卡片网格，每张卡片含：预览图、标题、角色标签、作者名、点赞数、浏览数
- [ ] 预览图直接使用 `images.gamebanana.com` 的 530px 档外链
- [ ] 图片加载失败时显示占位图，不出现破图
- [ ] 卡片点击进入 `/gamebanana/[gb_id]` 轻量详情页
- [ ] 提供角色筛选（选项来自库内实际出现的 `character` 值，按 `zh-CN` 排序）
- [ ] 提供排序：最新加入 / 最热（点赞降序）/ 浏览量降序
- [ ] 提供页内搜索框，对标题做模糊匹配
- [ ] 分页或无限滚动，每页 24 条
- [ ] 默认**不显示** `nsfw = true` 的记录，该行为与站内 `/mods` 的 NSFW 开关一致
- [ ] 移动端布局可用（单列 / 双列响应式）

### Story 3: 查看单个 MOD 的事实信息并下载

**As a** 进阶玩家
**I want to** 看一个 MOD 的详情，然后跳到 GameBanana 下载
**So that** 我能判断这是不是我想要的，并拿到文件

**Acceptance Criteria:**
- [ ] `/gamebanana/[gb_id]` 展示：预览图轮播、标题、角色、作者名（链接到作者 GameBanana 主页）、版本号、文件大小、点赞/浏览/下载数、加入日期、内容分级
- [ ] 页面**不展示** GameBanana 上的作者描述正文（`_sText`）
      ⚠️ **待确认**：同步脚本目前把剥标签后的正文存进了 `description` 列（列已建、已写入 288 条）。
      存≠展示，本条约束的是展示；但如果「不复制正文」的本意是连存储也不要，需要把该列去掉或改为不入库。
- [ ] 主按钮「去 GameBanana 下载」，指向 `download_url`（即 `_aFiles[0]._sDownloadUrl`）
      ⚠️ 原写法 `https://gamebanana.com/mods/download/{gb_id}` 已证伪（那是 HTML 中转页），见 Feature 2
- [ ] 次按钮「查看原页面」，指向 `https://gamebanana.com/mods/{gb_id}`
- [ ] 页面显著位置标注内容来源为 GameBanana，并链接到原页面（署名义务）
- [ ] `gb_id` 不存在时返回 404
- [ ] `visibility = 'hide'` 的记录，直接访问详情页时停留在「内容分级」提示，需用户确认后才展示图片

### Story 4: 每日自动同步

**As a** 站点主理人
**I want to** 每天自动拉取 GameBanana 的新 MOD
**So that** 我不需要手工维护这个内容源

**Acceptance Criteria:**
- [ ] 提供 `scripts/sync-gamebanana.mjs`，支持 `--dry-run` / `--seed` / `--pages=N` 参数
- [ ] 默认运行（无参数）= 增量模式：拉最新 2 页，只处理库内不存在的 `gb_id`
- [ ] `--seed` = 种子模式：拉 40 页（2000 条）→ 本地按 `_nLikeCount` 降序 → 取前 300 条入库
- [ ] 增量模式不修改已存在记录的 `created_at`，只更新可变字段（点赞数、浏览数、版本、修改时间）
- [ ] 新记录入库后，脚本 ping `/api/revalidate`（与现有上传脚本同构）
- [ ] 脚本对 GameBanana API 请求间隔 ≥ 300ms，遇 5xx 时退避重试最多 3 次
- [ ] 服务器 crontab 每日执行一次增量模式，日志写入文件
- [ ] 脚本 stdout 输出「新增 N 条 / 更新 M 条 / 跳过 K 条（已存在）/ 失败 F 条」，`F > 0` 时退出码非 0

### Story 5: 角色分类归一化

**As a** 站点主理人
**I want to** 所有入库记录的中文角色名都落在站内既有分类内
**So that** 前台角色分类页不会因为这次接入长出计划外的新分类

**Acceptance Criteria:**
- [ ] 提供纯模块 `scripts/gamebanana-classify.mjs`，导出 `resolveCharacter(gbRecord): { character: string | null, reason: string }`
- [ ] 该模块有 Vitest 单测，覆盖：子分类命中、标题关键词命中、多角色歧义、无法归类
- [ ] 模块内角色映射表的每个目标值**必须**是 `characterImageMap` 的既有 key，单测中断言此约束
- [ ] **完整性断言**：单测遍历 `docs/gamebanana-category-probe.md` 里的全部 57 个子分类，
      断言每个都在 EN→CN 表里有条目 —— 防止将来 GameBanana 新增子分类时静默漏掉
- [ ] **误配回归断言**：`Qiuyuan` → `仇远`（**不是** `千咲`）、`Chisa` → `千咲`、
      `Yangyang: Xuanling` → `玄翎`（**不是** `秧秧`）、`Yangyang` → `秧秧` —— 这三组是共现统计
      实测会出错的点，用单测钉死
- [ ] 无法归类的记录写入 `character = "Other/Misc"`（既有兜底分类），**绝不新建分类**
- [ ] 同步脚本结束时打印未归类清单（标题 + 子分类 + 建议），供主理人人工处理

---

## Functional Requirements

### Feature 1: 独立数据表 `gamebanana_mods`

- **Description**：与现有 `mods` 表完全隔离的新表，避免污染角色分类、兜底快照、每日上传脚本。
- **字段设计**（源 → 目标）：

**✅ 已实现**：建表迁移为 `supabase/add_gamebanana_mods.sql`（2026-09-28 已应用到库，24 列 / 3 索引 / 2 策略）。下表为**实现后的真实列**，与 v1.0 草案的差异见每行「实现修正」标注。

| GameBanana 字段 | 列名 | 类型 | 说明 |
|---|---|---|---|
| `_idRow` | `gb_id` | `integer PRIMARY KEY` | GameBanana MOD id（天然幂等键） |
| `_sName` | `title` | `text NOT NULL` | 保留英文原文，便于回查 |
| `_aSubmitter._sName` | `author_name` | `text` | |
| `_aSubmitter._sProfileUrl` | `author_url` | `text` | |
| `_aRootCategory._sName` | `gb_root_category` | `text` | `Skins` / `UI` / `Other/Misc` … |
| `_aSubCategory._sName` | `gb_subcategory` | `text` | 英文角色名，**实测 410/3057 为空** |
| （归一化结果） | `character` | `text NOT NULL` | 站内中文角色，**必须** ∈ `characterImageMap` |
| `_sText` / `_sDescription` | `description` | `text` | **实现修正**：存**剥标签后的纯文本**。原方案存原 HTML，但那要前台渲染，等于自开 XSS 面 |
| `_aPreviewMedia._aImages` | `images` | `text[] NOT NULL` | **实现修正**：存 URL 数组而非 jsonb 对象数组。原方案存整个对象是为了留各尺寸文件名，但尺寸选择在**写入时**就该定死（见下），存对象只会让前台多一层解析 |
| `_aPreviewMedia._aImages[0]` 的 800 变体 | `cover_url` | `text` | 列表 / 详情首图 |
| `_aFiles[0]._sDownloadUrl` | `download_url` | `text NOT NULL` | **实现修正**：原方案「不建此列、由 id 构造」**已被证伪**，见 Feature 2 |
| `_nLikeCount` | `like_count` | `integer NOT NULL DEFAULT 0` | |
| `_nViewCount` | `view_count` | `integer NOT NULL DEFAULT 0` | |
| `_nDownloadCount` | `download_count` | `integer NOT NULL DEFAULT 0` | **仅 ProfilePage 有** |
| `_sVersion` | `version` | `text` | |
| `_aFiles[0]._nFilesize` | `file_size` | `bigint` | **仅 ProfilePage 有** |
| `_aFiles[0]._sAvResult` | `av_status` | `text` | **实现新增**：GameBanana 自己的文件扫描结论（实测样例 `clean`）。外链下载最缺「这文件安不安全」，透出平台结论比自己写免责声明有用 |
| `_sInitialVisibility` | `visibility` | `text NOT NULL` | **实现修正**：原方案用 `_aContentRatings` 推 `nsfw` 布尔，**实测该字段不可用**（见下） |
| `_tsDateAdded` | `gb_created_at` | `timestamptz` | |
| `_tsDateModified` | `gb_updated_at` | `timestamptz` | |
| — | `synced_at` | `timestamptz NOT NULL DEFAULT now()` | 上次同步时间 |
| — | `is_published` | `boolean NOT NULL DEFAULT true` | 人工下架开关；**同步脚本不覆盖此列** |

- **索引**：`(character)`、`(like_count DESC)`、`(gb_created_at DESC)`。
- **`nsfw` 布尔列已废弃**，改用 `visibility` 三级枚举（`show` / `warn` / `hide`）：
  - 采信 GameBanana **自己**的可见性分级，而不是自己猜 NSFW。
  - 实测交叉验证（全库 3057 条）：标题含 nude/全裸/lewd/nsfw 的 147 条中 **144 条 (98%)** 为 `hide`；工具类 19 条中 15 条 (79%) 为 `show`；反例各仅 1 条。
  - ⚠️ **`_bHasContentRatings` 不可用作 NSFW 信号**：太宽，101 条泳装/比基尼里 **77 条为 true**，按它标会把半个库错标成成人内容。
  - 取不到值时落 `warn` 而非 `show` —— 分级缺失时宁可多提示一次，不可漏放行。
- **Edge cases（含实测修正）**：
  - `_aSubCategory` 为 `null` 或空字符串 → 走标题关键词映射（410/3057，13.4%）。
  - ❌ **原方案「`_bHasFiles = false` → 跳过」作废**：实测 3057 条**全部为 `true`**，该字段没有过滤力。真正有过滤力的是 `_bIsObsolete`（16 条）。
  - **墓碑记录 → 跳过不入库**（**实测新增，原方案完全没预料到**）：GameBanana 删掉文件本体后会留一条记录，文件名为 `the_file_has_been_deleted_with_only_a_record_retained.7z`（**257 字节**），`_sDescription` 写「The file has been deleted, with only a record retained」。不滤掉的话前台会挂一个 257 字节的「下载」按钮。**⚠️ `_bHasContents` 识别不出来（墓碑上仍为 `true`）、`_bIsArchived` 也是 `false`**，只能看文件名/说明，并用「小于 1KB」兜底。实测 seed 300 条命中 **12 条 (4%)**。
  - `_sModelName !== "Mod"` → 跳过（Subfeed 是混合流，实测一页 15 条里只有 5~9 条是 Mod）。
  - `_bIsObsolete = true` → 跳过入库。
  - ~~`_sInitialVisibility = "hide"` 不作为过滤条件~~ → **改为：它就是 NSFW 信号，转成 `visibility='hide'` 存下来**，由前台决定怎么呈现。
- **Error handling（含实测修正）**：单条失败时**必须重试**再跳过 —— 实测 ProfilePage 24 条抽样挂 3 条 (12.5%)，不重试等于静默漏条，而漏条没有任何报错。
  - ⚠️ **重试判据不能只看 HTTP status**：实测请求 `Mod/undefined/ProfilePage` 会返回 **HTTP 200** 带一个缺 `_aFiles` 的残缺 JSON。只看 status 就既不报错也不重试，文件链接/大小/AV 结果**全部静默变空**。必须校验 `payload._idRow === gbId`，不符即当失败重试。

### Feature 2: 下载链接（**原方案已证伪**）

- ~~**Description**：GameBanana 的 MOD 下载链可完全由 id 构造，无需额外 API 调用。~~
- **实测结论（2026-09-28，此前的假设是错的）**：
  - `https://gamebanana.com/mods/download/{gb_id}` 跟随重定向后是 **HTTP 200 + `text/html`（约 22KB 的 HTML 中转页）**，**不是文件**。构造出来的链接点下去只会打开一个网页。
  - 真正的文件链在 **`ProfilePage._aFiles[0]._sDownloadUrl`**，形如 `https://gamebanana.com/dl/1828295`，会 **302 到 `filecache4X.gamebanana.com/mods/xxx.rar|zip|7z`**（带正确 content-type，实测 12/12 全部是真文件，且只需带个 UA 即可热链）。
  - ⚠️ **mod 级的 `_sDownloadUrl` 也是个陷阱**：它返回的正是 `/mods/download/{id}` 那个 HTML 中转页，**不是**文件直链。取字段时必须取 `_aFiles[]` 里的那个同名字段。
  - 结论：**`download_url` 必须逐条调 `ProfilePage` 才有**，无法由 id 构造。原方案「省掉这一列」的立论基础不成立。
- **规则**：
  - 下载（存库）：`ProfilePage._aFiles[0]._sDownloadUrl`
  - 拿不到文件时兜底：`_sProfileUrl`（mod 页面，仍可人工下载）
  - 原页面：`https://gamebanana.com/mods/{gb_id}`
- **验证状态**：✅ 已在 24 条样本上批量复核，并已并入 `scripts/sync-gamebanana.mjs`。

### Feature 3: 页面 `/gamebanana` 与 `/gamebanana/[gb_id]`

- **Description**：列表页 + 轻量详情页，视觉沿用站内现有 neo-brutalism 风格（粗边框、硬阴影、旋转卡片）。列表页为 Server Component，筛选/搜索走 URL 查询参数（与 `src/lib/navigation-url.ts` 的语义判等口径一致），保证可预渲染、可分享链接。
- **User flow**：
  1. 用户点导航「Banana 搬运」→ `/gamebanana`
  2. 默认展示最新，卡片网格，图片懒加载
  3. 选角色 / 搜索 / 排序 → URL 变化 → 服务端重新查询
  4. 点卡片 → `/gamebanana/[gb_id]` 详情页
  5. 点「去 GameBanana 下载」→ 跳转外站
- **Edge cases**：
  - 库为空（同步未跑过）→ 展示引导态，不报错、不空白
  - 外链图片加载失败 → `onError` 切占位图
  - 筛选后无结果 → 空态文案 + 清除筛选按钮
  - 记录已从 GameBanana 删除（跳转 404）→ 详情页保留本站信息，按钮旁提示「原页面可能已失效」
- **Error handling**：查询失败走站内统一的 try/catch 模式，用户侧看到空态而非错误堆栈。

### Feature 4: 同步脚本 `scripts/sync-gamebanana.mjs`

- **✅ 已实现**：`scripts/sync-gamebanana.mjs`。Node 内置 `fetch`，无新依赖。**与 v1.0 草案的差异逐条标在下面**。
- **四个模式（实现后）**：

| 模式 | 行为 | 停机条件 |
|---|---|---|
| `--dry-run` | 抓取 + 分类 + 打印统计与样例，**不写库** | 随所选模式 |
| `--seed=N` | 补 N 条**新的**（默认铺库用 300） | 凑够 N 条新记录 |
| `--all` | 全量补齐（约 405 页 + 3041 次 ProfilePage ≈ 28 分钟） | 翻到末页 |
| 默认（增量） | 从新到旧翻，只补库内没有的 | **整页 Mod 全都已入库** 即停（追平） |

- **实现修正 1 —— 种子不再按热度排序**：v1.0 草案要「翻 120 页 → 本地按 `_nLikeCount` 降序取前 300」。实现改为**取最新的 300 条**（只翻 40 页）。理由：按热度排需要先把 120 页全抓下来才能排名，而热度排序**在全量入库之后就是一条 SQL 查询**（`order by like_count desc`），没必要为铺库多花 3 倍请求。热度榜等 `--all` 跑完再在库里排。
- **实现修正 2 —— 子分类过滤链**：ProfilePage **只对「新的」记录拉**。已入库的旧记录不去重拉，所以增量模式下每次通常只有个位数请求。
- **实现修正 3 —— 并发口径**：Subfeed 翻页是**串行**的（一页一页来）；**只有 ProfilePage 用 6 路并发池 + 最多 3 次退避重试**。这是有意的：请求量大的是 ProfilePage（seed 300 要 300 次），翻页最多 405 次且只在 `--all` 时发生。实测 6 路 + 重试下 300 次 ProfilePage 用时约 86 秒。
- **实现修正 4 —— 批写入**：每 200 行一条 `insert ... on conflict (gb_id) do update`（`jsonb_populate_recordset` 解析）。`is_published` 与 `created_at` **不在更新列里** —— 前者是人工下架开关、后者是首次入库时间，重跑都不该覆盖。`character` 每次重算，这是故意的：分类规则改了以后重跑即生效。
- **API 事实**（**全部实测确认**，见 `docs/gamebanana-category-probe.md` 第 0 节，实现时不要再猜）：
  - 端点：`https://gamebanana.com/apiv11/Game/20357/Subfeed?_nPage=N&_sSort=X`
  - 详情：`https://gamebanana.com/apiv11/Mod/{gb_id}/ProfilePage`
  - **无需 API key**
  - ⚠️ **必须按 `_sModelName === "Mod"` 过滤** —— Subfeed 是混合流，3057 条 Mod 之外还有 1984 条 Question、702 条 Request 等
  - ⚠️ **分页参数无效**：`_nPerPage` / `_nPerpage` / `_per_page` / `_nLimit` 实测**全部被忽略**，硬编码 **15 条/页**。全量遍历 = 405 请求，无捷径
  - ⚠️ **`_sSort=default` 排序在翻页过程中会变** —— 实测 338 页里 18 条记录重复出现在两个不同页上，有重复就必然有漏取。**遍历一律用 `_sSort=new`**（严格时间倒序）
  - `_sSort` 仅接受 `default` / `new` / `updated`；`popular` / `likes` / `downloads` / `best` **返回 400**，服务端不支持按热度排序
  - Subfeed **不含** `_aFiles`、`_sDownloadUrl`、`_nDownloadCount` —— 这些只在 `ProfilePage` 里
  - Subfeed **含** `_nLikeCount`、`_nViewCount`、`_nPostCount` —— 所以热门排序在本地做
  - 全站 feed 记录总数 `_nRecordCount = 6075`（其中可入库 Mod 3057 条）
  - ⚠️ **`_bHasFiles` 无过滤力**：实测 3057 条**全为 true**。要滤的是 `_bIsObsolete`（16 条）
  - ⚠️ **详情页会返回「HTTP 200 的残缺 JSON」**：请求不存在的 id 时不是 404，而是 200 带一个缺 `_aFiles` 的 payload。**必须校验 `_idRow` 与请求 id 一致**，否则静默丢字段（实测踩过：字段名写错导致 300 条全部丢掉文件链接、大小、AV 结果，且零报错）
  - ⚠️ **墓碑记录**：文件被删后 GameBanana 留一条 257 字节的记录（`the_file_has_been_deleted_with_only_a_record_retained.7z`），`_bHasContents` 仍为 `true`、`_bIsArchived` 为 `false`，**两个直觉字段都识别不出来**。只能匹配文件名/说明 + 「小于 1KB」兜底。实测 300 条里 12 条 (4%)
  - ⚠️ **图片尺寸不是每条都有**：只有**首图**有全套 100/220/530/800，第 2 张起常常**只有 `_sFile100`**。必须逐级退化 `530 → 220 → 100 → 原图`，写死 `_sFile530` 会拼出 404（前台是坏图，不报错）
- **Rate limiting**：ProfilePage 6 路并发 + 最多 3 次指数退避（1s/2s/4s）。UA 写明 `WaveMod/1.0 (+https://www.wave-mod.top)` —— 公开 API 上写清身份、附上站点，出问题时对方找得到人。
- **数据库写入**：走现有的 `scripts/psql-db.mjs` 直连通道（Supabase 网关超配额时仍可用，见 `docs/` 相关记录），不用 supabase-js。
- **Edge cases**：网络中断 → 已入库的部分保留，重跑时靠 `gb_id` 主键幂等跳过；GameBanana 全站不可达 → 退出码非 0，crontab 日志可见，不影响站内其余功能。
- **Error handling**：每条记录独立 try/catch；失败计数 > 0 时退出码非 0 但仍提交已成功部分。

### Feature 5: 分类模块 `scripts/gamebanana-classify.mjs`

**Phase 0 已完成**（2026-09-28）。普查脚本 `scripts/probe-gamebanana-categories.mjs` 已跑完并产出
`docs/gamebanana-category-probe.md`。实测结论：**3057 条可入库 Mod，其中 2647 条（86.6%）自带角色子分类**，
只有 410 条（13.4%）需要靠标题判定。

> ⚠️ **「有子分类」不等于「已归类」。** 子分类名是英文的（`Changli` / `Cartethyia`），
> 必须过一遍 EN→CN 表才算落到站内角色。57 个子分类里 **36 个拿到了数据内证据**，
> 另 20 个按官方译名补全、1 个混合桶不映射。差别就在这些未确证子分类上 ——
> 只跑有证据的 36 个时归类率是 79.4%，补全后才到 **89.4%**。

**⚠️ 2026-09-28 修正：判定链的第一顺位是「英文子分类」，不是「中文标题名」。**

初稿假设「大量 MOD 标题是中英双语的，中文名直接写在标题里」，据此把中文匹配排在第一顺位。
`scripts/logs/gamebanana/analyze-boundary.mjs` 跑完全库 3057 条后**推翻了这个假设**：

| 记录类别 | 条数 | 其中标题含中文 | 占比 |
|---|---|---|---|
| 自带角色子分类 | 2647 | 446 | **16.8%** |
| 无子分类 | 410 | 49 | **12.0%** |

中文标题只占一成多 —— 中文作者不爱填子分类，所以中文标题**反而集中在那 410 条里**；
而有子分类的 2647 条绝大多数是纯英文标题。若把中文匹配放第一位，等于用 16.8% 的信号去处理
全部数据，**实测真角色归类率只有 71.7%，达不到 80% 的 KPI**。

**正确的判定顺序**（`analyze-boundary.mjs` 已按此实现并跑通）：

1. **英文子分类 → 中文（最强信号，2647 条走这条）** —— 查 EN→CN 表。
   这张表是**本功能的核心资产**，做法是「拿英文角色名去全库标题里搜，看最常同现的中文 key 是谁」，
   用中英双语标题（`珂莱塔黑丝睡衣-Carlotta-black stockings pajamas`）当证据。
   57 个子分类中 **36 个拿到 ≥2 条同现证据**，可直接采信；**20 个零/单证据**，
   按鸣潮官方中英译名补全；1 个混合桶不映射。
   **表已落成 `docs/gamebanana-character-map.md`（进仓库，逐条带证据）。**
2. **标题中文名匹配**（针对子分类为空、或子分类未入表的记录）—— 找 `characterImageMap` 的 key。
3. **标题英文名匹配** —— 用第 1 步得到的 EN→CN 表回扫标题。
4. **非角色内容识别** —— 特效/去遮挡/画质/工具/立绘/UI/NPC 类关键词。
   这类**本来就不属于任何角色**，落 `Other/Misc` / `UI` 是正确的，不是分类失败。
   实测全库有 **151 条（4.9%）** 属于这类（另 34 条载具走站内现成分类，见下）。
5. **根分类兜底** —— GameBanana 自己就把 `UI` 与 `Other/Misc` 分开了，直接沿用。
6. **最后兜底** → `Other/Misc`。**绝不新建分类。**

> 判定链的完整实现与逐条证据见 `scripts/logs/gamebanana/boundary-analysis.md`（本机留档，不进仓库）。

**两个必须做拆分的特例**（站内已有独立分类，且 GameBanana 数据里确实两类都大量存在）：

- **`芙露德莉斯` vs `卡提希娅`**：GameBanana 把这些混在 `Skins >> Cartethyia` 里，
  实测标题如 `Cartethyia & Fleurdelys Nyx NSFW`、`Bunnysuit Cartethyia + Reverse Fleurdelys`、
  `Fat Fleurdelys & Cartethyia`、`一直期待的大卡小卡来啦~~[ZH]`。
  规则参照既有的 `scripts/daka-classify.mjs`（同样处理「大卡 → 芙露德莉斯」）：
  标题含 `Fleurdelys` / `fuludelisi` / `大卡` → `芙露德莉斯`；含 `Cartethyia` / `小卡` → `卡提希娅`；
  两者都含（如 `Cartethyia & Fleurdelys`）→ **归 `芙露德莉斯`**，并在报告里单独列出这类记录人工抽查。
- **`爱弥斯的机甲` vs `爱弥斯`**：实测 `3.2LODFIX小爱机甲~AemeathMecha`、`Simple Thicc Ameath Exo`、
  `爱弥斯-机甲-大天使-序列029`。标题含 `机甲` / `Mecha` / `Exo` → `爱弥斯的机甲`。

> ✅ **两条特例均已在 `analyze-boundary.mjs` 实现并跑通**（2026-09-28）：实测
> `芙露德莉斯` 41 条 / `卡提希娅` 59 条 / `爱弥斯的机甲` 4 条 / `爱弥斯` 69 条。
> **这两条规则必须排在「子分类查表」之前** —— 否则 `Skins >> Cartethyia` 的 89 条会被整批糊成
> 卡提希娅、`Skins >> Aemeath` 的 69 条会被整批糊成爱弥斯，特例静默失效。

**⚠️ 子分类 `NPCs & Entities` 只能当末位兜底，不能一进门就短路**（2026-09-28 实测发现）。

主理人口径「NPC / 怪物归 `Other/Misc`」成立，但 GameBanana 这个子分类是**混合桶**：
实测 24 条里混着 `Baizhi's Smaller You'tan Familiar`（→`白芷`）、
`Character Themed Bike (Itansha)` 与 `摩托-幻彩虹翎`（→载具）、
`Fleurdelys-Virtuosa`（→`芙露德莉斯`）、`Gladiator's Portrait Thicc`（→`UI`）。
把它放在判定链**最前面**会把这 6 条静默吞成一个值，**且不报错**。
正确做法：走完整条链后仍未命中，才落 `Other/Misc` —— 真正的 NPC 自然会走到那一步。

**载具类走站内现成分类**（主理人 2026-09-28 决定）：摩托 / 滑翔翼 / 翅膀类 mod 归
`滑翔翼,翱翔翼,科考摩托`（站内既有功能分类，实测 34 条）。实现注意：**载具规则必须排在武器规则前面**，
否则 `Alpha's Motorbike` 这类会先被武器规则吃掉。
⛔ **`Woju` 是作者名，不是载具系列 —— 千万不要把 `woju` 加进载具正则。**
全库 64 条以 `Woju` 开头：41 条是角色换装、**19 条是武器 / 特效**、4 条是载具。
加进去会让那 19 条武器 / 特效整批错归进 `滑翔翼,翱翔翼,科考摩托`。
真正的载具靠 `glider` 就能抓到（`Woju - Fantasy Glider` 等 4 条已正确归类）。

唯一还悬着的是 4 条 `Hover` / `Rider`（`Woju - Scarlet Night Rider` 67 赞、`Woju - Hover Pumpkin`、
`Woju - Bumblebee Rider`、`Woju - Hover Droid Iron Man`）—— `Scarlet Night` 是长离皮肤名，
疑为配套摩托涂装。要捞得加收紧的 `\brider\b|hover`（`Inferno Rider` 是 boss，会误命中）。
**影响面 4 条，留在 `Other/Misc` 完全安全，故不动。**

**约束**（用单测钉死）：
- 映射表目标的每个值必须 ∈ `characterImageMap` 的 64 个 key，**不得新建 character**（CLAUDE.md 硬规则）
- 无法归类的一律落 `Other/Misc`，**不是**猜测性归到某个角色
- 同步脚本结束时打印未归类清单与越界清单，供主理人人工处理

**✅ 主理人确认项已全部闭环**（2026-09-28）：EN→CN 表 20 行签字、工具类/NPC 类落点、
`Skins >> (空)` 落点、载具走现成分类 —— 见 PRD 末尾「Known Blockers」。
唯一开口：4 条 `Hover` / `Rider`（`Woju - Scarlet Night Rider` 等）是否算载具 ——
影响面 4 条、留在 `Other/Misc` 完全安全，**默认不动**；详见下一节的 ⛔ 警告。

### Feature 6: 导航按钮替换

- **Description**：`src/components/layout/site-header-client.tsx` 中两处「直链下载」按钮（桌面行 310-313、移动抽屉 449-456）改为「Banana 搬运」→ `/gamebanana`。
- **Edge cases**：移动端抽屉点击后需 `setMobileOpen(false)`（现有模式需要保留）。
- **Error handling**：无。

### Out of Scope（明确不做）

- ❌ **不搬运、不转发、不镜像任何 GameBanana 的 MOD 文件**（授权原因，见 Executive Summary）
- ❌ **不复制、不展示** GameBanana 上的作者描述正文 `_sText`
- ❌ **不下载 GameBanana 的预览图到 COS**（直接外链，见技术约束）
- ❌ 不支持收藏 / 点赞 / 评论 / 评分（独立表挂不上现有 `favorites` 外键）
- ❌ **不打通站内搜索**：`/gamebanana` 有自己的搜索框，站内 `/mods` 的搜索结果不含 Banana 内容
- ❌ 不接入除鸣潮外的其他游戏（GameBanana 上原神 / 绝区零专区本次不做）
- ❌ 不做 GameBanana 作者入驻 / 认领
- ❌ 不做自动翻译（标题保持英文原文）

---

## Technical Constraints

### Performance
- `/gamebanana` 列表页首屏服务端查询 < 300ms（单表 + 索引，无跨表联查）
- 页面走 ISR 预渲染 + `revalidate`，与站内 `/mods` 同策略；写库后 ping `/api/revalidate` 失效缓存
- 外链图片懒加载，不阻塞首屏
- 单次增量同步（2 页 + 少量 Detail 请求）在 10 秒内完成

### Security
- 不接收任何用户输入的外部 URL，下载链全部由服务端按 `gb_id` 拼装，杜绝开放重定向
- `gb_id` 参数做整数校验，非法值直接 404
- 同步脚本使用现有的数据库直连凭据，不新增密钥
- 内容分级（`nsfw`）默认屏蔽，遵守站内既有策略

### 分类隔离（本项目最关键的约束）
- `gamebanana_mods` 是**独立表**，不写入 `mods`。
- 因此 `getAvailableCharacters()`（`src/lib/mods-domain/public.ts`）的 `distinct character` 查询**不会**读到 Banana 数据，前台角色分类页不会因此长出计划外分类。
- 兜底快照：`mods` 那份（`scripts/mods-snapshot.sql`）**仍然只导出 `mods` 表**，本功能不参与，那份快照的体积和 shape 都不变（JASM 桌面端共用它，不能动）。
  本功能**另有一份独立快照** `snapshots/gamebanana-snapshot.json.gz`（打包内 `data/gamebanana-snapshot.json.gz`，SQL 见 `scripts/gamebanana-snapshot.sql`），
  由 `scripts/gamebanana-snapshot.mjs` 生成，`sync-gamebanana.mjs` 收尾自动发。发布路径与排查见 `docs/disaster-recovery.md` 第 10 节。
- 每日上传脚本（`scripts/upload-daily-by-date.mjs`）的去重键是 `mods.character|title`，与本表完全无交集，**不会互相干扰**。
- 即便如此，`gamebanana_mods.character` 仍**强制要求**落在 `characterImageMap` 内 —— 因为将来若把两个数据源合并展示，越界值会立刻泄漏到前台。用单测把这条约束钉死。

### Integration
- **GameBanana API v11**：公开读接口，无需 key，已验证从本机与目标网络可达。官方未提供公开的 rate limit 文档，脚本按保守策略（300ms 间隔 + 退避重试）设计。
- **腾讯云 COS**：本功能**不使用**（图片走外链）。这是刻意的：既避免重传作者截图的版权问题，也避免 COS 存储与流量成本。
- **Supabase Postgres**：新增一张表 + 迁移脚本，不修改任何现有表。
- **`/api/revalidate`**：复用现有端点。

### Technology Stack
- 沿用 Next.js 15 App Router + TypeScript strict + Tailwind + shadcn/ui
- 同步脚本：Node 内置 `fetch`，**不引入新依赖**
- 分类模块：纯函数 + Vitest 单测（符合 CLAUDE.md 的 TDD 优先与「纯模块 + 单测」惯例，参照 `scripts/daka-classify.mjs`）

---

## MVP Scope & Phasing

### Phase 0: 分类普查 ✅ **已完成（2026-09-28）**
1. ✅ `scripts/probe-gamebanana-categories.mjs` 已跑完 —— 405 页全量、覆盖 99.6%、0 页失败
2. ✅ 产出 `docs/gamebanana-category-probe.md`：3057 条可入库 MOD 的完整分类分布
3. ✅ `analyze-boundary.mjs` 跑出 EN→CN 表与判定链实测，产出 `docs/gamebanana-character-map.md`
4. ✅ **全库 3057 条跑通**：真角色归类率 **89.4%**（2734 条），真残差 48 条（1.6%）
5. ✅ **表中 20 个 `human` 条主理人已逐行确认**（2026-09-28「都对了」）—— 见「Known Blockers」第 1 项
6. ✅ 两条特例（大卡/小卡、爱弥斯/机甲）已实现并跑通；残差已逐条复核，无假阴性
7. ✅ **抽样复核完成，结论是原假设被证伪** —— `https://gamebanana.com/mods/download/{id}` 跟随重定向后是 **HTTP 200 + `text/html` 的中转页，不是文件**。真链在 `ProfilePage._aFiles[0]._sDownloadUrl`（24 条抽样 12/12 是真文件）。已据此改写 Feature 2 与建表迁移

**Phase 0 的结论**：判定链的设计**被数据推翻并重写过一次** —— 初稿的「中文优先」实测只有 71.7%，
现在是「子分类优先 + EN→CN 表」，实测 89.4%。36 个条目有双语标题硬证据；
剩下 20 个按官方译名补全，**主理人已于 2026-09-28 逐行签字**。

### Phase 1: MVP（可上线）
1. ✅ **EN→CN 表已定稿** —— `docs/gamebanana-character-map.md`（36 个有证据 + 20 个主理人 2026-09-28 确认 + 1 个不映射），可直接作为第 3 步分类模块的输入
2. ✅ **`gamebanana_mods` 建表迁移已应用** —— `supabase/add_gamebanana_mods.sql`（24 列 / 3 索引 / 2 策略 / RLS 已开）
3. ✅ **`scripts/gamebanana-classify.mjs` + 41 条单测** —— 全库 3057 条复现 89.4%
4. ✅ **`scripts/sync-gamebanana.mjs`** —— `--dry-run` / `--seed=N` / `--all` / 增量四模式
5. ✅ **已跑 `--seed=300`** —— 实际入库 **288 条**（300 减 12 条墓碑），字段零缺失、42 个角色全在值域内、`gb_id` 无重复；**重跑增量 = 0 新增**（幂等验证通过）；`upload-daily-by-date.mjs --dry-run` 回归 **待上传 0 条**
6. `/gamebanana` 列表页（卡片网格 + 角色筛选 + 排序 + 搜索）
7. `/gamebanana/[gb_id]` 轻量详情页
8. header 桌面 + 移动两处按钮替换
9. 服务器 crontab 配置每日增量
10. 验收入口：库里 `character` 全部 ∈ `characterImageMap`；`/gamebanana` 可访问；`/mods` 无任何回归

**MVP 定义**：用户能从导航进入 `/gamebanana`，看到 300 条真实 GameBanana MOD，按角色筛，点进详情，点下载跳到 GameBanana。

### Phase 2: 增强（上线后）
- 首页加「来自 GameBanana 的热门」板块（注意：首页有 scroll-snap 与高度变量，属高风险区，需单独评估）
- 把 Phase 0 普查结果（全量 3057 条的 `_idRow` + `_nLikeCount`）落成一份进仓库的 JSON，
  种子与排序即可按**全站真实热度**算，不再受「只看到最新 900 条」的限制
- 定期把已入库记录的点赞/浏览量刷新（当前只在新记录入库时写一次）
- **处理「入库后源文件被删」**：同步脚本只对**新** id 拉 ProfilePage，所以一条已入库的记录若日后在 GameBanana 被删（变墓碑），我们库里那条会**永远留着死链**且不会被发现。需要加一个 `--refresh-existing` 之类定期回扫（顺带解决上一条的点赞刷新）
- 详情页补 `_aFiles` 多文件展示（当前只取 index 0 的主文件，多文件 mod 的备选版本没有透出）

### Future Considerations
- 扩展到原神 / 绝区零的 GameBanana 专区
- 主理人对高价值 MOD 手工补国内网盘链接（此时才涉及文件，需逐条确认授权）
- 中英标题对照

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|---|---|---|---|
| **授权争议**：用户在站内看到 MOD 后误以为本站提供文件，或作者认为本站转载了其内容 | 中 | 高 | 页面显著标注「内容来自 GameBanana，本站不存储文件」，下载按钮明确写「去 GameBanana 下载」，详情页署名并链回原页；**绝不下载文件、绝不重传截图** |
| **角色分类越界**：标题映射模块猜错，产生 `characterImageMap` 之外的值 | 中 | 高 | 单测里硬断言映射表 ⊆ `characterImageMap`；同步脚本结束时打印越界清单并非 0 退出；映射不确定的一律归 `Other/Misc` 而非新造 |
| **外链图片在国内加载慢或不可达** | 中 | 中 | 图片 `onError` 切站内占位图；若长期体验差，Phase 2 再评估对高价值 MOD 单独转存 COS |
| **GameBanana API 变更或限流** | 低 | 中 | 脚本失败不影响站内其余功能；已入库数据照常展示；错误日志可见；分类映射表与 API 解耦，API 格式变了只需改解析层 |
| **热门排序不准**：服务端不支持按热度排，种子只能从最新 900 条里挑 top 300 | 高 | 低 | Phase 0 的普查已抓到**全量 3057 条**（含 `_nLikeCount`），把它落成一份进仓库的 JSON，种子即可按**全站真实热度**排序，此风险直接消除 |
| **分页漂移导致漏取**：Subfeed 翻页期间若有新投稿，后续页整体位移 | 中 | 低 | 遍历一律用 `_sSort=new`（严格时间倒序）并按 `_idRow` 去重；增量模式固定拉 5 页形成重叠窗口，漏掉的下一天自愈 |
| **每日上传脚本被误伤** | 低 | 高 | 独立表 + 无交集去重键，理论上零影响；上线后按 CLAUDE.md 要求跑一次不带 `--dates` 的 `upload-daily-by-date.mjs --dry-run`，确认「待上传 = 0」 |
| **crontab 静默失败**：脚本挂了但没人知道 | 中 | 中 | 脚本非 0 退出码 + 写日志文件；每周看一眼日志；Phase 2 可加通知 |

---

## Dependencies & Blockers

**Dependencies:**
- **GameBanana API v11**：外部依赖，无 SLA。已验证可用（实测 2026-09-28）。
- **`characterImageMap`**（`src/lib/constants/character-images.ts`）：64 个标准角色 key 是本功能分类的**唯一合法取值域**。
- **`scripts/psql-db.mjs`**：现有数据库直连通道。
- **`/api/revalidate`**：现有缓存失效端点。

**Known Blockers:**
Phase 0 普查已把原先的未知项全部消掉：`Iuno` → 尤诺（证据 `Iuno 尤诺-慵懒清晨`）、
`Hiyuki` → 绯雪（证据 `绯雪-国韵·落红-序列042`，且是该子分类最高赞）、`Galbrena` → 嘉贝莉娜、
`Lucilla` → 洛瑟菈、`Mornye` → 莫宁、`Denia` → 达妮娅、`Lumi` → 灯灯、`Lucy` → 露西、
`Yangyang: Xuanling` → 玄翎、`Luuk Herssen` → 路赫斯（站内写法，GameBanana 写作「陆·赫斯」）。

> ### ⚠️ 已撤回的一条错误结论
>
> 初稿写的「`Aalto` 站内 64 个角色里没有」**是错的**。`characterImageMap` 实有 64 个 key，
> 其中**含 `秋水`** —— `秋水` 就是 Aalto 的中文名。`Skins >> Aalto` 的 7 条正常归 `秋水`，
> **不需要任何新分类**。（教训：动到「不存在」的判断前，先 grep 一遍源文件的 key。）

**仍需主理人拍板的情况**（条数均为 `analyze-boundary.mjs` 实测，非估算）：

| # | 情况 | 条数 | 建议 |
|---|---|---|---|
| 1 | ~~**`human` 那 20 行待确认**~~ —— ✅ **主理人 2026-09-28 逐行确认「都对了」**（含 `Qiuyuan`→`仇远`、`Yangyang: Xuanling`→`玄翎`、`Aalto`→`秋水` 三个统计会答错的点） | — | 已闭环，**EN→CN 表定稿** |
| 2 | **`Qiuyuan` 误配已修正为 `仇远`** —— 共现统计原本判给 `千咲`，是 `Qiuyuan-Jingran` 这条多角色混搭 mod 污染了统计。`Chisa` 才是千咲，两条都已钉进单测 | 23 | 已修，仅需知悉 |
| 3 | **`NPCs & Entities`** —— 混合桶，实测含 `Thicc Hyvatia` / `Simple Thicc Ameath Exo` 等互不相关条目，英文名池子为 0 | 24 | 归 `Other/Misc`，或逐条人工拆 —— 需确认 |
| 4 | **武器类** —— 站内**没有武器分类**。实测残差里最大一坨就是武器投影 mod（`Emerald of Genesis` / `Static Mist` / `Cosmic Ripples` 等 WuWa 武器名，标题里根本不出现 "weapon" 这个词，所以初稿只估到 15 条） | 约 60 条 | 归 `Other/Misc` —— 需确认。有角色名的武器 mod 会正常归到该角色 |
| 5 | **工具类** —— `No Reload Mod Manager`(赞 1728)、`WuWa Mod Manager`、`Reshade Preset`、`WUWA Image Quality Improvement` 等。初稿估「100+」，**实测全库仅 12 条** | 12 | 归 `Other/Misc`，或**直接不收** —— 需确认口径。注意其中几条赞数很高，不收会损失热门条目 |
| 6 | **`Skins >> (空)` 那 169 条** —— 走完整判定链后落不下的进 `Other/Misc`；实测这批里绝大多数是**非角色内容**（武器/去雾/去遮挡/立绘/头像），落 `Other/Misc` 本就是对的 | 169 | 接受 `Other/Misc` —— 需确认 |

- **`_sInitialVisibility = "hide"` 的含义未查明**。实测一条正常可见、可下载的 MOD（Qingxiao - Crimson Blossom Decree）带此标记，故**不作为过滤条件**。若后续发现它确实代表隐藏，需回补过滤。

---

## Appendix

### Glossary
- **GameBanana**：全球最大 MOD 社区，每条 MOD 自带作者授权清单
- **Subfeed**：GameBanana 的列表接口，返回 MOD 摘要，**不含**下载链与内容分级
- **ProfilePage**：GameBanana 的详情接口，含下载链、文件信息、内容分级、作者描述
- **license checklist**：每条 MOD 的授权三分类 —— `yes`（可直接做）/ `ask`（需征得作者同意）/ `no`（禁止）。「Redistribute this Mod on other sites」实测落在 `ask`
- **`gb_id`**：GameBanana 的 MOD 主键（`_idRow`），本功能的外部唯一标识
- **`characterImageMap`**：站内 64 个标准角色分类的权威清单
- **去重键**：每日上传脚本用 `character|title` 判重，本功能用 `gb_id` 判重，两套互不干扰

### References
- GameBanana API 端点（实测）：
  - `https://gamebanana.com/apiv11/Game/20357/Subfeed?_nPage=1&_sSort=default&_nPerpage=50`
  - `https://gamebanana.com/apiv11/Mod/{gb_id}/ProfilePage`
- 站内相关文件：
  - `src/components/layout/site-header-client.tsx`（按钮替换点：310-313 / 449-456 行）
  - `src/lib/constants/character-images.ts`（64 个标准角色）
  - `src/lib/mods-domain/sorting.ts`（`normalizeCharacterName` / `CHARACTER_ALIASES`，映射模块的写法参照）
  - `docs/gamebanana-character-map.md`（**EN→CN 映射表，本功能的核心资产**，进仓库、逐条带证据）
  - `scripts/logs/gamebanana/analyze-boundary.mjs`（生成上表的脚本，只读缓存、不联网；本机留档）
  - `scripts/daka-classify.mjs`（纯分类模块 + 单测的既有范例）
  - `scripts/psql-db.mjs`（直连写库通道）
  - `CLAUDE.md`（「不得新建 character」硬规则）

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
