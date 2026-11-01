# Mod 命名工坊 PRD（本地网页工具 tools/mod-rename）

> 状态：P0 已实现并自测通过（2026-11-01）；P1 拆包裁封面、P2 接模型未开始
> 日期：2026-11-01
> 需求来源：用户 2026-11-01「根据命名相关文档规则我要开发一个专门针对命名的应用」
> 关联文档：`CLAUDE.md`（「Mod 重命名」与「每日 Mod 上传流程」）、`scripts/daily-classify.mjs`（分类与去重规则）、`scripts/check-mod-keys.mjs`（自检脚本）、`wuwa_mod_crawl/README.md`（来源目录与下载队列）、`docs/batch-upload-mod-prd.md`
> 已确认的四个选择：形态=**本地网页工具**；翻译=**接模型**（词表兜底）；执行范围=**改名 + 拆包裁封面 + 分类校验**（不含归位/上传）；范围=**只做 arca.live / GameBanana 两个来源**

---

## 1. 背景与问题

### 1.1 现在怎么做

每个来源目录下的下载物都是爬虫给的原始名，不能直接上传：

```
W-2026.11.01/
├─ arca.live/       금희,음림,카멜리아 팬스좌 UHD.zip   ← 韩语、多角色合集、一张四宫格长图
└─ GameBanana/      【Merge整合】LongHair + Longyan (長髮+胧嫣).zip   ← 英文名、括号是半角
```

要变成站内能用的条目，得同时满足四件事（2026-11-01 那天是手工做的）：

1. **命名**：`<角色>-<名称>[v版本]（切换键）by <作者>`，角色必须是 `characterImageMap` / 库内 distinct 已有的值；
2. **拆分**：一个 kio/GB 合集里常有 3–4 个角色的皮肤，要拆成单角色包，并从合集长图里裁出各自封面；
3. **校验**：跑 `resolveCharacterAndTitle`，角色不在库里 = 上传后凭空多一个分类，而且**不报错**；
4. **归档**：原合集留档，非鸣潮（终末地）的挪开。

### 1.2 痛点

| 痛点 | 后果 |
|---|---|
| 韩语标题要人肉对照（금희=今汐、팬스좌=粉丝福利、히유키=绯雪…） | 每条都要翻 `state.arca_downloads.json` + 猜，13 条花 40 分钟 |
| 角色写错不会报错 | 前台多出「卡梅莉亚」这种假分类，只有用户自己发现 |
| 拆包 + 裁图要开压缩软件和截图工具 | 手一抖就漏文件，2 GB 的包没法和源包对账 |
| 改完的名字不可逆 | 拼错了只能凭记忆改回去 |

### 1.3 与现有流程的关系

- **不是替代** `upload-daily-by-date.mjs`：本工具只负责「把来源目录整理成规范名」，上传、网盘、去重入库全部不变。
- **规则只认一份**：直接 `import` `scripts/daily-classify.mjs` 的 `resolveCharacterAndTitle` / `dedupKey` / `stripRenameSuffix`，**不在工具里重写一套**（否则两边规则一漂移就重演「事后改 character 让去重失效」）。
- **不写库**：只读 `mods.character` 与已有 `(character,title)` 做校验，绝不 INSERT/UPDATE。

---

## 2. 目标 / 非目标

### 2.1 目标

- **G1**：打开 `http://127.0.0.1:4318`，选一个日期目录，工具自动列出 `arca.live/`、`GameBanana/` 下的全部条目，并带上原帖标题 / 作者 / 分类（来自 crawl 的 state JSON 与 `all_mods.csv`）。
- **G2**：每条给出**建议名**（词表优先、模型兜底）与**角色校验结果**（✅ 在库 / ⚠️ 待确认），默认勾选可应用项，黄标默认不勾。
- **G3**：合集包能在页面里拆成单角色包，并从合集长图里框选/选面板生成各包封面。
- **G4**：一键应用后写出**可撤销**的改名记录（journal），`撤销` 能把目录恢复原样。
- **G5**：全流程**不新建 character**、不覆盖已存在文件、不动日期目录顶层。

### 2.2 非目标（第一期明确不做）

