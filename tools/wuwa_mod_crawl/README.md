# 多来源 Mod 更新监测系统

> **2026-11-12 起本仓库已并入 `wave-mod`，路径为 `tools/wuwa_mod_crawl`。**
> 旧的独立仓库 `qsy123-coder/wuwa_mod_crawl` 保留作历史档案，不再更新。
> 本机工具总览见 [`docs/local-tools.md`](../../docs/local-tools.md)。

监测多个《鸣潮》Mod 站点，发现更新后 **10~15 分钟内** 通过微信推送，
并自动归档为按来源、按日期分类的 CSV。

| 来源 | 运行位置 | 接入方式 |
|---|---|---|
| **可可站** www.mowink.org（原 kekehxl.org，2026-10-20 迁站） | 首尔服务器 | WordPress/WooCommerce REST API，纯 HTTP |
| **arca.live** `/b/thingzyoa` | 首尔服务器（采集）/ 本机（下载） | Cloudflare 反爬，采集需真实浏览器 + xvfb；kio.ac / nahida.live 走纯 HTTP |
| **NexusMods** | 首尔服务器 | 官方 API v1，纯 HTTP（需免费 API key） |
| **GameBanana** | **本机 Windows** | apiv13 接口，纯 HTTP **直连**（服务器 IP 被封） |
| **Patreon** | 首尔服务器 | `api.patreon.com` JSON:API + `session_id` 登录态，纯 HTTP（**发现源**，无下载链） |
| **爱发电** afdian.com | 首尔服务器 | 站点自己的 `/api/*` 接口，纯 HTTP **匿名可用**（**发现源**，无下载链） |

> **新增来源时，`source_name` 不能含空格。** 本机 `sync.ps1` 把目标路径以变量
> 形式传给 `scp.exe`，含空格的路径会被 PowerShell 的引号规则搞坏，且失败形式是
> 「整轮静默中断」—— 只留「开始」没有「结束」，随后计划任务的 `IgnoreNew` 会把
> 之后每一轮都跳过。2026-10-13 实测过一次，详见「排障」一节。


> 需求文档：[`docs/kekehxl-daily-mod-crawler-prd.md`](docs/kekehxl-daily-mod-crawler-prd.md)

---

## 架构

```
┌─ 首尔云服务器 (Ubuntu 22.04) ─────────────────────────────┐
│  kekehxl-watcher.service   (每 10 分钟, 纯 HTTP)           │
│    └─ out/可可站/…            WooCommerce REST API          │
│                                                            │
│  arca-watcher.service      (每 15 分钟, xvfb 有头浏览器)   │
│    └─ out/arca.live/…        抓 3 个 Mod 分类页             │
│                                                            │
│  nexus-watcher.service     (每 30 分钟, 纯 HTTP)           │
│    └─ out/NexusMods/…        Nexus Mods 官方 API v1        │
│                                                            │
│  patreon-watcher.service   (每 60 分钟, 纯 HTTP)           │
│    └─ out/Patreon/…          api.patreon.com JSON:API      │
│                                                            │
│  afdian-watcher.service    (每 60 分钟, 纯 HTTP)           │
│    └─ out/爱发电/…            afdian.com /api/*（匿名）     │
│                                                            │
│  六者共用：差集检测 → 归档 CSV → PushPlus 微信推送          │
│            （Server酱 仅作兜底）                            │
└────────────────────────────────────────────────────────────┘
                          │ scp（先落临时目录，再逐文件拷回）
                          ▼
┌─ 本地 Windows ─────────────────────────────────────────────┐
│  计划任务 KekehxlModSync (每 10 分钟)                       │
│    └─ scp 拉取 A_每日更新\_Mod每日汇总\<来源名>\            │
│                                                            │
│  计划任务 GameBananaModWatch (每 15 分钟)                   │
│    └─ apiv13（自动走 Clash）→直接写 _Mod每日汇总\GameBanana\│
│       （本机跑，不经过服务器）                              │
│                                                            │
│  计划任务 GameBananaModDownload (每 30 分钟 / 入队即触发)   │
│    └─ 按队列下载原图 + Mod 附件                             │
│       → A_每日更新\W-<下载执行日>\GameBanana\（平铺）       │
│                                                            │
│  计划任务 ArcaModDownload (每 30 分钟)                      │
│    └─ 读同步回来的 arca CSV，解析 kio.ac / nahida.live      │
│       → 原图 + Mod 文件写入 W-<下载执行日>\arca.live\       │
│                                                            │
│  任一来源有新增 → 弹桌面通知 + 微信推送                     │
└────────────────────────────────────────────────────────────┘
```

**各来源的接入差异**（都是实测结论，别重新摸索）：

| | 可可站 | arca.live | NexusMods | GameBanana | Patreon | 爱发电 |
|---|---|---|---|---|---|---|
| 数据接口 | REST API | 无 API，抓 HTML | 官方 API v1 | apiv13 API | `api.patreon.com` JSON:API | 站点 `/api/*`（非官方） |
| 反爬 | 首尔 IP 无验证码 | Cloudflare（无可用 cookie） | 网页被 CF 拦，**API 不拦** | Cloudflare + 封机房 IP | 主站被 CF 拦，**`api.` 子域不拦** | 无（纯 SPA） |
| 需要浏览器 | ❌ 纯 HTTP | ✅ 每次都要 | ❌ 纯 HTTP | ✅ | ❌ 纯 HTTP | ❌ 纯 HTTP |
| 需要登录凭据 | ❌ API key | ❌ | ❌ API key | ❌ | ✅ **`session_id`**（仅为了预览图不糊，见下） | ❌ 匿名 |
| 首尔服务器 | ✅ 可用 | ✅ 可用 | ✅ 可用（走 API） | ❌ 403 | ✅ 可用（走 API） | ✅ 可用 |
| 能拿到下载链接 | ✅ 夸克直链 | ✅ 帖内 base64 解码 | ✅ 站内下载 | ✅ 站内下载 | ❌ **拿不到**（见下） | ❌ **拿不到**（付费帖） |

**多来源目录结构**（各站字段不同，互不干扰）：

```
A_每日更新/_Mod每日汇总/
├─ _同步日志.log
├─ 可可站/
│   ├─ W-2026.10.10.html     ← ★ 表格：缩略图+标题，双击浏览器打开
│   ├─ index.html            ← ★ 最近 200 条，同上
│   ├─ W-2026.10.10.csv      ← 含 夸克链接/提取码/解压码
│   ├─ all_mods.csv
│   └─ images/17408.webp     ← 预览图（发现时即下载，长期可用）
└─ arca.live/
    ├─ W-2026.10.10.html
    ├─ index.html
    ├─ W-2026.10.10.csv      ← 含 韩语标题/作者/分类/浏览推荐
    ├─ all_mods.csv
    └─ images/185510493.png
```

### 看图用 HTML 表格（推荐日常使用）

CSV 里图片只是路径，看不到图。**要浏览就双击 `index.html`**（用浏览器打开）：
每行一张缩略图 + 标题，**点图看原图、点标题去原帖**，夸克链接是可点按钮。

- 缩略图尺寸**按来源配置**（`GALLERY_SPEC["thumb_size"]`）：可可站 150×210 竖版、arca.live 150×150 方形
- 用 `object-fit: contain` **完整显示，不裁切**
  > ⚠️ 维护提醒：图片尺寸必须写成固定像素，**不要改成 `max-width:100%`** —— `<img>` 外面套了 `<a>`，
  > 而 `<a>` 没有确定宽度、会收缩成图片原始尺寸，百分比就失去约束，图片会按原大小渲染而溢出。
- 支持深色模式（跟随系统）
- 图片是**发现当下就下载到本地**的，不是外链 —— arca.live 的原始缩略图是带签名的临时 URL，
  几小时就失效，不下载就会变破图

### 批量转存：网盘链接汇总

页面顶部有 **「网盘链接汇总」** 折叠区：

- 框内是纯文本，一行一条：`https://pan.quark.cn/s/xxxx  提取码:keke`
- 点「一键复制全部」直接进剪贴板；或手动点框内 `Ctrl+A` `Ctrl+C`
- 另外还落一份独立文件 **`网盘链接.txt`**（全量，不限条数），打开全选复制即可

> 只有 `可可站` 有网盘链接（arca.live 是论坛帖，没有直链，因此不生成该文件）。

---

## 部署信息

