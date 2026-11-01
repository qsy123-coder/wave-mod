# 批量上传 Mod PRD（CSV + txt + 本地预览图）

> 状态：待确认（未进入实现）
> 日期：2026-11-01
> 需求来源：用户 2026-11-01「参考每日的上传 mod 流程，加个功能让我能够只上传 csv 和 txt 网盘链接以及本地预览图目录，就能够批量上传 mod」
> 关联文档：`CLAUDE.md`（每日上传硬规则）、`docs/daily-mods-update-prd.md`、`scripts/upload-daily-by-date.mjs`

---

## 1. 背景与问题

现在的每日上传流程要求一个完整的日期目录：

```
W-YYYY.M.D/
  ├─ 分享结果导出-*.csv     （夸克）
  ├─ 分享结果导出-*.xlsx    （迅雷）
  ├─ *.exe                  （mod 本体，参与文件名 join）
  └─ *.png/.jpg/.webp       （预览图）
```

脚本用 **exe 文件名**把 CSV / xlsx / 预览图 join 起来，再解析角色、标题、版本。
用户现在想要一个更轻的入口：**不下载/不整理 exe，只给 CSV、txt 网盘链接和预览图目录**，
在后台网页里预览确认后批量入库。

### 1.1 与现有流程的关系

- **不是替代每日流程**：每日脚本、去重键 `character|title`、角色归一化规则全部保留。
- **复用**：角色/标题解析、CSV 解析、迅雷 txt 解析、COS 图片上传、缓存失效。
- **新增**：浏览器端的批量预览与逐行编辑；一次性 upsert 20–100 条。

---

## 2. 目标 / 非目标

### 2.1 目标

- **G1**：在后台 `/admin/batch-upload` 选 1 个夸克 CSV、可选 1 个迅雷 txt、选一个本地预览图文件夹。
- **G2**：页面解析出每一行（标题 / 角色 / 版本 / 夸克链接 / 迅雷链接 / 图片数），**先预览再提交**。
- **G3**：未知角色必须标红并修正后才能提交，**绝不新建 character**。
- **G4**：图片在浏览器里转 WebP 后直传 COS；入库后前台立即可见（缓存失效）。
- **G5**：已存在的 `character|title`：更新网盘链接与图片，并把 `created_at` 推到所选日期（重新上架）。
- **G6**：单批 20–100 条，逐行进度、失败可重试、结果可核对。

### 2.2 非目标

- 不替代每日脚本；不处理 exe / 压缩包上传。
- 不支持迅雷 xlsx（本次只收 txt；xlsx 仍走每日脚本）。
- 不新建角色分类；不自动猜未知角色。
- 不做多游戏选择：默认 `wuthering-waves`（与每日流程一致）。
- 不做评论/评分/登录。
- 不做批量删除；不做历史回滚 UI（依赖每日 DB 备份）。
- 不要求同步刷新 COS 兜底快照（由每日备份任务负责；本功能只失效 Next 缓存）。

---

## 3. 用户故事

### 3.1 站长

- 我把夸克导出的 CSV、手抄的迅雷 txt、以及一个装预览图的文件夹拖进页面。
- 页面列出每条 mod：标题、角色、版本、两个网盘链接、图片数量。
- 角色不在站内分类里的行标红，我可以逐行改角色或批量改。
- 简介/版本不合适，我可以直接在表格里改。
- 我选一个日期（默认今天），点「上传并入库」。
- 进度条逐行显示图片上传和入库结果；失败的行告诉我原因，我可以只重试失败行。
- 入库后我打开前台，当天「每日更新」能看到这批，卡片有夸克/迅雷按钮和正确的封面。

### 3.2 访客（间接受益）

- 新 mod 出现在列表/每日更新，图片和网盘链接正常。

---

## 4. 现有实现盘点（复用 vs 新建）