- ❌ 不把改好的包挪到 `W-日期/` 顶层，不触发上传/入库（用户已确认）。
- ❌ 不做「把某角色整批迁到新分类」（daka 那套去重键风险，见 CLAUDE.md）。
- ❌ 不做图片 OCR / 自动识别画面里的角色（封面靠人选面板）。
- ❌ 不支持 arca/GB 以外的来源目录（Nexus、Patreon、爱发电、可可站）。
- ❌ 不做多游戏：`game_key` 只有 `wuthering-waves`，终末地（EFMI）一律不参与命名。

---

## 3. 用户故事

1. **作为站长**，我早上把爬虫下载好的 `W-2026.11.01/{arca.live,GameBanana}` 交给工具，10 分钟内拿到 13 条规范名，而不是翻半小时文档。
2. **作为站长**，我看到「心月狐-狐之星座」被标黄，因为模型把「어흐」译得没把握——我直接改成自己要的名字再勾选。
3. **作为站长**，我把 `금희,음림,카멜리아…zip` 拆成 4 个包，并给 4 个包各选一张裁好的封面，不用再开压缩软件对账。
4. **作为站长**，我点错了名字，点「撤销」就能全部退回原名，不用凭记忆手改。
5. **作为站长**，我希望工具告诉我「这条库里已经有了（去重键重复）」，而不是等我上传完才发现被跳过。

---

## 4. 方案设计

### 4.1 形态：独立本地工具（`tools/mod-rename/`）

| 方案 | 取舍 |
|---|---|
| **独立本地工具（选用）** | 只绑 `127.0.0.1`，用 Node 内置 `http` + `fs`；不碰 Next 路由 ⇒ 部署到 Vercel 也带不出去。缺点：没有 Tailwind/shadcn，页面风格要手写。 |
| Next dev-only 页面 `/admin/rename` | 能复用组件与后台壳，但 fs 操作代码会随仓库上 Vercel，必须靠 `process.env.VERCEL` 硬关；一个公开路由能改服务器文件，安全面太大。 |
| Electron / Tauri | 双击即用、原生选目录，但要新增重型依赖与打包链路，违背 CLAUDE.md「不引入未使用的库」。 |

```
tools/mod-rename/
├─ server.mjs           # http 服务 + 路由 + 文件操作（只绑 127.0.0.1）
├─ lib/
│  ├─ scan.mjs          # 扫来源目录、读 state JSON / CSV，生成条目
│  ├─ suggest.mjs       # 词表 + 模型 → 建议名（纯函数，可单测）
│  ├─ plan.mjs          # 目标名、冲突检测、拆包计划（纯函数）
│  ├─ apply.mjs         # 落盘 + journal
│  └─ undo.mjs          # 按 journal 反向恢复
├─ public/
│  ├─ index.html        # 单页（原生 JS + 原生 CSS，无 CDN，离线可用）
│  └─ app.js
└─ README.md            # 启动方式、端口、安全说明
```

**启动**：`npm run rename-ui` → `http://127.0.0.1:4318/?t=<一次性 token>`。

### 4.2 命名流水线

```
原始名(韩语/英文) ─┬─> ① 切分：作者 / 版本 / 切换键 / 角色
                  ├─> ② 词表归一（arca 韩语词表，见 memory/arca-korean-name-mapping）
                  ├─> ③ 未命中 → Claude 结构化输出（给角色白名单 + 词表 + 命名规则）
                  ├─> ④ 组装 <角色>-<名称>[v版本]（切换键）by <作者>
                  └─> ⑤ 校验 resolveCharacterAndTitle → character ∈ 库内 distinct
                                                      └─ dedupKey 是否已存在（提示会去重）
```

- **② 词表是硬优先**：命中就**不问模型**。词表放 `tools/mod-rename/data/glossary.json`，等价于把今天这张对照表固化成文件；新增词条走 PR，不靠模型发挥。
- **③ 模型输入只给「角色白名单 + 韩语标题 + 已知词表命中」**，并要求返回 JSON：
  ```json
  { "characters": ["今汐","吟霖","椿"], "name": "粉丝福利UHD",
    "version": null, "hotkeys": null, "author": "문지기", "confidence": "high" }
  ```
  `characters` 里出现白名单外的值 ⇒ 直接判为失败（模型幻觉角色是最危险的失败模式）。