| 项目 | 值 |
|---|---|
| 服务器 | `ubuntu@YOUR_SERVER_IP:22`（腾讯云香港，2026-10-25 由到期的首尔机迁移，Ubuntu 22.04） |
| SSH 密钥 | `~/.ssh/your_key` |
| 程序目录 | `/home/ubuntu/kekehxl-watcher/`（多来源共用，名字沿用历史） |
| 凭据文件 | `patreon_session.txt`（Patreon `session_id`，**权限必须 600**，见「更新 Patreon session」） |
| systemd 服务 | `kekehxl-watcher.service`（可可站）、`arca-watcher.service`（arca.live）、`nexus-watcher.service`、`patreon-watcher.service`、`afdian-watcher.service`（爱发电） |
| 浏览器依赖 | Chromium + xvfb（仅 arca.live 需要，由 `xvfb-run` 拉起） |
| 本地汇总目录 | `A_每日更新\_Mod每日汇总\<来源名>\` |
| 本地计划任务 | `KekehxlModSync`（每 10 分钟） |

> ⚠️ 服务器仅 1.9G 内存，且承载用户自有的 `aetouban` 站点（nginx）
> 与 2G swap。`arca-watcher.service` 已设 `MemoryMax=900M` 限制 cgroup，
> **防止 Chromium 内存增长波及其它服务**。改动内存相关配置时务必保持这个约束。

---

## CSV 字段

| 列 | 说明 |
|---|---|
| 日期 | 站点发布日期（站点时区为 UTC） |
| **来源** | 站点名（如「可可站」），多站合并时用于溯源 |
| mod名称 | Mod 标题 |
| **夸克链接** | `https://pan.quark.cn/s/...` |
| 提取码 | 夸克分享提取码（当前站点统一为 `keke`） |
| 解压码 | 压缩包解压密码（`kekehxl`） |
| 分类 | 固定「鸣潮Mod」 |
| 角色标签 | 如「心」「坎特蕾拉」 |
| 网站页面链接 | 商品页 URL |
| product_id | 站点商品 ID（去重键） |
| 发布时间 | 站点原始时间戳 |
| 首次发现时间 | 程序检测到的时间 |

### 2. arca.live（`out/arca.live/`）

频道「명조 엔드필드 모딩 채널」，只抓三个 Mod 相关分类：`모드 추천` / `명조 모드` / `엔드필드 모드`。

| 列 | 说明 |
|---|---|
| 日期 | 发帖日期（站点时间为 UTC） |
| 来源 | `arca.live` |
| 标题 | 帖子标题 |
| 作者 | 发帖人 |
| 分类 | 帖子自身分类徽章（比"从哪个页抓到"更准） |
| 帖子链接 | `https://arca.live/b/thingzyoa/<id>` |
| 浏览量 / 推荐数 | 抓取时刻的数值 |
| **下载链接** | 进帖正文提取（见下） |
| 预览图 | 本地路径（**发现当下就下载**；站点原图是带签名的临时 URL，几小时失效） |
| article_id | 帖子 ID（去重键） |

**帖内下载链接是怎么拿到的**：该站发帖人习惯把下载地址 **base64 编码**后贴在正文里（防爬/防屏蔽）：

```
正文: ㅂㅂㄱㄹ aHR0cHM6Ly9uYWhpZGEubGl2ZS9ha2FzaGEvbGluay9JdVk0QmwyNElFRHo=
解码 → https://nahida.live/akasha/link/IuY4Bl24IEDz
```

程序对新帖**进正文**收集明文 URL 并自动解码 base64，结果写入 `下载链接` 列，
同时生成 **`下载链接.txt`**（可整段复制去转存）和 HTML 顶部的复制区。

> 只对**新帖**进正文（每帖多约 3 秒），不会为历史帖白跑页面。
> 该功能上线前的历史条目 `下载链接` 为空，属正常。

#### 原图 + Mod 文件本地化（2026-11-01 上线）

与 GameBanana 同一套路：采集仍在服务器，本机计划任务 `ArcaModDownload`
（`run_arca_download.py`，每 30 分钟）读 `sync.ps1` 拉回的
`_Mod每日汇总/arca.live/all_mods.csv`，把图片和 Mod 文件直接写进
`A_每日更新/W-YYYY.MM.DD/arca.live/`。队列在 `state.arca_downloads.json`，关机/失败可续传。

```
A_每日更新/W-2026.11.01/
└─ arca.live/                        ← 2026-11-01 起按来源分目录，来源文件夹里平铺
   ├─ 标题.png / 标题_2.png           ← 帖子正文原图（data-originalurl）
   ├─ 금희,음림,카멜리아 팬스좌 UHD.zip ← kio.ac 合集里的压缩包，多个加 _1.._N
   ├─ 쇄명 컬러변경 모드 쓰시는분들/    ← nahida 模组页的目录树原样保留（本身是目录型 mod）
   │  └─ 쇄명-컬러변경(그림자수정)/…
   ├─ arca_需手动下载.txt             ← 无法自动下载的链接（纯文本）
   └─ arca_需手动下载.html            ← 同上，双击可直接点链接
```

| 链接类型 | 处理方式 |
|---|---|
| `kio.ac/c/<id>` | 走 `api.kio.ac/v0/...`（CBOR）：`collection/get` 用密码换 `Kiosk-CAT`，`directory/get` 列目录，`file/gets` 拿 16MiB 分段的 CDN 预签名 URL。密码用频道公告帖写死的 **`Eldwh`**（`[download] password` 可改） |
| `nahida.live/akasha/mod/<id>` | `GET api.nahida.live/akasha/mod/<id>?password=<base64url>`，响应头 `x-token` 后续列目录/取 S3 预签名直链。一般不需要浏览器，API 被 Cloudflare 挑战时自动借用 Chrome 的 `cf_clearance`；需要积分的模组跳过 |
| `nahida.live/akasha/link/<id>` | 2026-11-01 起自动下载：真实 Chrome（屏幕外窗口，**不能用 headless**）打开分享页，页面自己的 Turnstile 十几秒自动通过；带密码的链接自动填 `[download] password`（`Eldwh`）。拿到 12 小时有效的 `nhd-link-token` 后，列目录/下载都走 `api.nahida.live`。CDN 文件可能是 zstd/gzip 压缩，下载后自动解压 |
| 「챈방주 내닉폴더에 있음」（频道 Mod 方舟） | 正文不挂外链、只写文件在方舟里时，用 `[download] ark_link`（频道公共方舟的 nahida 分享链接）拿 token，按作者昵称定位 `명조/작가별(Creator)/[공용)챈 업로더/]<作者>`，再下载发帖日期前后一天内新建/更新的子目录（同一天有多个更新且标题对不上时记为待手动）。2026-11-02 起支持 |
| GameBanana / 其他站外链接 | 前者交给 GameBanana 任务；后者记录为待手动 |

> 帖子页本身也受 Cloudflare 保护：纯 HTTP 返回 403「Just a moment...」时，
> 自动改用真实 Chrome（屏幕外窗口，与 nahida 分享链接共用同一个进程）打开，
> 正文图片仍走 `ac-o.arca.live` CDN。`api.nahida.live` 被挑战时同理，
> 会把浏览器的 `cf_clearance` 同步给 requests 会话（UA 也同步成浏览器的真实 UA）。
>
> **日期取下载执行日**，与 GameBanana 一致：关机期间发的帖在开机下载那天归档。
> 首次运行按 `[download] backfill_days`（默认 7 天）回填，之后只跟新帖；
> 回填起点会写进 state 的 `enqueue_since`，想再往前补只能手动改这个日期
> （并删掉对应 `items` 里的旧条目）。
> `kio` 的段 URL 约 1 小时过期，所以每次续传都重新列目录取新 URL；
> `.part` 保留已下字节，按段内偏移 `Range` 续传。
> nahida 的预签名接口限流 **5 次 / 10 秒**，程序主动按 2.1 秒/次限速，
> 遇到 429 还会按 `retryAfter` 自动等待重试。
> `[download] skip_categories` 默认是 **`엔드필드 모드,enFielMd`**：终末地 Mod
> 仍然会被采集进 CSV/看板，但不会入队下载（状态显示「已跳过」）。想下载就把它清空。

---

### 3. GameBanana（`_Mod每日汇总/GameBanana/`）

**本机运行**（首尔服务器 IP 被 Cloudflare 封；本机直连可用但只有 20~80KB/s，
默认自动走本机 Clash，约 450~620KB/s）。鸣潮 game id = `20357`。

| 列 | 说明 |
|---|---|
| 日期 / 发布时间 | 来自 `_tsDateAdded`（UTC） |
| 名称 / 作者 | `_sName` / `_aSubmitter._sName` |
| 分类 / 子分类 | 如 `Skins` / `Suoming` |
| 版本 | `_sVersion` |
| 页面链接 | `https://gamebanana.com/mods/<id>` |
| 点赞 / 浏览 / 评论 | 抓取时刻的数值 |
| 预览图 | 本地路径（**发现当下就下载**） |
| mod_id | mod ID（去重键） |