| 能力 | 现状 | 本次 |
|---|---|---|
| 夸克 CSV 解析 | `upload-daily-by-date.mjs` 里的 `parseQuarkCsv(filePath)` | 抽出纯函数 `parseQuarkCsvText(text)`，脚本与页面共用 |
| 迅雷 txt 解析 | `scripts/xunlei-txt-parse.mjs` 的 `parseXunleiTxt` / `withXunleiPwd` | 直接复用 |
| 角色/标题/版本解析 | `upload-daily-by-date.mjs` 里的 `resolveCharacterAndTitle` + 大量前缀表 | **抽成纯模块 `daily-classify.mjs`**，脚本与页面共用 |
| 去重键 | `dedupKey(character,title)` | 复用 |
| 图片索引 | 脚本里的 `buildImageIndex` / `lookupImages` | 抽成纯函数（按文件名 base 匹配） |
| 图片转 WebP + COS | `storage-image-upload.tsx` + `/api/cos/sign` | 复用转换/上传逻辑；批量页做并发与进度 |
| 入库 | 每日脚本用 psql 批量 insert | 新 Server Action 用 `pg` 事务 upsert |
| 缓存失效 | `revalidatePublicModCaches()` | 复用 |
| 后台权限 | nginx + 应用层 Basic Auth | 新路由加入 proxy matcher |

### 4.1 必须避免的坑（来自 CLAUDE.md）

- 去重键是 `character|title`；事后改 character 会让每日脚本重跑时重复入库。
- 绝不能新建 character；未知角色必须修正。
- `created_at` 是「归到哪天上架」的语义，不是真实创建时间。
- 任何写库都要接上缓存失效，否则要等 6 小时。

---

## 5. 方案设计

### 5.1 总体数据流

```
浏览器                          Vercel（Server Action）              PostgreSQL / COS
──────                          ──────────────────────              ────────────────
选 CSV + txt + 图片目录
  │
  ├─ 解析 CSV（夸克，主）
  ├─ 解析 txt（迅雷，辅，按标题合并）
  ├─ 解析角色/标题/版本（共享纯模块）
  ├─ 按文件名匹配图片
  ├─ 预览表：标红未知角色、逐行编辑
  │
  ├─ 图片逐张转 WebP → /api/cos/sign → 直传 COS ──────────────────────▶ COS
  │
  └─ 提交 rows（≤100）──────▶ Zod 校验
                               ├─ 角色必须在库内 distinct 中
                               ├─ 事务 upsert mods
                               ├─ revalidatePublicModCaches
                               └─ 返回 inserted/updated/failed ────────▶ PostgreSQL
```

### 5.2 输入解析

#### CSV（必填，夸克主盘）

- 沿用夸克「分享结果导出」格式：第 2 列分享名、分享内容里的 `pan.quark.cn` 链接、提取码列。
- 分享名去掉末尾 `.exe` 与迅雷重名后缀 `(1)` / `（2）`。
- CSV 用 `File.text()` 读取；若检测到乱码（大量 `�`），用 `TextDecoder("gbk")` 重读一次。
- 解析失败/0 条：页面直接报错，不允许提交。

#### txt（可选，迅雷补充）

- 优先按现有手抄格式解析（`parseXunleiTxt`）：
  ```
  分享文件：锁暝-虚假希望（【】）.exe
  链接：https://pan.xunlei.com/s/VP57...
  提取码：3rhw
  ```
- 若 0 条，再尝试「一行一条：标题 + 链接」的宽松格式；仍 0 条则提示格式不符（不阻断 CSV 主流程）。
- `withXunleiPwd` 自动把提取码拼进链接。

#### 合并规则

- 以 CSV 的分享名为主键（去掉 `.exe`/`(N)` 后归一）。
- txt 按同名匹配，补 `迅雷网盘` 链接；匹配不到的行进「仅迅雷」区，**默认不勾选**，用户可手动加入。
- 同一 CSV 内重复标题：合并网盘链接、图片取并集，并在预览里提示「重复 N 条」。
- 最终每行至少要有 1 个网盘链接；没有链接的行标红不可提交。

### 5.3 角色 / 标题 / 版本解析（共享模块）

把 `upload-daily-by-date.mjs` 中**纯逻辑**抽到 `scripts/daily-classify.mjs`：

- `resolveCharacterAndTitle(key)`
- `dedupKey(character, title)`
- `stripRenameSuffix(key)`
- `KEY_ALIASES`
- 所有前缀表：`CHARACTER_PREFIX_MAP`、`UI_FULL_KEY_RE`、`UI_PREFIXES`、`EFFECT_BUCKET_PREFIXES`、`AEMEATH_MECH_PREFIXES`、`MONSTER_PREFIXES`、`WEAPON_PREFIXES` 等
- 版本提取（`v1.2` / `1.2` → `v1.2`，否则「未标注」）

依赖的 `resolveReshareAlias` / `resolveDakaIfApplicable` 已是纯模块，直接引用。