- **⑤ 校验用项目自己的函数**，不是本工具另写：`resolveCharacterAndTitle(key)` 得到 `character/title`，`dedupKey()` 得到去重键。

### 4.3 模型接入（唯一新增依赖）

- 用官方 SDK `@anthropic-ai/sdk`，**只作为 devDependency**、只被 `tools/` 引用，不进 app bundle。
  > ⚠️ 这是本次唯一新增的库，与 CLAUDE.md「不引入未使用的库」有张力，**需要你点头**；若不同意，退化为 `fetch` 裸调用（成本：错误处理、重试、类型全部自己写）。
- 模型：`claude-opus-5-5`；`max_tokens: 2000`；翻译这种短任务用 `output_config.effort: "low"`。
- 结构化输出：`output_config.format` 绑定 JSON Schema，再用项目已有的 `zod` 二次校验。
- 安全兜底：带 `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`（NSFW 向 mod 标题可能触发 `refusal`）。
- 失败策略：**20s 超时 → 词表结果 + 原名**，字段留空并标黄，绝不阻塞改名。
- Key 位置：本机 `.env.local` 的 `ANTHROPIC_API_KEY`（**不要**加到 Vercel 环境变量）。

### 4.4 拆包与封面

- **拆包 = 字节搬运**：读源 zip、按顶层目录过滤、以 `ZIP_STORED` 写入新 zip。
  实测（2026-11-01）：内容是不可压的 `.buf/.dds`，解压体积 ≈ 压缩体积，5.5 GB 拆分 19 秒完成；用 deflate 反而慢且几乎不省空间。
- **对账**：拆完必须比对「源包（去掉跳过的子树）的文件数 / 字节数」与「所有拆分包之和」完全相等，不等就整体回滚。
- **封面 = 前端 canvas 裁**：页面显示合集长图，用户点选面板（默认按 角色数 均分）→ 浏览器导出 PNG → 上传给服务端落盘。这样服务端**不需要图像库**（sharp 不是项目依赖）。
- **原包归档**：拆分完成后源包与合集长图移到 `<来源>/_合集原包/`，不删除。

### 4.5 落盘与撤销

- 应用前整批生成 `plan`，页面展示「原名 → 新名 / 拆成 N 包 / 会移动的文件」。
- 应用时写 journal：`tools/mod-rename/.journal/<ISO 时间>.json`，记录每个 `rename`/`move`/`mkdir`/拆分包产物。
- `撤销` 读 journal 逆序回滚；**已存在同名目标时拒绝覆盖**并停下报告。
- 保留最近 30 份 journal，更早的自动清理。

### 4.6 安全

| 风险 | 措施 |
|---|---|
| 任意网页调用本地端口 | 只绑 `127.0.0.1`；校验 `Origin`；每次启动生成随机 `t` token，写进 URL，缺失即 403 |
| 路径穿越 | 只允许 `WAVE_MOD_DAILY_BASE` 下 `W-YYYY.M.D` 目录及其子目录；拒绝 `..`、符号链接、盘符切换 |
| 误删 | 全程只有 `rename` / `move` / 新建；**不提供删除接口** |
| 双击误执行 | 所有写操作走 `POST /api/apply` 且必须带 `confirm: true` |

---

## 5. 数据与接口变更

**数据库**：无结构变更；只读两条查询（经 `scripts/psql-db.mjs` 的 psql，不走 Supabase REST）：

```sql
select distinct character from mods;
select character, title from mods where character = any($1);  -- 做去重键提示
```

