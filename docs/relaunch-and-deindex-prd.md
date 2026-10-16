# Product Requirements Document: 主站恢复上线 + 搜索引擎去索引 + 站内文案中性化

**Version**: 1.0
**Date**: 2026-10-15
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

WaveMod 主站于 2026-10-13 主动关站：服务器 nginx 把三个入口（`wave-mod.top` / `www.wave-mod.top` /
`go.sunnyrose.xyz`）整站改成 `return 410` 并加 `X-Robots-Tag: noindex`，PM2 进程 `wavemod` 停掉，
目的是用 **410 Gone（去索引最快的信号）** 把站点从搜索引擎索引里清掉。

现在需求反转了一半：**站点要恢复给社群访问，但绝不能重新被搜索引擎收录**，同时把站内文案里
「鸣潮」「MOD」等敏感字样换成中性表述。此外，JASM 客户端内置的 Mod 市场当前**空白/加载失败**，
需要恢复取数。

这三个目标之间存在一个**直接冲突**，是本 PRD 的核心：恢复成 HTTP 200 的瞬间，爬虫会重新抓取并
**重新收录**，此前 410 的成果作废。因此本次不是「撤销关站」，而是**换一套机制**——从
「410 删除」改为「200 可达 + 全站 `noindex` 且保持可抓取」。同时必须在代码层同步落地 noindex、
改造 robots 策略、并给文案定稿，否则站点一上线就会带着「鸣潮MOD」的标题被重新收进去。

---

## Problem Statement

**Current Situation**

1. **站点完全不可访问**：`/etc/nginx/sites-available/wavemod` 与 `wavemod-alt` 的 443 反代块
   （`www.wave-mod.top`、`go.sunnyrose.xyz`）已被改为 `return 410;`，apex 同样 410；PM2 里
   `wavemod` 为 **stopped**、3000 端口无监听。备份在服务器 `/root/nginx-backup-20261013`。
2. **索引仍在消退中**：410 已生效，但 Google / 百度索引通常需要 2–4 周才清干净，且此前
   Search Console / 百度搜索资源平台的**主动移除请求一直没提交**（需用户账号）。
3. **代码里仍带着敏感文案**：`src/app/layout.tsx:49-55` 的 `metadataBase` 下，站点默认标题是
   **「鸣潮角色MOD个人站」**，description 里写着「专注鸣潮角色 MOD 的个人站」；
   `src/features/tutorial/tool-download.ts:19-20` 的面板说明含「鸣潮 mod 修复工具」。
4. **JASM 市场空白**：客户端市场页能打开但取不到数据。其数据源在
   `JASM_Manger/JASM/src/GIMI-ModManager.WinUI/appsettings.json` 中配置为 Supabase REST
   （`izxivkmgtrkkpxtedeco.supabase.co`）+ **自身独立的** COS 兜底快照
   （`jasm-modenv-1327973389.cos.ap-guangzhou.myqcloud.com/market1/mods-snapshot.json.gz`）。
   **重要结论：JASM 市场不依赖 wave-mod.top**，主站关站不是它坏掉的原因；怀疑是 Supabase
   出口配额超限导致 HTTP 网关对 REST 一律回 **402**，只剩 COS 快照这条线可用。

**Proposed Solution**

四条并行工作流：

- **A. 站点恢复上线**：nginx 反代块由 `return 410` 改回 `proxy_pass 127.0.0.1:3000`，启动 PM2
  `wavemod`，部署**当前 `feat/neumorphism-theme` 分支工作区**（含未提交的新拟物主题改动）。
- **B. 去索引改造**：全站输出 `noindex, nofollow`（Next `metadata.robots` + nginx `X-Robots-Tag`
  双保险），**并保持页面可被爬取**（不做 `Disallow: /`），让爬虫能读到 noindex 并放弃收录。
- **C. 文案中性化**：把「鸣潮」「MOD/mod」等字样替换为中性词，改默认站名与 description。
- **D. JASM 市场取数恢复**：将市场取数**改为只读 COS 快照**，彻底绕开 Supabase HTTP 网关，
  不再受 402 影响。