**新增 + 更新都抓**（2026-11-09 起，对齐 JASM 的调法）：每轮同时翻三路排序 ——
`default`（最近活动，和 JASM 商店首页一致，能抓到只改页面的更新）、`new`（兜底
冷门新提交）、`updated`。判断「更新」用的是 **`_tsDateModified`**（不是
`_tsDateUpdated`：后者很多 Mod 是 0，只改页面的更新根本不会出现在 updated 排序里）。

- 状态文件 `state.gb.json` 里的 `mod_meta` 记录每个 Mod 的修改时间基线；
  修改时间变大 = 更新。
- 更新单独写 `_Mod每日汇总/GameBanana/更新记录.csv`（同一个 mod_id 会反复出现，
  不能走每日表的 id 去重）。
- 拉了 `DownloadPage` 比对文件链接：只有文件真的变了才重新下载；只改描述/封面
  的标为「页面更新」，不重复下载。
- 更新重新入队时，新版本落到**下载执行日**的 `W-<日期>/GameBanana/`，旧版本文件
  留在原日期文件夹，不覆盖。

**关机不丢数据**：`new`/`updated` 按时间倒序，翻到时间窗外就停；`default` 是
活跃度排序，按固定页数翻。电脑关机期间站点的新增和更新，**开机后会自动补齐**。

**只抓 `Mod` 类型**：GameBanana 的 Subfeed 混着 `Question`/`Tutorial`/`Tool` 等非 mod 内容
（实测一页 15 条里只有 7 条是 Mod）。由 `config.gb.ini` 的 `model_types` 控制，默认 `Mod`。

**一次性补抓**：`python backfill_gb.py --since 2026-11-03`（先加 `--dry-run` 盘点），
按同样的口径回溯指定日期之后的新增和更新，补进 CSV/更新记录并重新入队。

#### 原图 + 附件本地化（2026-10-24 上线）

采集任务只把新 Mod **写入队列**（`state.gb_downloads.json`），真正下载由独立计划任务
`GameBananaModDownload` 执行 —— 采集任务有 10 分钟执行上限，大附件会被强杀。

**下载加速（2026-11-09）**：GameBanana 的 filecache 单连接只有 40–120KB/s，
所以 **≥4MB** 的附件自动开 4 条连接分段（原阈值 32MB，导致 12MB 的文件只开 1 条连接）。
另外**延迟低 ≠ 下载快**：下载任务启动前会先测当前节点的真实吞吐（2MB Range），
低于 300KB/s 就按延迟顺序试几个候选节点，挑最快的。实测香港节点 120ms 但只有
~50KB/s，切到新加坡节点后 4 连接能到 3MB/s。配置项：`auto_switch_slow` /
`slow_threshold_kbps`。

```
A_每日更新/
├─ W-2026.10.30/                  ← 按**下载执行日**分天（不是 Mod 发布时间）
│  └─ GameBanana/                 ← 2026-11-01 起按来源分目录，来源文件夹里平铺
│     ├─ Suoming Summer.jpg       ← 原图：单图不加序号
│     ├─ Suoming Summer_2.jpg     ← 多图用 _1.._N
│     ├─ Suoming Summer.rar       ← Mod 附件：单附件不加序号
│     ├─ Suoming Summer_2.7z      ← 多附件用 _1.._N
│     └─ …                        ← 与手工整理的来源文件夹共用，已存在就直接写入
└─ _Mod每日汇总/GameBanana/
   ├─ images/                     ← HTML 用的 530 缩略图（保持原样）
   └─ all_mods.csv
```

> **目录结构变更（2026-11-01）**：`W-日期/<来源>/` 两层，`arca.live` 和
> `GameBanana` 各自一个文件夹；图片、压缩包在来源文件夹里平铺，nahida 的
> 目录型 mod 保留自己的文件夹。旧日期的平铺目录不迁移，Web 看板和下载器
> 都会先找 `<来源>/`，找不到再回退旧路径。

| 规则 | 说明 |
|---|---|
| **日期** | 取下载任务的**执行日**，不是 Mod 发布时间。关机期间发布的 Mod 在开机下载那天归档：29 日发布、30 日才下载 → `W-2026.10.30` |
| **原图** | 取 `_aPreviewMedia._aImages[]._sFile`（站点原始尺寸），不是 530 缩略图 |
| 命名 | 统一用 Mod 名称（`_sName`），非法字符替换为 `_`，超长截断；同名 Mod 加 `(mod <id>)` |
| 多图 / 多附件 | 加序号 `_1`、`_2` … |
| 历史 | **只下载功能上线后新发现的 Mod**，之前的 31 条不补（2026-10-24 用户确认） |
| 多附件 | **全部下载**（含不同版本/可选补丁） |
| 磁盘保护 | 剩余空间低于 `min_free_gb`（默认 3GB）暂停并推送，同一天只提醒一次 |
| 去重 / 续传 | 已完成文件跳过；附件用 `.part` + HTTP Range 断点续传，任务被强杀也能接着下 |
| 自动重试 | 连续失败 `retry`（默认 3）次后标记 failed 并推送提醒，但会继续自动重试 `auto_retry_rounds`（默认 5）轮；间隔 15 → 30 → 60 … 分钟，封顶 240 分钟。用尽后在看板点「重试」 |

**⚠️ 走本机梯子快约 8 倍**：直连实测 20~80 KB/s，走 Clash 约 450~620 KB/s，API 也没被封。
默认 `[net] proxy = auto`：读系统代理 + 探测 7897/7890/10809 等端口；
`autostart = true` 时探测不到端口会**自动拉起 Clash Verge**（`app_path` 可指定路径，
留空则找常见安装位置）并等 `autostart_wait` 秒让端口就绪，无人值守也不会退回慢速直连。

**端口通 ≠ 节点可用**：2026-11-07 出现过 Clash 节点掉线但 7897 仍在监听的情况，
`tcp_alive()` 判定「代理已就绪」，实际所有 HTTPS 都在 TLS 握手阶段失败。
现在每轮开始会发一个极小的 HTTPS 探活请求；节点不可用时会通过 Clash Verge 的
命名管道 `\\.\pipe\verge-mihomo` **自动切到一个能访问目标站点的节点**
（用目标站点本身测延迟，切完再用代理实测一次）。只有换节点也失败、且直连可用时
才降级直连；代理中途挂掉（`ProxyError` / `SSLError`）同样先尝试换节点。
配置项：`[net] auto_switch_node = true`。

Clash Verge 默认只开命名管道、不监听 TCP 9090/9097，所以这里用 ctypes 直接读写
管道；实现见 `gamebanana_watcher/clash.py`。换节点只影响当前运行的 GLOBAL /
规则链选中的策略组，不会改订阅文件。

**入队即下载**：采集任务把新 Mod 写进队列后会立刻 `schtasks /Run GameBananaModDownload`，
不必等下载任务下一个 30 分钟周期（任务设置了 `IgnoreNew`，重复触发无副作用）。

**⚠️ 不要改回 `trust_env=True`**：Windows 注册表会把 https 代理写成
`https://127.0.0.1:7897`，requests 会去和本地明文代理做 TLS 握手，报
`ProxyError ... FileNotFoundError`。`gamebanana_watcher/proxy.py` 会纠正成 `http://`
并显式设置 `session.proxies`。普通海外机房/服务器 IP 仍可能被 503，别照搬到首尔服务器。

原图用 4 线程并发，附件单线程但断点续传，计划任务时限 3 小时、每轮最多
`max_run_minutes`（默认 120）分钟。

---

### 4. Patreon（`out/Patreon/<作者>/`）

**只能跑服务器** —— 本机（中国家宽）连 `patreon.com` 直接 TCP 超时。作者列表写在
`config.patreon.ini` 的 `[creators]` 段，**加作者只需加一行**（`vanity = campaign id`，
id 可留空，程序自动解析并缓存）。当前配了 **2 个作者：`shaojiang` 和晨星 `Morning__Star`**。

**产出按作者分目录** —— 每个作者一套完整产出，等价于一个独立子来源：

```
out/Patreon/
├─ shaojiang/
│   ├─ W-2026.10.15.csv / .html    ← 当日表
│   ├─ all_mods.csv                ← 该作者的总表
│   ├─ index.html                  ← 最近 200 条（标题会写「Patreon · EnteleJiang」）
│   └─ images/172406539.png
├─ Morning__Star/
└─ …（加作者就多一个同级目录）
```

同步回本机后就是 `_Mod每日汇总/Patreon/<作者>/`。