**关键要求**：每日脚本改为 import 这个模块，行为必须逐字不变。用一份「现有所有日期目录」的 golden 输出对比（character/title/version/dedupKey）作为回归测试。

页面端：
- 从 Server Component 传入库内 `select distinct character` 的**原始值**列表。
- 预览表用同一模块算出 character/title/version。
- character 不在列表 → **标红 + 禁止提交该行**；提供「逐行改角色」和「批量设为某角色」。
- 用户可以改标题；改标题后不自动重算角色（避免静默变化），但会重新计算 `dedupKey` 并提示是否与库内冲突。

### 5.4 预览图

- 目录选择用 `<input type="file" webkitdirectory multiple>`；只读图片后缀。
- 索引规则（沿用每日流程）：
  - `标题.webp` = 主图（images[0]）
  - `标题-1.webp` / `标题-2.webp` / `标题_1.webp` = 副图，按数字升序
  - 平铺在一个目录里；不要求子目录
- 匹配 key 用「归一化后的标题」（去掉 `.exe`/`(N)`，走 `KEY_ALIASES`）。
- 没有匹配到图片的行：黄色警告，默认允许用站内占位图提交（与每日流程一致），用户可取消勾选。
- 上传：
  - 客户端 Canvas 转 WebP（质量 0.85，最长边 1000px，与现有上传组件一致）。
  - 通过 `/api/cos/sign` 获取 STS，浏览器直传 COS；对象键 `mods/<角色>/<draftId>/<preview|preview-2...>.webp`。
  - 并发 3；单张失败可重试；行内显示 `3/3`。
  - **不上传原图**，只传转好的 WebP。

### 5.5 预览表（核心 UI）

列：

| 列 | 说明 |
|---|---|
| 勾选 | 是否提交；未知角色/无网盘链接默认不可勾 |
| 状态 | 新增 / 更新 / 已存在 / 错误 |
| 标题 | 可编辑 |
| 角色 | 下拉（库内既有 character）+ 可输入；未知标红 |
| 版本 | 可编辑，默认从标题提取 |
| 适配版本 | 可编辑，默认「未标注」 |
| 夸克链接 | 只读（来自 CSV） |
| 迅雷链接 | 只读（来自 txt） |
| 图片 | 缩略图 + 数量；缺失黄色警告 |
| 简介 | 可编辑，默认 `${character} ${title} MOD，夸克网盘 / 迅雷网盘下载。` |
| NSFW | 复选框，默认否 |

顶部：
- 日期选择（默认今天，`created_at` 写当天中午 Asia/Shanghai）
- 统计：总行数 / 新增 / 更新 / 未知角色 / 缺图 / 缺链接
- 按钮：`全选可提交行`、`批量设置角色`、`开始上传并入库`

底部结果：
- 每行：成功/失败原因；失败行可单独重试。
- 汇总：新增 N、更新 N、重新上架 N、失败 N。

### 5.6 服务端入库

新增 Server Action：`src/actions/admin/batch-upload-actions.ts`

输入（Zod）：

```ts
{
  date: "YYYY-MM-DD",
  rows: [{
    title, character, version, gameVersion, description, nsfw,
    driveLinks: [{ platform, url }],
    images: string[],
    // 仅用于「是否用户改过」的判断
    editedFields?: string[]
  }]
}
```

处理：

1. **长度/数量限制**：rows ≤ 100；title/character 非空；driveLinks ≥ 1；images 允许为空（用占位图）。
2. **角色白名单**：`select distinct character from public.mods`，不在列表 → 整批拒绝并返回行号。
3. **批内去重**：同 `character|title` 合并（后出现的链接/图片覆盖，报告重复）。
4. **事务**：
   - `select id, character, title, created_at from mods where ...` 找已存在行（逐行或一次性拉 dedupKey 集合）。
   - 新行：`insert`，`created_at = selectedDate 12:00 Asia/Shanghai`，`is_published = true`，`is_available = true`，`game_key = 'wuthering-waves'`，`xxmi_install_guide` 默认常量。
   - 已存在行：
     - **总是更新**：`drive_links`、`images`（images 非空时）、`updated_at`
     - `created_at` 只往前推（所选日期晚于原日期才改）
     - `description` / `version` / `game_version` / `nsfw` **只在 `editedFields` 包含该字段时更新**，避免覆盖库内自定义文案
   - 任何一行 SQL 失败 → 整个事务回滚，返回失败行。