**Business Impact**

- 社群恢复可用（有链接的人能正常访问、下载、看教程），同时把「被搜索引擎搜到」这一**法律暴露面**
  压到最低。
- JASM 市场恢复可用，桌面端用户不再面对空白页。
- 代价：noindex 生效需要爬虫重新抓取，期间旧搜索结果**仍可能短暂出现**（见 Success Metrics 的
  口径说明）。

---

## Success Metrics

**Primary KPIs:**

- **去索引可验证性（本次采用的口径）**：`https://www.wave-mod.top/` 及任选 5 个子路径
  （首页、`/mods`、`/[game]/mods`、教程页、任意 `/mods/[id]`）的 **HTTP 响应头**中，
  `X-Robots-Tag` 含 `noindex`；且该 5 个页面的 HTML `<head>` 中含
  `<meta name="robots" content="noindex, nofollow">`。**5/5 全中 = 通过。**
- **robots.txt 不再阻断抓取**：`/robots.txt` 响应中**不存在** `Disallow: /`；用于让爬虫能读到
  noindex。（验收方式同上，按响应体断言。）
- **文案零敏感词**：对 `src/app/**`、`src/features/**`、`src/components/**` 下所有含中文的
  用户可见字符串做一次全量检索，`鸣潮`、`MOD`（含小写 `mod` 作为独立词）**命中数为 0**，
  白名单除外（见 Appendix 的例外清单）。
- **站点可达**：三个入口中至少 `www.wave-mod.top` 与 `go.sunnyrose.xyz` 返回 **200** 且能渲染首页。
- **JASM 市场恢复**：客户端市场页能加载出 mod 列表（非空白、非报错）。

**Validation**：以 `curl -I` 断言响应头、以 `curl -s` 断言 robots.txt、以 `rg` 全量扫文案、
以 PM2 状态 + 页面渲染断言可达性。**不做** Google/Baidu `site:` 实测，也**不提交**
Search Console 移除请求——本次验收只到「响应头/元数据」层（用户 2026-10-15 明确选择）。

---

## User Personas

### Primary: 现有社群成员（持链接用户）
- **Role**: 通过社群/朋友拿到过本站链接的用户
- **Goals**: 能重新打开站、找角色外观资源、看安装教程、拿网盘直链
- **Pain Points**: 站现在 410 打不开；恢复了又担心随时再关
- **Technical Level**: 新手到中级

### Secondary: JASM 客户端用户
- **Role**: 装了 JASM mod 管理器的桌面用户
- **Goals**: 在市场里浏览/搜索外观资源，一键拿到下载链接
- **Pain Points**: 市场空白、加载失败
- **Technical Level**: 中级

### Tertiary（不作为本次服务对象，仅约束条件）: 搜索引擎爬虫
- **Role**: 持续回抓本站索引的爬虫
- **约束**: 必须让它们**能抓但抓不到可收录内容**——即读得到 noindex。

---

## User Stories & Acceptance Criteria

### Story 1: 站点恢复访问

**As a** 持链接的社群成员
**I want to** 重新打开 wave-mod.top 正常浏览
**So that** 我能继续找外观资源看教程

**Acceptance Criteria:**
- [ ] `curl -I https://www.wave-mod.top/` 返回 **200**（不是 410/502）
- [ ] `https://go.sunnyrose.xyz/` 同样返回 200
- [ ] PM2 `wavemod` 状态为 **online**，`127.0.0.1:3000` 有监听
- [ ] 首页能渲染（含当前 `feat/neumorphism-theme` 工作区的新拟物主题）
- [ ] 证书（certbot 管理的 ssl 行）与 80 端口块**未被破坏**，HTTPS 正常

### Story 2: 上线后不被搜索引擎收录

**As a** 站点运营者
**I want to** 站点恢复访问后**不被搜索引擎收录**「鸣潮mod」等关键词
**So that** 法律暴露面不因上线而回升