> ⚠️ 实现上这也是**每个作者一个 `Store` + 一个 state 文件**
> （`state.patreon.<vanity>.json`）。关键原因：首轮全量建档的判定
> （`initialized`）必须是**作者级**的 —— 多个作者共用一个 Store 的话，
> 第一个跑完就把 `initialized` 置 True，后面 12 个会被当成「非首轮」而
> 只回溯几页、拿不到完整历史。
>
> 副作用：`healthcheck.py` 需要跨文件聚合状态（见其 `_read_states`），
> 且状态文件从 1 个变成 N 个（每个作者一个）。

> ⚠️ **vanity 大小写敏感**：它同时用作目录名和 state 文件名，
> `Puddingow` 写成 `puddingow` 目录名就跟着变。解析器里 `optionxform` 必须在
> `read()` **之前**设才有效（2026-10-15 踩过：写在 read 之后，`Puddingow` →
> `puddingow`、`NoMention` → `nomention`；之前只配了全小写的 shaojiang 所以没暴露）。
>
> ⚠️ 解析器也开了 `inline_comment_prefixes` —— configparser **默认不认行内注释**，
> 给作者写 `; 说明` 时 campaign id 会连着注释一起吃进去，`filter[campaign_id]`
> 自然查不到，而且报错很难懂。

| 列 | 说明 |
|---|---|
| 日期 / 发布时间 | `published_at`（UTC） |
| 名称 | 帖子标题 |
| 作者 | campaign 名（如 `EnteleJiang`），**不是** vanity |
| 类型 | `image_file`（带图 Mod 帖）/ `text_only`（纯文本公告） |
| 页面链接 | `https://www.patreon.com/<vanity>/posts/<id>` |
| 点赞 / 评论 | `like_count` / `comment_count` |
| 预览图 | 本地路径（**发现当下就下载**） |
| mod_id | 帖子 ID（去重键） |

> ⚠️ **这个来源没有「下载链接」列，也生成不了网盘链接汇总** —— 它是**发现源**，
> 不是下载源。campaign 被标记 `is_nsfw` 时，**匿名**调用只能读到**元数据**：
> 标题、发布时间、预览图、帖子链接；`included` 里 media 的 url 全是 `None`。
>
> 所以它的价值是：**告诉你"某个作者今天发了个新 mod，叫什么、长什么样、原帖在哪"**。
>
> 附带说明：配了 `session_id` 之后，`media[].download_url`（附件）和
> `content_json_string`（正文）其实也能拿到。本项目**故意没用** —— 附件链带 token
> 约 24 小时失效，存进 CSV 没意义；要真做就得让服务器当下载源，磁盘和带宽是另一笔账。
> 想做的话再说。

### 预览图去模糊（`session_id`）

**问题**：不登录时抓回来的预览图全是**模糊的**。

**根因**：模糊不是我们下错了，是 **Patreon 服务端烤进图片里的**。图片 URL 路径中有一段
percent-encoded base64，解出来就是 CDN 的变换参数：

```
.../post/172406539/3bfff921.../eyJiIjo3MCwidyI6NjIwfQ%3D%3D/1.png?token-hash=...
                              └─ 解出 = {"b":70,"w":620}   ← b=70 就是 70px 模糊
```

2026-10-15 全量扫了 108 条帖子：**105 条是 `{"b":70,"w":620}`**，2 条 `text_only` 无图，
只有 1 条（发帖时没勾 NSFW）是干净的 `{"w":620}`。

**绕不过去（四种都实测过）**：

| 尝试 | 结果 |
|---|---|
| 把 base64 段改成 `{"w":620}`（去掉 b） | **403** —— `token-hash` 是签在路径上的 |
| 整个参数段删掉 | **403** |
| 加 `&w=2560` / `&blur=0` 查询参数 | 200，但**返回字节数与原来一模一样** —— CDN 直接忽略 |
| 伪造 `Referer` / `Origin: patreon.com` | 同样忽略 |

匿名下 `included` 里真原图的 `url` 字段**根本不存在**（不是 `None`），拿不到。

**解法**：配一个 `session_id`。带上之后 `current_user_can_view` 变 `True`，
`image.url` 的变换参数从 `{"b":70,"w":620}` 变成 **`{"w":620}`**：

| | 匿名 | 带 session |
|---|---|---|
| `current_user_can_view` | `False` | `True` |
| `image.url` 参数 | `{"b":70,"w":620}` | **`{"w":620}`** |
| 下载下来的 620 图 | 48150 字节，一片灰糊 | **271595 字节，肉眼清晰** |
| `thumbnail.original` | 620×419 的糊图 | **4305848 字节 = 作者原始上传文件** |

#### ⚠️ 但登录态只解锁了**一部分**帖子

配了 session 不等于全部可见。同一个账号对不同作者的可见比例差很多。
**2026-10-15 做过一次 13 个作者的抽样摸底**（现已只留 shaojiang + Morning__Star，
其余按用户要求删掉了），下面这组数字是那次摸底的结果，留档备查：

| 作者 | 总帖 | `current_user_can_view=True` | 可用预览图 |
|---|---|---|---|
| shaojiang | 108 | 31（29%） | 106（含配 session 前的旧图） |
| ahuang | 235 | — | 96 |
| **Morning__Star** | 59 | — | 24 |
| Puddingow | 270 | **14（5%）** | 9 |
| tamayo_ | 154 | **1** | **0** |

> 结论：**29% 是异常高的个例，不是常态**。多数作者只有个位数百分比的帖子可见。
> 所以「加作者」这一动作的真实收益，得先拿作者 id 试一次才知道 ——
> 别指望加了就有一堆图。

**看不见的帖子，API 是直接把字段抽掉的** —— `content` / `post_file` /
`attachments_preview_metadata` 整个不存在（不是空值），`image.url` 也退化成带
`{"b":70}` 的糊图。对比过两条相邻帖（`164147252` 全缺 vs `164306087` 齐全）。

原因：该账号 `is_email_verified=false`、`age_verification_status=null`，
大概率是**没做年龄验证 / 不是这些作者的 patron**。
**换一个验证过、或已 pledge 的账号应该能解锁更多** —— 回填脚本幂等，
换账号后重跑 `patreon_refresh_previews.py` 即可自动补上。

> ⚠️ 看不见的帖子，poller **拒绝落盘模糊图**（留着空比留糊图强）。
> 代价是这些行的「预览图」列长期为空 —— 想改成「退而求其次存个模糊版」，
> 见「故障排查」里那条。

> ⚠️ **session 过期后接口不报错**，只是悄悄把 `image.url` 换回 `{"b":70,...}`。
> 日志、`last_poll`、文件完整性全都正常 —— 这是继「HTML 生成不出来」「历史被当新帖
> 重推」之后的**第三种静默故障**。所以有两道防线：
> 1. `poller.py` 每轮开头主动探测 `current_user()`，失效就告警并**停止下载图片**
> 2. `healthcheck.py` 日报里单独报一行登录态
>
> 另外 poller 会**拒绝落盘模糊图**：`download_images()` 对已存在的 `<id>.*` 是永久跳过的
> （glob 命中就复用），一旦把糊图写进去，之后 session 修好也永远不会重下。
> 所以宁可在降级期间让「预览图」列留空。补历史空图见下方「更新 Patreon session」。

**首轮全量建档**：第一次运行会把作者的历史帖子**全部**归档进 CSV（好处：总表一开始就完整），
但**不推送通知** —— 上百条历史刷屏没意义。之后每轮只推新帖。

**接口要点**（都是实测，别重新摸索）：

- `www.patreon.com/*`（含 `/c/<name>/home`、`sitemap.xml`、`www.patreon.com/api/posts`）
  → Cloudflare 稳定 403「Just a moment」，**机房 IP 被拦**
- `api.patreon.com/*` → **不拦**。注意是 `api.patreon.com`，**不是** `www.patreon.com/api`
- 拿 campaign id 用 `campaigns?filter[vanity]=<name>`。⚠️ **别抄第三方站（如 graphtreon）
  的 `creatorId`** —— 那是 **user id，不是 campaign id**（shaojiang：`creatorId=3568680`
  ≠ `campaign=14019274`），抄错会得到 `ViewForbidden`，看起来像"作者是私密的"，其实是 id 用错
- **找作者用 `/search`**（需登录态）：`GET api.patreon.com/search?q=wuthering%20waves&page=1`
  → `data[]` 是 `campaign-document`，带 `name`（显示名）/ `url`（含 vanity）/
  `creation_name`（作者自述）/ `is_nsfw` / `patron_count`，`meta.hits_total` 是总数。
  搜 `wuwa` / `鸣潮` / `wwmi` / 角色名都能命中。
  ⚠️ 靠 `creation_name` 区分类型：`Creating ZZZ/Wuwa Comics~` 是**画漫画的**、
  `Anim/4K SHAKE IT` 是**做视频的**，都不是 mod 作者，加进来只会污染推送