**HTTP 接口**（全部 JSON，`127.0.0.1:4318`）：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/dirs` | 列出 `WAVE_MOD_DAILY_BASE` 下的日期目录 |
| GET | `/api/scan?dir=` | 扫描 `arca.live/`、`GameBanana/`，返回条目 + 原帖元数据 |
| POST | `/api/suggest` | 词表 + 模型，返回每条的 `characters/name/version/hotkeys/author/confidence` |
| POST | `/api/plan` | 组装目标名、跑 `resolveCharacterAndTitle`、查库校验、检测冲突与拆包方案 |
| GET | `/api/zip-tree?path=` | 列出 zip 顶层目录（供拆包映射） |
| POST | `/api/cover` | 保存前端裁好的封面 PNG（`{ pack, pngBase64 }`） |
| POST | `/api/apply` | 执行 plan，写 journal，返回 `journalId`（每条 entry 带 `source`，据此定位 `arca.live/` 或 `GameBanana/`） |
| GET | `/api/journals` | 最近可撤销的批次 |
| POST | `/api/undo` | 按 `journalId` 回滚 |

**新增文件（第一期）**：

- `tools/mod-rename/**`（上表结构）
- `tools/mod-rename/data/glossary.json`（韩语词表）
- `package.json` 增加 `"rename-ui": "node tools/mod-rename/server.mjs"`
- `.env.local` 增加 `ANTHROPIC_API_KEY`（本机，不入库）

---

## 6. 边界与异常

| 场景 | 处理 |
|---|---|
| 词表未命中 + 无 key / 超时 / 模型返回白名单外角色 | 名称留空、标黄、默认不勾选；不阻塞其他条目 |
| 角色不在库内 | 红标，**禁止勾选**（不给「我知道」的放行开关） |
| 目标名已存在（目录内） | 该条标红跳过，不覆盖 |
| 去重键已在库里 | 黄标提示「库里已有，上传会被跳过」——仍然允许改名（用户可能就是要重新上架） |
| 合集包里只有 1 个顶层目录 | 不提供拆分，提示「直接改名即可」 |
| 合集包里有子目录但来源是平铺 zip（如 `장리…_2.zip`） | 「整包转存」模式：包一层 `<包名>/` |
| zip 条目没有 UTF-8 标志位 | 提示可能乱码，禁止拆分（需先人工确认编码） |
| 目录型 mod（nahida 目录树） | 只改外层目录名，内部结构不动 |
| 终末地 / 非鸣潮 | 识别 `엔드필드`、`EFMI`、`Acrane`/`ENDMIN` 等标记，自动归入 `<来源>/_Endfield/`，不参与命名 |
| 磁盘剩余 < 源包体积 × 2 | 禁止拆分并提示 |
| 文件名含 `\ / : * ? " < > \|` 或半角 `/` | 自动替换为全角或 `-`，并在 plan 里显示替换前后 |
| 数据库连不上 | 分类校验降级为「未知角色」，全部不勾选，提示先修 `DATABASE_URL` / psql |
| 端口被占用 | 启动失败并提示换 `--port=` |

---

## 7. 验收标准

- [ ] `npm run rename-ui` 起服务，浏览器打开 `127.0.0.1:4318` 能看到 2026-11-01 的 13 个 arca 条目 + 5 个 GameBanana 条目。
- [ ] 每条都有：原文件名、原帖标题/作者（能对上时）、建议名、角色校验状态。
- [ ] 用今天的真实数据跑一遍，建议结果与手工结果**逐字一致**：
      `吟霖-办公室V2 by 문지기`、`今汐-粉丝福利UHD（丝袜黑）by 문지기`、`心月狐-狐之星座 by 마르마르마르`、`丹瑾-【Merge整合】LongHair + Longyan（長髮+胧嫣）by ZZZaEnjoyer` 等 18 条。
- [ ] 勾选后应用：目录里出现新名字，**没有任何文件内容变化**（字节总和不变）。
- [ ] 撤销后目录**完全恢复**（文件名、层级、字节数一致）。
- [ ] 拆分：4 份拆分包的文件数 / 字节数之和 == 源包对应子树（与今天的对账脚本同口径）。
- [ ] 角色校验：任何一条 character 不在库内都不能应用；生成名跑 `node scripts/check-mod-keys.mjs` 等价检查全绿。
- [ ] 断网 / 无 key 时，工具仍可完成改名（词表 + 人工填名），只在页面上提示「未接入模型」。
- [ ] 从局域网另一台机器访问 `http://<本机IP>:4318` 失败（服务只绑 127.0.0.1）。

---

## 8. 测试计划

- **单元测试（vitest，纯函数优先）**
  - `suggest.mjs`：词表命中/未命中、模型返回非法角色、超时降级；
  - `plan.mjs`：组装格式（版本位置在切换键/`by` 之前、半角 `/` 替换）、冲突检测、拆包映射；
  - `undo.mjs`：journal 逆序回滚、目标已存在时拒绝。
- **集成测试**：临时目录 + 合成 zip（含中英韩文件名、UTF-8 标志位），跑 apply → undo，断言目录快照一致。
- **手工冒烟**：拿 2026-11-01 的真实目录跑一遍，与今天手工结果比对；`check-mod-keys.mjs` 结果为 ✅。
- **E2E**：暂不接 Playwright（与项目现状一致）。

---

## 9. 分期

| 期 | 内容 | 产出 |
|---|---|---|
| **P0** | 扫描 + 词表建议 + 分类校验 + 改名 + journal 撤销 | 能替代「改名」这一步 |
| **P1** | 拆包 + 前端裁封面 + 对账 + `_合集原包` 归档 | 能替代「拆包裁图」这一步 |
| **P2** | 接 Claude（结构化输出 + 兜底），词表继续兜底 | 韩语新词不用手填 |
| **P3（本期不做）** | 归位到日期目录顶层、串起 `upload-daily-by-date.mjs`、后台化 | — |

---

## 10. 风险与回滚

| 风险 | 影响 | 回滚 |
|---|---|---|
| 改名拼错 / 勾错 | 目录名不对，上传后分类错误 | journal 一键撤销；**工具不删除任何文件** |
| 拆包丢文件 | mod 不完整，用户下载后报错 | 对账失败即整体回滚；源包归档保留 |
| 模型幻觉角色 | 前台多出假分类（静默） | 白名单硬校验 + 库内 distinct 校验，双重拦截 |
| 本地端口被网页利用 | 本机文件被改名 | 只绑 127.0.0.1 + Origin 校验 + 一次性 token + 无删除接口 |
| 新增 `@anthropic-ai/sdk` 依赖 | 与 CLAUDE.md 规则冲突 | 需用户确认；不同意则用 `fetch` 实现同一接口 |

---

## 11. P0 实现记录（2026-11-01）

代码：`tools/mod-rename/`，启动 `npm run rename-ui`，测试 27 条（`npx vitest run tools/mod-rename`）。

**已交付**

- 扫描两个来源；预览图按 `_1`/`-1` 编号归并到对应 mod；没有主条目的图自成一行（arca「需手动下载」条目）。
- 词表建议（韩语角色/皮肤词）+ GameBanana 子分类兜底（`Skins/Danjin` → 丹瑾）。
- 角色校验（`resolveCharacterAndTitle` + 库内 distinct）、去重键提示、目标同名冲突检测。
- 已是规范名的条目自动拆回各字段，并标「已是规范名」，不需要再改。
- 一次改名覆盖主条目 + 它的全部预览图；跨来源一次应用；journal 撤销（每条 op 自带目录）。
- 安全：只绑 127.0.0.1、一次性 token、Origin 校验、来源目录白名单、无删除接口。

**实现时与本文档不同的三处**

1. `apply` 的 entry 增加 `source` 字段，journal 的 op 增加 `dir` —— 否则一次应用跨两个来源时只能各写一份 journal，撤销会变成两次。
2. `/api/plan` 用**扫描出来的条目**做主体（带 `images`/`ext`），客户端只回传建议字段；避免客户端伪造路径。
3. 连不上库时降级为「未校验」（`warn`）而不是禁止应用 —— 库挂了不该让改名也停摆。

**已知未做（按分期属于 P1/P2）**

- 拆多角色合集包、裁封面（P1）。
- 接 Claude 翻译（P2）：词表未命中的词目前留空并标黄，需要人工填。
- 不处理日期目录顶层的文件（P0 只扫两个来源子目录）。
| 磁盘被拆包撑爆 | 系统盘满 | 预检剩余空间 ≥ 源包 × 2；原包归档后可手动清理 |