5. **缓存失效**：`revalidatePublicModCaches()`（整体列表）+ 对受影响 id 逐个失效 + `revalidatePath("/mods")`、`/updates`、`/`。
6. **返回**：`{ inserted, updated, reshelved, failed: [{ title, error }] }`。

### 5.7 入口与权限

- 新页面：`/admin/batch-upload`（Server Component 拉角色列表 + Client 预览组件）。
- 入口：
  - `/admin/upload` 页面加一个「批量上传（CSV+txt+图片）」按钮；
  - `/admin/mods` 顶部工具栏加同样入口。
- `src/proxy.ts` matcher 增加 `/admin/:path*` 已覆盖页面；Server Action POST 到该路径，自动受 Basic Auth 保护。
- `/api/cos/sign` 已在 matcher 中，无需改动。

### 5.8 为什么不用其他方案

| 方案 | 不采用的原因 |
|---|---|
| 复用每日脚本、只加一个 bat | 用户明确要「后台网页」；换电脑/没装 Node 也要能用 |
| 图片经过 Next API 上传 | Vercel 请求体 4.5MB 限制，20–100 条图片必然超限；必须浏览器直传 COS |
| 在页面里重新写一套角色解析 | 会和每日脚本的前缀表漂移，导致同一标题两套分类；必须抽共享模块 |
| 直接新建未知 character | 违反 CLAUDE.md 硬规则，前台会凭空多分类 |
| 全部行用事务强一致但图片先传 | 图片失败时行不能入库；设计为「图片失败的行不提交，其余行继续」，DB 写入仍是单事务 |

---

## 6. 数据与接口变更

### 6.1 数据库

**无 schema 变更**。只写 `mods` 的既有列：
`title, character, version, game_version, description, images, drive_links, nsfw, xxmi_install_guide, created_at, updated_at, is_published, is_available, game_key`。

### 6.2 新增/修改文件

**新增**

- `scripts/daily-classify.mjs`（纯模块：分类/标题/版本/去重键/别名表）
- `scripts/quark-csv-parse.mjs`（纯模块：CSV 文本 → records）
- `scripts/daily-classify.test.mjs`（golden cases）
- `scripts/quark-csv-parse.test.mjs`
- `src/lib/admin/batch-upload-schema.ts`（Zod）
- `src/actions/admin/batch-upload-actions.ts`（Server Action）
- `src/app/admin/batch-upload/page.tsx`（Server Component）
- `src/components/features/admin/batch-upload/batch-upload-client.tsx`（预览/上传 UI）
- `src/components/features/admin/batch-upload/batch-preview-table.tsx`
- `src/components/features/admin/batch-upload/use-batch-images.ts`（图片索引/转换/上传）
- 类型声明：`src/types/daily-classify.d.ts`（如果 TS 需要）

**修改**

- `scripts/upload-daily-by-date.mjs`：改为 import 共享模块，删除重复实现（行为不变）
- `src/app/admin/upload/page.tsx`、`src/app/admin/mods/page.tsx`：加入口按钮
- `src/proxy.ts`：确认 matcher 已覆盖（无需改，除非新增 API route）
- `src/lib/mod-cache.ts`：如需要，补一个批量失效辅助

**不改**

- `src/lib/mods-domain/sorting.ts` 的 `normalizeCharacterName`（共享模块用它做别名归一）
- 每日脚本的去重/上架语义
- 角色分类表（不新增 character）

### 6.3 接口

- 浏览器 → `/api/cos/sign`：复用现有签名接口（每张图一次；并发 3）。
- 浏览器 → Server Action：POST 到 `/admin/batch-upload`（Next Server Action，Basic Auth 保护）。
- 不新增公开 API。

---

## 7. 边界与异常

| 场景 | 行为 |
|---|---|
| CSV 解析 0 条 | 页面报错，禁止提交 |
| txt 解析 0 条 | 提示「迅雷 txt 未识别」，CSV 主流程继续 |
| 角色未知 | 行标红、禁止勾选；提供批量改角色 |
| 标题为空 | 行标红、禁止提交 |
| 没有网盘链接 | 行标红、禁止提交 |
| 没有匹配图片 | 黄色警告；默认用占位图，可取消勾选 |
| 同一标题重复 | 合并链接/图片，显示「重复 N 条」 |
| 图片上传失败 | 该行不提交，其余行可继续；提供重试 |
| DB 写入失败 | 整个事务回滚，返回失败行；已上传的 COS 图片保留（可重试覆盖） |
| 已存在行 | 更新链接/图片 + 重新上架；简介等只在用户编辑时更新 |
| 日期选未来/过去 | 允许；`created_at` 写所选日期中午（上海） |
| 超过 100 行 | 页面提示分批；服务端拒绝 |
| 直接访问 `/admin/batch-upload` | Basic Auth 401 → 浏览器弹窗 |
| 并发两个管理员同时提交 | 事务内逐行 upsert；后提交者覆盖链接/图片；不做分布式锁（单管理员场景） |