- 翻页靠 `meta.pagination.cursors.next`；`page[count]` 实测可到 100；**无速率限制响应头**
- ⚠️ **`meta.pagination.total` 不可信** —— 同一 campaign 实测在一小时内于 `137`/`107`
  之间浮动，**不代表能翻到的帖子数**。判断"翻完没有"只看 **cursor 是否为空**；
  要对总数用 campaign 的 `creation_count`（shaojiang：`creation_count=107` == 实际翻到
  107 条，逐页核对过）。这个坑会让人误以为"少了 30 条、有静默截断"，白查半天

### 更新 Patreon session（登录态失效时）

**怎么发现**：日报出现 `❌ Patreon 登录态失效`，或微信收到「Patreon 登录态失效」告警，
或发现新帖的预览图列开始留空。

**怎么取值**（Chrome / Edge）：

1. 浏览器登录 `patreon.com`
2. `F12` → **Application** 标签 → **Storage → Cookies → `https://www.patreon.com`**
3. 找 **Name = `session_id`**，双击 **Value** 全选复制

> ⚠️ `session_id` 是 **HttpOnly**，在 Console 里敲 `document.cookie` **看不到它**，
> 必须走上面这个面板。
>
> 更稳的办法：`F12` → **Network** → 刷新页面 → 点任意一条发往 `api.patreon.com`
> 的请求 → **Headers → Request Headers** → 复制整行 `cookie:`（含 `session_id` 即可）。

**怎么更新**：

```bash
# 本地：把值写进 patreon_session.txt（裸值一行，不带 session_id= 前缀）
# 然后推到服务器并收紧权限
scp -i ~/.ssh/your_key patreon_session.txt ubuntu@YOUR_SERVER_IP:/home/ubuntu/kekehxl-watcher/
ssh -i ~/.ssh/your_key ubuntu@YOUR_SERVER_IP \
    "chmod 600 /home/ubuntu/kekehxl-watcher/patreon_session.txt && \
     sudo systemctl restart patreon-watcher"

# 回填这段时间留下的空图 / 糊图（必须跑在服务器）
cd /home/ubuntu/kekehxl-watcher
python3 patreon_refresh_previews.py --dry-run                    # 先看统计，不动文件
python3 patreon_refresh_previews.py                              # 正式回填（全部作者）
python3 patreon_refresh_previews.py --creator Puddingow          # 只处理某一个作者
```

> ⚠️ **一定要跑回填脚本**：降级期间新帖的预览图是**留空**的，而 `download_images()`
> 对已存在的 `<id>.*` 永久跳过，靠日常轮询**永远不会自己补回来**。
> 脚本会重新遍历作者帖子建 `mod_id → 新图 URL` 映射（CSV 里不存 URL，签名链也早失效了），
> 旧图**改名挪走**而不是删除，确认无误后可自行删掉。
>
> 备份目录与回填记录都**按作者区分**，名字从 state 文件名派生，放在**程序目录**
> （不在 `out/` 里）：
> `state.patreon.Puddingow.json` → `state.patreon.Puddingow.blurred_bak/` +
> `state.patreon.Puddingow.refill.json`
>
> （⚠️ **故意放在 `out/` 之外** —— 本机 `sync.ps1` 用 `find . -type f` 递归扫整个
> `out/`，放里面会被一并同步到本地汇总目录；实测踩过一次。）

> ⚠️ `session_id` **等同账号登录凭据**，拿到就能以你的身份操作 Patreon。
> 别提交进版本库、别贴进聊天。要作废就去 Patreon「退出所有设备」。

---

### 5. 爱发电（`out/爱发电/<作者>/`）

**跑首尔服务器，纯 HTTP，而且完全不需要凭据**（这三个接口匿名可用）。
与 Patreon 同类：**按作者监测**，产出按作者分目录，是**发现源**。

作者列表写在 `config.afdian.ini` 的 `[creators]` 段（`slug = user_id`，id 可留空自动解析）。
当前配了 **1 个作者**：`4517xx`（**辉映星辰允如光**，鸣潮服装 mod，28 帖）。

| 列 | 说明 |
|---|---|
| 日期 / 发布时间 | `publish_time`（unix 秒，**按北京时间解**） |
| 名称 | 帖子标题（通常就是 mod 名，如「穗穗- 夜魅（全配件）」） |
| 作者 | 爱发电昵称 |
| **价格** | `min_price`，**0 = 免费帖**（只有免费帖拿得到正文和配图） |
| 页面链接 | `https://afdian.com/p/<post_id>` |
| 点赞 / 评论 | `like_count` / `comment_count` |
| 预览图 | 本地路径（多数为空，见下） |

#### 接口（都是实测，别重新摸索）

站点是**纯 Vue SPA、没有 SSR** —— `https://afdian.com/a/<slug>` 返回的是 19KB 空壳，
`<title>` 都是通用的「爱发电 · 连接创作者与粉丝的会员制平台」，**HTML 里没有任何帖子数据**。
所以纯 HTTP 抓页面是白费功夫。**开发期定位接口的办法**：用项目现成的有头浏览器
（`arca_watcher.browser.browser_page` + xvfb）打开创作者页，监听 `response` 事件把
`/api/` 调用打出来。运行期只用下面这三个接口，**不需要浏览器**。

```
搜索作者   GET /api/creator/list?q=<关键词>&page=N
           → data.list[] 含 name / url_slug / user_id / creator.doing；data.has_more
作者资料   GET /api/user/get-profile-by-slug?url_slug=<slug>
           → data.user.{user_id, name, url_slug, creator.doing}
帖子列表   GET /api/post/get-list?user_id=<uid>&type=old&publish_sn=<游标>&per_page=5
           → data.{list, has_more}
```

**两个坑（都实测踩过）**：

- ⚠️ **别用 `/api/creator/search`** —— 它返回 `{"ec":40100,"em":"该功能需要登录查看"}`。
  看着像"爱发电搜索要登录、接不了"，其实**搜索页走的是 `/api/creator/list?q=`**，
  匿名完全可用。
- ⚠️ **翻页是游标 `publish_sn`，不是 `page`** —— 传 `page=1/2/3` 会**一直返回同一页**，
  很容易误判成"这个作者只有 5 条帖"。游标取上一页最后一条的 `publish_sn`，起始值传 `0`。
  `per_page` 实测被服务端锁死在 **5**（传 100 也只给 5 条）。

#### ⚠️ 付费帖拿不到正文和配图

`min_price > 0` 的帖 `is_public=0`，匿名请求下 `content` / `preview_text` / `pics`
**全被抽空**，`cover` 也多数为空（实测 28 条帖只下到 **1 张**图）。
只能拿到标题、发布时间、帖子链接、点赞评论数。

性质与 Patreon 受限期完全一样：**告诉你"某作者今天发了个新 mod、叫什么、原帖在哪"**，
想拿文件得自己发电（付费）。所以它没有「下载链接」列，也不生成网盘链接汇总。

> 想加作者：`GET /api/creator/list?q=<名字>` 拿到 `url_slug`，往 `[creators]` 加一行。
> ⚠️ slug **大小写敏感**（同时用作目录名和 state 文件名），别手抄错。

---

## 每日健康巡检（防静默故障）

**每天早 8 点** 收到一条微信日报，覆盖全部五个来源。

**为什么需要**：程序已经出过三次**静默故障** —— HTML 生成不出来（不报错）、历史条目被重复当新 mod 推送、
**Patreon 登录态过期导致预览图悄悄退化为模糊**。每一次都是人工检查才发现的，系统一次都没主动说过话。
这个巡检就是补上这一环。

日报长这样：

```
Mod 监测日报 · 全部正常

✅ 可可站：✅ · 文件 ✅
   累计 8 条 · 每日表 1 个 · 图 8 张，2 分钟前轮询过 · 上次有新 mod 2.0 天前
✅ NexusMods：✅ · 文件 ✅
   累计 1 条 · 每日表 1 个 · 图 1 张，1 分钟前轮询过 · 上次有新 mod 1 分钟前
✅ arca.live：✅ · 文件 ✅
   累计 10 条 · 每日表 2 个 · 图 10 张，1 分钟前轮询过 · 上次有新 mod 16.4 小时前
✅ Patreon：✅ · 文件 ✅
   累计 108 条 · 每日表 12 个 · 图 106 张，5 分钟前轮询过 · 上次有新 mod 3.2 小时前
✅ Patreon 登录态：有效（user 228177049 · can_see_nsfw=True）
✅ 爱发电：✅ · 文件 ✅ · 1 个作者
   累计 28 条 · 每日表 16 个 · 图 1 张，3 分钟前轮询过 · 上次有新 mod 1.2 小时前
✅ GameBanana：本机 0.2 小时前跑过 · 运行正常
   累计 6 条 · 上次有新 mod：2026-10-12 22:35:16
```