**Acceptance Criteria:**
- [ ] 抽样 5 个页面（首页 / `/mods` / 某 `/[game]/mods` / 教程页 / 某 `/mods/[id]`）响应头均含 `X-Robots-Tag: noindex`
- [ ] 上述 5 页 HTML `<head>` 均含 `<meta name="robots" content="noindex, nofollow">`
- [ ] `/robots.txt` **不含** `Disallow: /`（保持可抓取，否则 noindex 读不到）
- [ ] **边界**：不采用向爬虫返回与用户不同内容（cloaking）的做法；noindex 是唯一手段
- [ ] **边界**：`/mods/[id]` 这类此前被分享的深链同样带 noindex（否则旧链接会把整站带进索引）

### Story 3: 文案中性化

**As a** 站点运营者
**I want to** 站内不再出现「鸣潮」「MOD」等字样
**So that** 即便被误抓，也不带可检索的敏感关键词

**Acceptance Criteria:**
- [ ] 默认标题不再是「鸣潮角色MOD个人站」，改为新站名（草案见 Appendix）
- [ ] layout 的 `description` 重写为中性表述
- [ ] `tool-download.ts` 的面板说明去掉「鸣潮 mod」
- [ ] 全量检索 `鸣潮` / `MOD` / 独立词 `mod` 命中 **0**（白名单除外）
- [ ] 站内**用户可见**的 OG / 分享文案一并换掉

### Story 4: JASM 市场恢复取数

**As a** JASM 客户端用户
**I want to** 市场页能加载出 mod 列表
**So that** 我能浏览和下载外观资源

**Acceptance Criteria:**
- [ ] 市场取数**不再依赖 Supabase REST**，改为只读 COS 快照对象
- [ ] 快照对象存在且内容非空，客户端能解析出列表
- [ ] 市场页**非空白、非报错**
- [ ] 快照的更新链路明确（谁写、多久一次），并在文档中记录
- [ ] **边界**：Supabase 402 恢复后是否切回实时 REST，作为后续可选项记入 Phase 2，不在本次

---

## Functional Requirements

### Core Features

**Feature 1: nginx 回滚 + PM2 启动**
- Description: 把三个入口从 `return 410` 恢复为反代 `127.0.0.1:3000`，启动 PM2 `wavemod`
- User flow: 改 nginx → `nginx -t` → reload → `pm2 start wavemod` → 验证 200
- Edge cases: 证书续期走 80 端口，**ssl 行与 80 块必须原样保留**；仓库里 `nginx.conf.example` /
  `scripts/deploy-hk.sh` / `scripts/setup-alt-entry.sh` 仍会生成**反代版**配置，注意别被覆盖
- Error handling: 若 502，检查 PM2 与 3000 监听；回滚用服务器 `/root/nginx-backup-20261013`

**Feature 2: 全站 noindex 落地（代码层）**
- Description: 根 layout 的 `metadata.robots = { index: false, follow: false }`（子页自动继承），
  nginx 侧 `add_header X-Robots-Tag "noindex, nofollow" always;` 兜底
- User flow: 爬虫抓页 → 读到 noindex → 放弃收录
- Edge cases: `robots.ts` 里现有的 `disallow: ["/mods?"]` 等规则**保留无害**，但**严禁**新增
  `Disallow: /`；`/mods/[id]` 自身此前的 `noindex, follow` 语义与本次「全站 noindex」一致，
  但 `follow` 需复核是否要留（建议改 follow=false，避免权重沿链接扩散）
- Error handling: nginx 的 `add_header` **必须带 `always`**，否则只对 2xx/3xx/304 生效

**Feature 3: 文案替换**
- Description: 按 Appendix 的草案对照表替换站内用户可见文案
- User flow: 改 `layout.tsx`、`tool-download.ts` 及其他命中点
- Edge cases: **角色名（今汐、长离…）与 `character` 分类值不属于「鸣潮」字样，本次不动**——
  它们是站点核心功能与数据库去重键，改了会诱发重复入库（见 Risk）