---

## 8. 验收标准

### 解析与预览

- [ ] 夸克 CSV 能解析出标题/链接/提取码；`��` 乱码时自动按 GBK 重读
- [ ] 迅雷 txt 能解析出标题/链接/提取码，并自动拼 `?pwd=`
- [ ] CSV 与 txt 同名合并；txt-only 行默认不勾选
- [ ] 角色/标题/版本与每日脚本对同一标题的输出逐字一致（golden 对比）
- [ ] 未知角色标红且不能提交；批量改角色后恢复可提交
- [ ] 预览图按文件名匹配，主图 + `-1/-2` 排序正确
- [ ] 简介/版本/适配版本/NSFW 可在表格内编辑

### 上传与入库

- [ ] 图片在浏览器转 WebP 并直传 COS，行内显示进度
- [ ] 新 mod 入库后出现在 `/updates` 所选日期分组，封面/网盘按钮正确
- [ ] 已存在 mod：链接/图片更新，`created_at` 往前推到所选日期
- [ ] 已存在 mod 的自定义简介不会被自动文案覆盖（除非用户改过）
- [ ] 同一批 20–100 条一次提交成功；失败行可重试
- [ ] 写库后 `/api/mods`、`/updates`、首页立即反映（缓存失效）
- [ ] 未知角色/无链接/空标题在服务端再次被拒绝（不只靠前端）

### 质量

- [ ] `npm run lint`、`npx tsc --noEmit`、`npm run build`、`npm test` 全绿
- [ ] 共享分类模块有 golden 测试；CSV/txt 解析有单测
- [ ] 每日脚本重跑 `--dry-run` 的「待上传」仍为 0（共享模块重构未改变去重键）

---

## 9. 测试计划

### 单元测试

- `daily-classify.test.mjs`
  - 现有日期目录的 golden 清单：标题 → `{ character, title, version, dedupKey }`
  - 边界：UI / 武器 / 怪物 / 爱弥斯的机甲 / 大卡 / 重分享别名 / 未知角色
- `quark-csv-parse.test.mjs`
  - 带 BOM、带引号多行、`.exe`、`(1)`、缺链接、缺提取码
- 合并/去重纯函数测试
- 日期中午 Shanghai 的计算

### 组件测试

- 预览表：未知角色标红、批量改角色、勾选联动、缺图警告
- 图片索引：主图/副图匹配、`KEY_ALIASES`、无图占位

### 集成测试（本地 `wavemod_dev`）

- Server Action：新增 3 条 / 更新 1 条 / 重复 1 条 / 未知角色拒绝 / 事务回滚
- 校验写入后的 `drive_links`、`images`、`created_at`、`description`

### 手工验收（预发或本地）

- 用 2–3 条真实 CSV/txt + 3 张图，完整走一遍预览 → 上传 → 前台确认
- 同日再传一次，确认「更新并重新上架」而非重复插入

---

## 10. 分期

| 阶段 | 内容 | 产出 |
|---|---|---|
| P1 | 抽共享纯模块 + golden 测试；每日脚本改为 import | 行为不变的回归保障 |
| P2 | 后台页面 + 文件选择 + 预览表（不写库、不上传） | 可解析、可编辑、未知角色拦截 |
| P3 | 图片转 WebP + COS 直传 + 进度/重试 | 图片可用 |
| P4 | Server Action 事务 upsert + 缓存失效 + 结果汇总 | 功能闭环 |
| P5 | 入口按钮、空态/错误文案、手工验收 | 可交付 |

预估：**2–3 个工作日**。

---

## 11. 待确认的假设