| 检查项 | 说明 |
|---|---|
| 服务状态 | systemd 是否 active |
| 文件完整性 | 每日 CSV / 总表 / index.html / 预览图 是否都在 |
| 服务是否在跑 | `last_poll`（**每轮都写**）距现在多久；超 24 小时标 ⚠️ |
| 站点是否在出货 | `last_new_at`（**只在入库时写**）距现在多久；超 7 天标 ⚠️ |
| GameBanana 是否在跑 | 读本机推上来的状态文件；超 6 小时未更新 → 报"本机可能一直没开机" |
| **Patreon 登录态** | **主动打一次 `api.patreon.com/current_user`**。文件检查看不出模糊降级，只能靠探针 |

> ⚠️ Patreon 那条是**唯一一个会发网络请求**的检查项。网络故障返回
> 「⚠️ 探测失败（网络原因）」，**不会**误报成「登录态失效」—— 一次抖动不该把人叫去换 cookie。

> 这两个时间戳必须分开，不能合成一个。合起来的话，「站点连续多天没出新 mod」会被
> 误报成「服务停摆」—— 2026-10-12 可可站连静两天，旧逻辑据此报了「34.5 小时未轮询」，
> 实际每 10 分钟都在跑。

**实现**：
- 服务器：`healthcheck.py` + `kekehxl-healthcheck.timer`（08:07 跑，带随机抖动）—— **服务器 24/7，所以电脑关机也照报**
- 本机：GameBanana 每轮跑完把状态 scp 到服务器的 `status/gb_status.json`（失败不影响采集）

```bash
# 手动跑一次日报
sudo systemctl start kekehxl-healthcheck.service
tail -20 /home/ubuntu/kekehxl-watcher/healthcheck.log
```

> 任一来源的数据连续 7 天没有新增时，日报会标 ⚠️ —— 这是"它悄悄不工作了"的主要信号。

---

## 常用运维命令

```bash
# 查看服务状态
sudo systemctl status kekehxl-watcher arca-watcher nexus-watcher patreon-watcher afdian-watcher

# 查看实时日志
tail -f /home/ubuntu/kekehxl-watcher/watcher.log          # 可可站
tail -f /home/ubuntu/kekehxl-watcher/arca-watcher.log     # arca.live
tail -f /home/ubuntu/kekehxl-watcher/nexus-watcher.log    # NexusMods
tail -f /home/ubuntu/kekehxl-watcher/patreon-watcher.log  # Patreon
tail -f /home/ubuntu/kekehxl-watcher/afdian-watcher.log   # 爱发电

# 重启（改代码或配置后）
sudo systemctl restart kekehxl-watcher
sudo systemctl restart arca-watcher
sudo systemctl restart nexus-watcher
sudo systemctl restart patreon-watcher
sudo systemctl restart afdian-watcher

# 手动跑一次
cd /home/ubuntu/kekehxl-watcher && python3 run_once.py                    # 可可站
cd /home/ubuntu/kekehxl-watcher && xvfb-run -a python3 run_arca_once.py   # arca.live
cd /home/ubuntu/kekehxl-watcher && python3 run_nexus_once.py              # NexusMods
cd /home/ubuntu/kekehxl-watcher && python3 run_patreon_once.py            # Patreon
cd /home/ubuntu/kekehxl-watcher && python3 run_afdian_once.py             # 爱发电

# Patreon 预览图回填（换了 session_id 之后跑；先 --dry-run 看统计再正式跑）
cd /home/ubuntu/kekehxl-watcher && python3 patreon_refresh_previews.py --dry-run
cd /home/ubuntu/kekehxl-watcher && python3 patreon_refresh_previews.py
cd /home/ubuntu/kekehxl-watcher && python3 patreon_refresh_previews.py --creator Puddingow  # 只跑一个作者

# 查看归档产出
find /home/ubuntu/kekehxl-watcher/out -type f | sort
```

本地：

> ⚠️ **公开仓库不含 `local/sync.ps1` 和 `local/install_sync_task.ps1`** —— 它们写有
> 你的服务器地址和 SSH 密钥名，已在 `.gitignore` 里排除。从仓库克隆后需要按本节
> 说明自行创建（`$Server` 填 `ubuntu@你的服务器IP`，`$SshKey` 填私钥路径）。

```powershell
# 手动同步服务器来源
powershell -NoProfile -ExecutionPolicy Bypass -File "local\sync.ps1"

# 手动跑一次 GameBanana（本机直连）
python run_gb_once.py

# 手动跑一次原图/附件下载（会处理队列里所有未完成项，可能跑很久）
python run_gb_download.py

# 手动跑一次 arca 图片/Mod 下载；--plan-only 只解析不下载，--limit N 只跑 N 个帖子
python run_arca_download.py
python run_arca_download.py --plan-only --limit 3

# 查看队列状态（pending/partial/done/failed 各多少）
python -c "import json;d=json.load(open('state.gb_downloads.json',encoding='utf-8'));import collections;print(collections.Counter(v.get('status') for v in d['items'].values()))"
python -c "import json;d=json.load(open('state.arca_downloads.json',encoding='utf-8'));import collections;print(collections.Counter(v.get('status') for v in d['items'].values()))"

# 查看四个计划任务
schtasks /Query /TN "KekehxlModSync"
schtasks /Query /TN "GameBananaModWatch"
schtasks /Query /TN "GameBananaModDownload"
schtasks /Query /TN "ArcaModDownload"

# 强制触发
schtasks /Run /TN "GameBananaModWatch"
schtasks /Run /TN "GameBananaModDownload"
schtasks /Run /TN "ArcaModDownload"

# 项目目录整体搬走后，重建下载任务（路径会重新解析）
powershell -NoProfile -ExecutionPolicy Bypass -File "local\install_gb_download_task.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "local\install_arca_download_task.ps1"
```

---

## Web 下载看板（2026-11-01 上线）

本机双击 **`local\run_status_server.bat`**，浏览器会自动打开
**http://127.0.0.1:8765/**。页面每 5 秒自动刷新；除了看状态，还能对失败/卡住的条目**点「重试」**
（重新入队并立即拉起对应下载器），或点右上角**「自动换节点」**让 Clash 立刻切到一个
能访问 GameBanana / arca 的节点。

| 区域 | 内容 |
|---|---|
| 顶部卡片 | 总条目 / 已完成 / 待处理·续传 / 排队 / 需手动 / 失败 / 已下载大小 / 磁盘剩余。失败卡片会显示「N 个文件待重试 / N 条将自动重试」 |
| 环境提示 | Clash 最近 15 分钟出现 `dial ... i/o timeout` 时直接提示「节点可能掉线」；下载日志 2 小时没更新时提示计划任务可能没跑 |
| 自动换节点 | 右上角按钮：读取 GLOBAL / 规则链策略组，用目标站点测延迟，切到可用节点并实测验证；下载任务开始和中断时也会自动执行 |
| 下载进度 | 未完成的 `.part`、已写字节、所属模组；按文件 mtime 区分「正在写盘 / 等待重试 / 等待下轮续传 / 失败·将自动重试」，没有 `.part` 时自动隐藏 |
| 队列表格 | arca.live + GameBanana 两条队列：状态、来源、标题、下载日、图片/文件进度、大小、尝试次数、失败原因；失败/卡住的条目带**重试**按钮，点**详情**看每个文件 |
| 重试 | 单条「重试」或工具栏「重试全部失败」。重置 attempts / last_error / retry_after，保留已完成的文件；如果下载进程正在跑会拒绝，避免覆盖它收尾时的状态 |
| 筛选 | 标题/链接/文件名搜索、来源、下载日、状态（下载中/排队/已完成/需手动/失败） |
| 需手动下载 | 链接失效、密码不对、站外网盘等确实无法自动下载的项，点击直接打开；可一键复制全部链接。nahida 分享链接已于 2026-11-01 支持自动下载，不再出现在这里 |
| 采集源累计 | 可可站 / arca.live / NexusMods / GameBanana / Patreon / 爱发电 的累计条数、最近发现、每日表、预览图数 |
| 日志尾部 | `arca_download.log` / `gamebanana_download.log` 最近 200 行，可切换 |

实现是纯标准库 `http.server`（`web_status.py`），不引入 Flask/FastAPI。
默认只监听 `127.0.0.1`；想让手机/局域网访问可以：

```powershell
python web_status.py --host 0.0.0.0 --port 8765
```

> 写接口 `POST /api/retry` 和 `POST /api/proxy/switch` 默认只接受本机请求
> （带 `Content-Type: application/json`）。局域网模式下确实需要远程操作，
> 再加 `--allow-remote-retry`。

> 注意：页面会显示模组标题、原帖链接和待手动链接。局域网开放前先确认可接受。