- Error handling: 无

**Feature 4: JASM 市场切 COS 快照**
- Description: 取数由 Supabase REST 改为只读 COS 快照
- User flow: 客户端启动市场 → 拉 COS 快照 → 解析渲染
- Edge cases: 快照为 `.json.gz`，需确认客户端解压/解析路径可用（`ModMarketSnapshotService`）；
  快照若过期，列表会停在那个时间点 —— 需明确更新链路
- Error handling: 快照拉取失败应有明确错误态，而不是静默空白

### Out of Scope
- **中转站 `hub/` 发布页**：本次**不恢复**（用户在「恢复范围」中未勾选该选项；`hub/index.html`
  仍是清空态，原内容在提交 `4ee1345a`）
- **Google Search Console / 百度搜索资源平台 主动移除提交**：不做
- **换域名 / 加访问门槛（邀请码、登录墙）**：不做，沿用同域名开放 200
- **JASM 客户端界面文案中性化**：不做（用户明确「只要站」）
- **Playwright / `site:` 实测**：不做

---

## Technical Constraints

### Performance
- 恢复后页面性能沿用现状；不因本次改动引入新的动态渲染（**不要**为了 noindex 去 `await cookies()`
  把整站从静态退化为动态 —— 这是 2026 年初 Vercel 额度被打穿的根因之一，见 `layout.tsx` 顶部注释）

### Security
- nginx 配置改动**必须**先 `nginx -t` 再 reload；改动前用 `/root/nginx-backup-20261013` 兜底
- **合规边界**：去索引只能靠诚实的 `noindex`；**禁止** cloaking（对爬虫与用户返回不同内容）
- 站内不得再出现「鸣潮」「MOD」等字样（Success Metrics 口径）

### Integration
- **服务器**：腾讯云首尔，PM2 管理，用户为 `ubuntu`（**不是 root**，仓库与 PM2 实为 root 所有）
- **Supabase**：`izxivkmgtrkkpxtedeco.supabase.co`，HTTP 网关疑因配额对 REST 回 **402**；
  直连 5432 仍可读写（若市场方案需回退，走 `scripts/psql-db.mjs`）
- **COS**：JASM 侧为 `jasm-modenv-1327973389` 桶；WaveMod 侧另有自己的桶
- **GitHub**：JASM Releases 在 `qsy123-coder/JASM1`（客户端更新的兜底通道）

### Technology Stack
- 前端：Next.js（App Router）+ TypeScript，根 layout 承载 `metadata`
- 部署：自托管（服务器 build + PM2 restart），**推 main 不再自动部署**
- JASM：C# / WinUI，配置文件 `appsettings.json`

---

## MVP Scope & Phasing

### Phase 1: MVP（本次必须完成）
- Feature 1：nginx 回滚 + PM2 启动（站点可达）
- Feature 2：全站 noindex（代码 + nginx 双保险，robots.txt 不加 `Disallow: /`）
- Feature 3：文案替换（新站名 + 敏感词清零）
- Feature 4：JASM 市场切 COS 快照

**MVP Definition**：站点对社群可达、对搜索引擎不可收录、无敏感字样，且 JASM 市场不再空白。

### Phase 2: Enhancements（上线后）
- Supabase 402 若恢复，评估市场是否切回实时 REST（拿回评论/热度等实时字段）
- 视索引消退情况，决定是否需要补提交 Search Console 移除
- 索引清干净后，评估服务器是否退租（**顺序不能反**）