1. **迅雷 txt 格式**：默认是现有手抄格式（分享文件/链接/提取码三行）；如果实际是别的格式，请给一段样例。
2. **Quark CSV 编码**：默认 UTF-8；若实际是 GBK，页面会自动回退。
3. **缺图行为**：默认允许用站内占位图提交（与每日流程一致），只在预览里黄色警告；如果要「缺图直接禁止提交」，告诉我。
4. **txt-only 行**：默认不勾选，用户可手动加入；如果希望自动全部加入，告诉我。
5. **是否需要在成功后自动刷新 COS 兜底快照**：默认不做（由每日备份任务负责），成功后只失效 Next 缓存。

---

## 12. 实现状态（2026-11-01）

已实现并本地验收：

- [x] 抽出 `scripts/daily-classify.mjs` / `scripts/quark-csv-parse.mjs` /
      `scripts/daka-classify-pure.mjs`；每日脚本改为 import，`--dry-run` 输出与重构前逐行一致
- [x] `/admin/batch-upload` 页面：CSV/txt/预览图目录、日期、逐行编辑、批量角色、全选
- [x] 未知角色标红 + 禁止勾选 + 提交按钮禁用；修正后自动重新勾选
- [x] 浏览器转 WebP（最长边 1000px）→ `/api/cos/sign` → COS 直传；并发 3、主图/副图顺序稳定
- [x] Server Action 事务 upsert：新增/更新/重新上架、批内去重、角色白名单、缓存失效
- [x] 已存在行：更新网盘/图片 + `created_at` 往前推；自定义简介不被自动文案覆盖
- [x] 本地 E2E（Playwright + `wavemod_dev`）：
  - 2 条 CSV + 1 条迅雷 txt + 3 张图 → 新增 2；A 有夸克+迅雷，B 只有夸克；图片 2/1 张
  - 同批再传（日期改 11-02）→ 更新 2、重新上架 2；自定义简介保持不变
  - 未知角色行：标红、checkbox disabled、提交 0 条
- [x] `npm run lint` 0 error、`npx tsc --noEmit`、`npm run build`、`npm test`（611 通过）

### 实现时的两个补充决定

1. **标题在预览里只读**：标题来自 CSV 文件名，允许改标题会改变去重键
   （CLAUDE.md 的「事后改 title/character」坑）。角色仍可改，用于修正未知角色；
   简介/版本/适配版本/NSFW 可改。
2. **COS 桶 CORS 补了 `https://go.sunnyrose.xyz` 和 `http://localhost:3102`**：
   原规则只有 `localhost:3000 / www.wave-mod.top / wave-mod.top`。不补的话，
   从当前规范域名直传 COS 会被浏览器 CORS 拦（现有后台图片上传同样受影响）。

部署/生产验收：

- [x] 合并到 `main` → Vercel 部署（`760739e4`，READY）
- [x] 生产 E2E：批量行打码、单条模式解析/打码/入库 2 张图、DB 校验通过
      （测试行已删除；单条测试标题 `弗洛洛-单条测试 v2.0`）

---

## 13. 追加：预览图打码 + 单条模式（2026-11-01）

### 13.1 打码

- 每张预览图缩略图下方有「打码」按钮；打开弹窗后在图上**手动拖矩形选区**。
- 支持**马赛克**（块大小 4–40）和**高斯模糊**（半径 4–40），默认马赛克。
- 打码图在浏览器内生成 WebP，**替换原图上传**；原图不传 COS。
- 保留 `originalImageFiles`：可反复重打；行内「还原全部」恢复原图。
- 上传前仍可看到打码后的缩略图；入库的 `images[]` 是打码图。

### 13.2 单条模式

- `/admin/batch-upload` 顶部新增「批量模式 / 单条模式」切换。
- 单条模式不读 CSV：
  - 粘贴分享文件名 → 点「解析」自动填角色/标题/版本；
  - 手填夸克链接（必填）、迅雷链接（可选）、简介、NSFW、日期；
  - 选 1–N 张图，同样支持打码；
  - 复用同一个 Server Action 与图片直传逻辑；未知角色仍禁止提交。
- 已存在的 `character|title` 仍按「更新并重新上架」处理。

### 13.3 验收

- [x] 本地 E2E：批量行打码 → 弹窗拖框 → 应用后缩略图标记；单条解析角色/版本、打码、入库 2 张图，DB 校验通过
- [x] **生产 E2E**：`https://go.sunnyrose.xyz/admin/batch-upload` 同样流程通过（CORS 生效）
- [x] `npx tsc --noEmit`、`npm run lint`、`npm run build`、`npm test`（657 通过）
- [x] COS CORS 追加 `http://localhost:3100`、`http://localhost:3102`（本地测试端口）