> 「原路径已无文件」表示该条目队列里是 done，但按记录的文件名/日期目录找不到文件
> （通常是用户手动重命名/移动/打包过），不是下载失败。

---

## 配置修改

编辑 `config.ini` 后重启服务：

| 文件 | 来源 |
|---|---|
| `config.ini` | 可可站 |
| `config.arca.ini` | arca.live |
| `config.nexus.ini` | NexusMods |
| `config.patreon.ini` | Patreon |
| `config.afdian.ini` | 爱发电 |
| `config.gb.ini` | GameBanana（本机） |

常用配置项：

| 配置项 | 说明 |
|---|---|
| `poll.interval_minutes` | 轮询间隔（分钟） |
| `site.category_id` | 可可站：`21`=鸣潮Mod，`139`=终末地Mod |
| `site.categories` | arca.live：`modRecom,WWMI,enFielMd`（Mod 相关分类） |
| `notify.pushplus_token` | PushPlus token（主推送通道，微信，免费实名用户 200 次/天） |
| `notify.serverchan_key` | Server酱 SendKey（兜底：PushPlus 失败时才用） |
| `site.password` | 站点访问密码 |
| `poll.cf_wait_seconds` | arca.live：每页额外等待秒数（等 Cloudflare） |
| `creators.*` | Patreon `[creators]`：`<vanity> = <campaign id>`，每行一个作者。**vanity 大小写敏感**（决定目录名）；行尾可写 `; 说明` |
| `creators.*` | 爱发电 `[creators]`：`<slug> = <user_id>`，同上。slug 从 `api/creator/list?q=` 拿 |
| `auth.session_file` | Patreon：`session_id` 凭据**文件路径**（值本身不写进 config）；留空 = 匿名，预览图会模糊 |
| `site.api_key` | NexusMods：官方 API key |
| `download.enabled` | GameBanana：原图/附件下载总开关 |
| `download.dest_dir` | GameBanana：分发根目录，文件直接进 `<dest_dir>\W-YYYY.MM.DD\` |
| `download.folder_prefix` | GameBanana：日期文件夹前缀（默认 `W-`） |
| `download.images` / `download.files` | GameBanana：分别控制是否下原图 / 附件 |
| `download.min_free_gb` | GameBanana：剩余空间低于该值暂停下载（默认 3） |
| `download.image_workers` | GameBanana：原图并发线程数（默认 4） |
| `download.read_timeout` / `download_workers` / `image_workers` / `segment_workers` | arca.live：下载读超时（默认 30s，卡住即换节点）、文件并发（4）、图片并发（2，图床 4 并发会回 429）、kio 分段并发（4） |
| `download.max_run_minutes` | GameBanana：每轮最多跑多久（默认 120，任务时限 180） |

> **推送通道**：PushPlus 为主（微信，免费实名用户 200 次/天），Server酱 只作兜底
> （Turbo 免费版每天仅 5 条）。获取 token：<https://www.pushplus.plus/> 微信扫码登录 →
> 实名认证 → 「一对一推送」页复制 token → 填进各 config 的 `[notify] pushplus_token`
> → 重启对应 service。`pushplus_token` 留空时行为与以前一致（只用 Server酱）。
> 配好后可先发一条测试：`python push_test.py config.ini`（失败会自动走 Server酱 兜底）。

---

## 新增一个 Mod 站点

系统按「来源」隔离，加站点无需改动目录结构。假设要新增站点 `example.com`：

1. **复制一份配置**（配置名即来源名，决定文件夹名）：

   ```bash
    cd /home/ubuntu/kekehxl-watcher
    cp config.ini config.example-com.ini
    ```

2. 编辑新配置，改这几项：

    ```ini
    [site]
    source_name = 示例站          ; ← 本地子文件夹名，唯一
    base_url    = https://example.com
    password    = <该站密码>
    category_id = <对应分类ID>

    [storage]
    state_file = state-example.json   ; ← 各站状态文件必须不同！
    ```

3. **新写一个采集器**（若站点结构不同）：仿照 `kekehxl_watcher/kekehxl.py`
   实现「登录 + 拉列表」，`poller.py` 与 `storage.py` 可直接复用。

4. 需要独立进程时，再复制一份 `deploy/kekehxl-watcher.service` 改名并指向新配置。

> ⚠️ 多个来源共用同一台服务器时，**`state_file` 和 `source_name` 必须各自唯一**，
> 否则状态会串。

---

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 微信收到「⚠️ 监测异常」 | 会话失效 / 站点结构变化 | 看日志定位；若为验证码，需更换出口 IP |
| 长时间无推送 | 站点确实无更新（正常） | 看 `_新发现.log` 确认 |
| 本地目录无文件 | 计划任务未运行 / SSH 密钥问题 | 手动跑 `local\sync.ps1` 看报错 |
| 桌面无弹窗 | 仅电脑开机且登录时才会弹 | 微信推送不受影响 |
| 日志出现「文件被占用未更新」 | CSV 正被 Excel 打开 | 关掉 Excel，下次同步自动补上；其余文件不受影响 |
| `.ps1` 报「意外的标记」语法错 | 文件 BOM 丢失或重复 | 确保 `sync.ps1` 为**单个** UTF-8 BOM 开头 |
| 日志出现「安全闸拦截」 | 路径解析异常，已被拦下 | 说明有 bug 或异常输入，报给维护者 |
| 表格里图片显示"无图" | 该 mod 原帖没有缩略图 | 正常，非所有帖子都带图 |
| 同步变慢 | 首次运行需拉取全部图片 | 之后走增量，正常情况秒级 |
| 抓取报 `ProxyError` / `Unable to connect to proxy` | **系统代理开启**，`requests` 自动读取 | 代码已统一 `trust_env=False` 绕过；若新增请求务必沿用 |
| GameBanana 报 503 / `error code 1200` | 当前代理出口被 GameBanana 封了 | 换节点，或把 `config.gb.ini` 的 `[net] proxy` 改成 `off` 走直连（慢但可用） |
| GameBanana `ProxyError ... FileNotFoundError` | 注册表把 https 代理写成 `https://127.0.0.1:7897`，requests 去和明文代理做 TLS 握手 | 别开 `trust_env`；用 `proxy.resolve_proxy()` 的自动纠正（默认已是） |
| `.bat` 报「不是内部或外部命令」乱码 | `.bat` 里写了中文注释 | **`.bat` 必须纯 ASCII**（cmd 按 GBK 解码会拆坏行） |
| arca.live 日志频繁「验证码未通过」 | Cloudflare 升级风控 / 出口 IP 被标记 | 调大 `poll.cf_wait_seconds`；仍不行则需换出口 |
| arca-watcher 被 systemd 重启 | 触及 `MemoryMax=900M` | 正常自愈；若频繁则调大间隔或换更大内存的机器 |
| 服务器内存吃紧 | Chromium 峰值 | 先 `systemctl stop arca-watcher` 让出内存，再排查 |
| 同步日志**只有「开始」没有「结束」**，且之后每轮都被跳过 | 有来源目录名**含空格**：`sync.ps1` 把路径以变量传给 `scp.exe`，PowerShell 的引号规则会把它拆坏，整轮静默中断；接着计划任务的 `IgnoreNew` 把后续轮次全部跳过 | 改该来源 `config.*.ini` 的 `source_name` 去掉空格（改完要同步改服务器上的 `out/` 目录名）。`sync.ps1` 现在会提前剔除含空格的路径并记一条日志 |
| NexusMods 报「API key 无效或未填写（HTTP 401）」 | key 没填 / 填错 / 被吊销 | 去 <https://www.nexusmods.com/users/myaccount?tab=api> 重新生成，填进 `config.nexus.ini` 的 `site.api_key` |
| NexusMods 报「被限流（HTTP 429）」 | 请求过密（小时配额 100 次） | 调大 `poll.interval_minutes`；30 分钟一轮远够用 |
| Patreon 报 `ViewForbidden: You do not have permission to view this campaign` | `[creators]` 里填的是 **user id**，不是 campaign id（最容易从 graphtreon 的 `creatorId` 抄错） | 把 campaign id 留空让程序自动解析，或改用 `campaigns?filter[vanity]=<名字>` 查到的 id |
| Patreon 报「找不到作者 X」 | `vanity` 写错 —— 它是 `patreon.com/<vanity>` 那一截，**不是显示名** | 例：`patreon.com/c/shaojiang/home` → vanity 是 `shaojiang`；`EnteleJiang` 是显示名，写进去找不到 |
| Patreon 首轮跑完**没收到**微信 | **正常** —— 首轮是全量建档，按设计不推送 | 之后有新帖才会推；看日志确认「已归档 N 条历史帖子（不推送通知）」 |
| Patreon 的「预览图」列为空 | 该帖是 `text_only` 纯文本公告，本来就没图；或该帖是付费限定（`current_user_can_view=False`） | 正常，非所有帖子带图 |
| Patreon 的「预览图」列**从某个时间点起全空** | **`session_id` 过期** —— poller 探测到登录态失效后会拒绝落盘模糊图，新帖预览图留空 | 按「更新 Patreon session」一节换凭据，**并跑 `patreon_refresh_previews.py` 回填**（不跑永远不会自己补回来） |
| Patreon 历史预览图**全是模糊的** | 这些图是**配 session 之前**下载的，服务端烤糊的版本；日常轮询不会重下（`download_images` 对已存在文件永久跳过） | 跑 `python3 patreon_refresh_previews.py` 回填（旧图会挪到程序目录的 `patreon_blurred_bak/`） |
| 汇总目录里混进 `*.blurred_bak/` 或 `state.*.refill.json` | 早期版本把回填备份/记录写在了 `out/` 里，被 `sync.ps1` 的 `find` 扫到 | 已修（挪到程序目录）；本地删掉这两个即可 |
| Patreon 大部分行「预览图」为空 | **登录态只看得到一部分帖子** —— 看不见的帖 `image.url` 仍是糊的，poller 拒绝落盘 | 属预期。想解锁更多：换一个**做过邮箱/年龄验证或已 pledge** 的账号，再跑回填脚本 |
| 想让看不见的帖子也存个（模糊）预览图 | poller 的闸门 2 主动跳过了带 `b` 参数的 URL | 改 `patreon_watcher/poller.py` 的 `_download_previews`，把闸门 2 去掉、或改成回落到 `thumbnail.original`（2560px 的模糊版，比 620 版看得清）。⚠️ 但 `download_images` 对已存在文件永久跳过，糊图一旦落盘就不会再被回填覆盖 —— 落盘前想清楚 |
| Patreon 归档目录下只有子目录、没有 CSV | 这是**按作者分目录**后的正常形态（`out/Patreon/<作者>/`） | 正常。`healthcheck` 会自动跨子目录聚合 |
| 新加的作者目录名变成了小写 | `load_config` 里 `optionxform` 设晚了（必须在 `read()` 之前） | 已修（2026-10-15）。若目录名已生成错，改名目录 + `state.patreon.*.json` 一起 |
| 爱发电帖子列表**永远只有 5 条** | 翻页参数用错了 —— 是游标 `publish_sn` 不是 `page` | 见「爱发电」一节；`client.py` 里已按游标实现 |
| 爱发电搜不到作者，接口返回 `ec:40100 该功能需要登录查看` | 用的是 `/api/creator/search`（要登录） | 换成 `/api/creator/list?q=<关键词>`，匿名可用 |
| 爱发电大部分行「预览图」为空 | **付费帖**（`min_price > 0`）匿名拿不到配图，属正常 | 不是故障。免费帖才有图 |
| 爱发电抓到的正文/配图全空 | 同上，`is_public=0` 的帖正文和图片被抽掉 | 正常。这个来源只做"发现了什么" |
| 爱发电的日期差了一天 | `publish_time` 是 unix 秒，**要按北京时间（UTC+8）解**，按 UTC 解会差 8 小时 | `afdian_watcher/parser.py` 里已固定用 UTC+8 |
| 日报报 `❌ Patreon 登录态失效` / 收到「Patreon 登录态失效」告警 | 同 `session_id` 过期 | 同上 |
| Patreon 报 `401 LoginRequired` | `session_id` 未配置或已失效 | 检查 `patreon_session.txt` 是否存在、有内容、权限 600 |
| 日志出现「登录态探测失败（网络原因，非凭据问题）」 | 服务器到 `api.patreon.com` 网络抖动 | **不用换 cookie** —— 与凭据无关，下轮自愈 |
| Patreon 一直警示「未配置 session」 | `config.patreon.ini` 的 `[auth] session_file` 为空 | 属匿名模式，能跑但预览图是模糊的；要清晰的按「更新 Patreon session」配 |