### Future Considerations
- 中转站 `hub/` 是否择机恢复
- JASM 客户端界面文案是否一并中性化

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 恢复 200 导致被重新收录，410 成果作废 | **High** | High | 全站 noindex 必须在**上线同一时刻**生效；nginx `X-Robots-Tag` 用 `always` 兜底；严禁 `Disallow: /` |
| 误用 `robots.txt Disallow: /` 去下架 | Med | **High** | 明确列为禁项；已收录 URL 会因此**永久**留在索引（2026-10-13 那次已踩过） |
| 文案替换波及 `character` 值，破坏每日脚本去重 | Med | High | 角色名与 `character` 值明确排除在白名单外；改后跑 `upload-daily-by-date.mjs --dry-run`（不带 `--dates`）验证「待上传」为 0 |
| nginx 改动破坏证书/80 端口块 | Low | High | ssl 行与 80 块原样保留；`nginx -t` + 备份目录回滚 |
| 仓库部署脚本生成反代版配置，覆盖线上 noindex | Med | Med | 本次部署后核对线上配置；记录 `deploy-hk.sh` / `setup-alt-entry.sh` / `nginx.conf.example` 仍是旧模板 |
| JASM 快照停更导致市场数据陈旧 | Med | Med | 明确快照写入方与频率，写入文档；客户端需有失败错误态而非空白 |
| 本机到服务器的链路抖动导致误判 | Med | Low | 所有断言在服务器侧复核（见 `headless-chrome-cdp-verification` / `wavemod-server-access`） |

---

## Dependencies & Blockers

**Dependencies:**
- **服务器 SSH 访问**：腾讯云首尔，用户 `ubuntu`，链路抖动需重试
- **COS 快照对象**：JASM 市场依赖的 `market1/mods-snapshot.json.gz` 存在且非空
- **用户拍板文案**：Appendix 的站名与替换表为 **Sarah 起草**，需用户确认或修改后才算定稿

**Known Blockers:**
- **Supabase 402**：若市场方案仍要走 REST 则受阻塞；本方案改用 COS 快照以规避
- **文案词表未定稿**：Phase 1 的 Feature 3 在用户确认词表前不能收尾

---

## Appendix

### 文案替换草案（**Sarah 起草，待用户确认/修改**）

| 原 | 建议替换 |
|---|---|
| 鸣潮角色MOD个人站（默认站名） | **星澜 · 角色外观库** |
| 专注鸣潮角色 MOD 的个人站，提供高清预览… | 专注角色外观资源整理，提供高清预览、安装指引与高速直链下载 |
| 鸣潮 mod 修复工具 | 修复工具 |
| MOD / mod | 外观资源 / 美化资源 / 资源 |
| MOD站 / mod 站 | 资源站 / 外观库 |
| 鸣潮角色 MOD | 角色外观资源 |

> 站名「星澜 · 角色外观库」为中性与避让命名草案，**不绑定任何游戏名**。若你有偏好，直接替换本表。

### 白名单例外（**不属于敏感字样，本次不动**）

- **游戏角色名**（今汐、长离、忌炎、芙露德莉斯、爱弥斯…）——站点核心分类，且是数据库
  `character` 去重键的一部分，改动会诱发重复入库
- **`character` 分类值本身**（含 `UI`、`滑翔翼,翱翔翼,科考摩托` 等归并值）
- **mod 文件名/标题中的既有命名约定**（版本号位置、「og」作者标记等）

### Glossary
- **410 Gone**：HTTP 状态码，明确告知「已永久删除」，是搜索引擎去索引最快的信号
- **noindex**：`<meta name="robots">` 或 `X-Robots-Tag` 响应头，告知爬虫「可抓取但不要收录」
- **cloaking**：向爬虫与用户返回不同内容，违反搜索引擎指南，本方案明确禁用
- **X-Robots-Tag `always`**：nginx 参数，缺省只对 2xx/3xx/304 生效，非 200 响应（如错误页）会漏掉

### References
- 关站机制与 nginx 改动记录：`wavemod-site-shutdown-410`（用户记忆）
- 站点自托管与服务器访问：`wavemod-selfhost-seoul-guide`、`wavemod-server-access`
- Supabase 配额与直连绕行：`supabase-egress-quota-rules`
- JASM 市场数据源：`JASM_Manger/JASM/src/GIMI-ModManager.WinUI/appsettings.json`
- 文案命中点：`src/app/layout.tsx:49-55`、`src/features/tutorial/tool-download.ts:19-20`
- robots 策略：`src/app/robots.ts`

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