**重置采集状态**（会重新把当天全部当作新 Mod）：

```bash
cd /home/ubuntu/kekehxl-watcher && rm -f state.json && sudo systemctl restart kekehxl-watcher
```

---

## 重新部署 / 更新代码

```bash
# 本地
scp -i ~/.ssh/your_key -r kekehxl_watcher run_once.py run_forever.py config.ini \
    ubuntu@YOUR_SERVER_IP:/home/ubuntu/kekehxl-watcher/
ssh -i ~/.ssh/your_key ubuntu@YOUR_SERVER_IP \
    "sudo systemctl restart kekehxl-watcher"
```

Patreon（改了 `patreon_watcher/` 之后）：

```bash
scp -i ~/.ssh/your_key -r patreon_watcher patreon_refresh_previews.py \
    run_patreon_once.py run_patreon_forever.py config.patreon.ini healthcheck.py \
    ubuntu@YOUR_SERVER_IP:/home/ubuntu/kekehxl-watcher/
# ⚠️ 凭据文件单独传，传完立刻收紧权限
scp -i ~/.ssh/your_key patreon_session.txt ubuntu@YOUR_SERVER_IP:/home/ubuntu/kekehxl-watcher/
ssh -i ~/.ssh/your_key ubuntu@YOUR_SERVER_IP \
    "chmod 600 /home/ubuntu/kekehxl-watcher/patreon_session.txt && \
     sudo systemctl restart patreon-watcher"
```

爱发电（改了 `afdian_watcher/` 之后）：

```bash
scp -i ~/.ssh/your_key -r afdian_watcher run_afdian_once.py run_afdian_forever.py \
    config.afdian.ini healthcheck.py rebuild_galleries.py \
    ubuntu@YOUR_SERVER_IP:/home/ubuntu/kekehxl-watcher/
ssh -i ~/.ssh/your_key ubuntu@YOUR_SERVER_IP \
    "chmod 600 /home/ubuntu/kekehxl-watcher/config.afdian.ini && \
     sudo systemctl restart afdian-watcher"
```

> 首次部署还要装服务单元（`deploy/afdian-watcher.service` → `/etc/systemd/system/`）
> 再 `systemctl enable --now afdian-watcher`。

> ⚠️ `config.ini` 含站点密码与推送密钥，权限应为 `600`，**不要提交到任何代码仓库**。
> `config.patreon.ini` / `config.afdian.ini` 同理（含 PushPlus token / Server酱 SendKey）；
> `patreon_session.txt` 更是 —— 它等同 Patreon 账号登录凭据。

### 换服务器（实例到期 / 迁移）

2026-10-25 首尔机到期后迁到香港机，完整走过一遍，顺序如下：

1. **装浏览器依赖**（arca.live 用 Playwright）：

   ```bash
   sudo apt-get update && sudo apt-get install -y xvfb
   sudo -H pip3 install playwright
   sudo python3 -m playwright install-deps chromium
   sudo -u ubuntu -H python3 -m playwright install chromium   # 装进 ubuntu 用户的缓存
   ```

2. **传程序与配置**：按上面「重新部署」的 scp 命令，另加 `patreon_session.txt`
   （`chmod 600`）、`healthcheck.py`、`rebuild_galleries.py`、`patreon_refresh_previews.py`。

3. **重建去重状态**（旧机 state 没了，但本地汇总目录有全部历史 CSV）：

   ```bash
   python deploy/rebuild_state_from_csv.py \
       --summary-dir "D:/.../A_每日更新/_Mod每日汇总" --out-dir deploy/state_rebuilt
   # 把 deploy/state_rebuilt/*.json 传到服务器根目录
   ```

   > 只重建 CSV 里的 id **不够**：arca 的 `모드 추천` 分类不按时间排序，列表页有上百条
   > 从未入库的老帖，空 state 起服会把它们全当新帖归档。用
   > `xvfb-run -a python3 deploy/seed_arca_seen.py --apply --keep-since YYYY-MM-DD`
   > 把该日期之前的老帖标为已见（当天及以后的留给正常轮询归档）。

4. **回灌历史产出**：把本地 `_Mod每日汇总\<来源>\` 整个 `scp -r` 到服务器 `out/`，
   否则服务器的 `all_mods.csv` 会从当天重新开始，同步时还会把本地历史覆盖掉。

5. **改指向**：本地 `local/sync.ps1` 的 `$Server` 和 `config.gb.ini` 的
   `[report] server` 改成新 IP。

6. **起服务**：`sudo cp *.service *.timer /etc/systemd/system/ && sudo systemctl daemon-reload`，
   再逐个 `enable --now`；先用 `systemctl is-active` + 各 `*-watcher.log` 验证，
   最后跑一次 `python3 healthcheck.py` 确认日报能推出来。
