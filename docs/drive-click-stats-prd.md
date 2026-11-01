# 网盘点击统计 PRD

**版本**：1.0
**日期**：2026-11-01
**作者**：Claude（产品需求访谈）
**状态**：已实现并部署（2026-11-01）

---

## 一、背景与问题

**现状**

- 站内 mod 只统计「浏览 / 下载」两个总数（`deploy/hk-engagement/service.py` 的 `mods` 段），**没有网盘维度**。
- 同一次下载动作里，点夸克和点迅雷在现有 `downloads` 里是同一个数：`reportDownload(modId)` 只按 `modId` 去重。
- 结果就是：站长无法回答「夸克和迅雷哪个用的人多」「这周夸克按钮被点了多少次」「迅雷是不是根本没人点、可以不再传」。

**问题**

需要一套**按网盘平台聚合**的点击统计，让站长能判断每个网盘的真实使用情况，进而决定每日上传要覆盖哪些盘。

**业务影响**

- 避免继续为「没人用的网盘」每天导出、上传、写链接。
- 发新 mod 后能看到哪个盘被点得最多，验证「两种网盘都传」这条硬规则的实际价值。

---

## 二、目标 / 非目标

### 目标

1. 统计每个网盘平台的**累计点击、今日、昨日、近 30 天每日点击**。
2. 展示在现有 `/visits` 统计页（复用 `VISITS_TOKEN` 密钥门槛），不新建入口。
3. 口径：**同设备 + 同一天 + 同一网盘只计 1 次**，不管这个人当天点了多少个 mod。
4. 只统计 mod 的网盘按钮；直链下载、教程页工具下载不混入。

### 非目标（本期明确不做）

- 每个 mod 的每个网盘细分排行（状态文件会显著变大，二期再评估）。
- 教程页 `ToolDownloadCard` 的网盘复制统计。
- 直链下载作为「直链」平台统计。
- 按来源、地区、设备、浏览器拆分。
- 实时大屏 / 自动刷新。
- 历史数据回填（功能上线前的点击无法补）。

---

## 三、用户故事

### 故事 1：知道哪个盘真的有人用

**作为**站长
**我希望**在 `/visits` 看到夸克、迅雷各自的累计点击和最近 30 天走势
**以便**判断每日上传要不要继续覆盖某个网盘

**验收标准**

- [ ] 每个平台显示：平台名、累计点击、今日、昨日、占全部点击的比例。
- [ ] 每个平台有近 30 天点击趋势（纯 SVG sparkline，不引入图表库）。
- [ ] 平台按累计点击降序排列。
- [ ] 无数据时显示「还没有网盘点击数据」，不显示 0 假数据。

### 故事 2：口径可信，不被连点污染

**作为**站长
**我希望**同一个人反复点同一个按钮不会把数字抬起来
**以便**数字能反映真实使用人数

**验收标准**

- [ ] 同设备、同一天、同一网盘连续点 5 次，只 +1。
- [ ] 同一人当天点 mod A 的夸克、mod B 的夸克，合计只算 1 次（按「设备 × 天 × 网盘」去重）。
- [ ] 同一人当天点夸克和迅雷，分别计入两个平台各 1 次。
- [ ] 爬虫 UA 不计；没有合法设备号不计。
- [ ] 打点失败静默，不影响页面。

### 故事 3：我自己调试不污染

**作为**站长
**我希望**自己的测试点击不要算进统计
**以便**数字干净

**验收标准**

- [ ] 带 `wavemod-nocount=1` cookie 的设备，前端直接跳过打点（与站点 PV 同一套标记）。
- [ ] 打开 `/visits` 成功后自动种该标记（现有行为，不新增逻辑）。

---

## 四、方案设计

### 4.1 总体链路

```
点击网盘按钮
  → reportDriveClick(platform)               // 浏览器，fire-and-forget
  → POST /api/drive-click                    // Next Route Handler（Vercel）
  → POST {HK}/drive-click                    // 香港计数服务（主存储）
       └─ 本地开发兜底：data/runtime/drive-clicks.json

打开 /visits
  → 服务端读 {HK}/drive-stats?days=30&today=…
  → buildDriveClickRange 补零 + 排序
  → 服务端渲染卡片 / sparkline / 表格
```

**为什么复用香港计数服务，而不是新建 Supabase 表**

Supabase 免费出口额度已三次被打穿（2026-10 起 Auth 402），而 `/visits` 的设计前提就是「额度挂了也能看」。网盘点击与访问统计是同一类运营数据，必须和站点统计同生共死。

**为什么不用现有 `/api/engagement` 的 `download` action**

`download` 的去重键是 `modId`，没有平台维度，且要同时改动 remote / supabase / cos / local 四套 store 才能加字段，影响面远大于新建一条独立打点链路。新链路只碰 HK 服务和 `/visits`。

**为什么平台名要在服务端归一化**

`drive_links.platform` 是自由文本，库里同时存在「夸克」「夸克网盘」「Quark」「Xunlei」。若按原样做 key，同一平台会被拆成多个桶，统计结果看起来「夸克只有 3 次」。归一化必须在写入时完成，读端只认规范名。

### 4.2 平台归一化

新增纯模块 `src/lib/drive-stats/platform.ts`，沿用全站已有的宽松中英文匹配口径（`drive-client.ts`、`card-download-action.tsx` 同款正则）：

| 规范名 | 匹配规则 |
|---|---|
| 夸克 | `/夸克\|quark/i` |
| 迅雷 | `/迅雷\|xunlei/i` |
| 百度网盘 | `/百度\|baidu/i` |
| 阿里云盘 | `/阿里\|aliyun\|ali/i` |
| 蓝奏云 | `/蓝奏\|lanzou/i` |
| 天翼云盘 | `/天翼\|ctyun\|189/i` |
| 115 | `/115\|一二/i` |
| 移动云盘 | `/和彩\|移动云\|139/i` |
| 123云盘 | `/123\|咪咕/i` |
| 其他 | 其余：`trim()` 去空白、去掉结尾「网盘」；空串归入「其他」 |

规则按上表顺序匹配，先命中先返回。新增平台只需在这一处加一行 + 单测。

上限：归一化后超过 24 个字符的截断，避免脏数据把 state 撑大。

### 4.3 计数口径（已确认）

- 去重键：`sha256(deviceId)` 前 16 位。**不含 modId** —— 同一个人当天在 mod A、mod B 各点一次夸克，合计只算 1 次。
- 同一平台、同一天内，该 hash 只计 1 次。
- `total` 为累计值，**只在去重键首次出现时 +1**，不随每日数据裁剪而减少。
- 今天 / 昨天保留 hash 列表（接住跨零点迟到请求），前天及更早冻结为整数。
- 保留 365 天，超出裁剪（与 visits 的 `VISIT_DAYS_MAX` 一致）。

### 4.4 展示设计（`/visits` 新增一段）

位置：现有「今日 / 昨日」卡片之后、「近 30 天趋势」之前。标题 **「网盘点击」**。

1. **平台汇总卡**（每个平台一张，横向换行）：
   - 平台名
   - 累计点击（大数字）
   - 今日 / 昨日
   - 占比（该平台累计 / 全平台累计）
   - 近 30 天 sparkline
2. **每日明细表**：日期为行、平台为列（按累计排序，最多 6 个平台，其余合并为「其他」），最近 30 天倒序，横向可滚动。
3. 空态：`还没有网盘点击数据（上线后开始累计）`。
4. 失败态：`网盘点击数据暂不可用`，**不显示 0**（0 会被误读为「没人点」）。

样式沿用 `/visits` 现有 neo-brutalist：`border-4 border-black` + 硬阴影 + `var(--neo-accent)` / `var(--neo-secondary)`。

---

## 五、数据与接口变更

### 5.1 HK 计数服务（`deploy/hk-engagement/service.py`）

**状态新增一段**（与 `mods` / `visits` 平级）：

```json
{
  "driveClicks": {
    "夸克": {
      "total": 1234,
      "days": {
        "2026-11-01": ["a1b2c3d4e5f60718", "..."],
        "2026-10-31": ["..."],
        "2026-10-30": 567
      }
    }
  }
}
```

- 列表形态 = 今天 / 昨天，元素是 `sha256(deviceId)` 截断值。
- 整数形态 = 已冻结的历史日。
- `load_state` 的 `_sanitize_*` 要宽进：坏平台名、坏日期、坏元素一律丢弃，不能因为新增一段让旧状态文件读不出来。

**新接口**

```
POST /drive-click
  body: { deviceId, platform, day, today }
  → 200 { ok: true, total, today }
  · deviceId 复用现有 DEVICE_RE
  · platform 归一化后 1–24 字符，否则 400
  · day / today 复用 DAY_RE
  · 幂等：同 hash 同日重复请求只返回当前值，不 +1

GET /drive-stats?days=30&today=YYYY-MM-DD
  → 200 {
      platforms: [
        {
          platform: "夸克",
          total: 1234,
          days: [{ date: "2026-11-01", count: 12 }, ...]   // 只含有数据的日期，升序
        }
      ]
    }
  · 按 total 降序
```

`GET /health` 增加 `drivePlatforms`（平台数）与 `driveClickDays`（有记录的天数），便于观察状态文件增长。

### 5.2 Next 侧新增文件

```
src/lib/drive-stats/
  types.ts          DriveClickDay / DrivePlatform / DrivePlatformSummary
  platform.ts       归一化（纯函数，带单测）
  platform.test.ts
  aggregate.ts      补零、排序、算占比（纯函数，带单测）
  aggregate.test.ts
  local-store.ts    本地文件兜底（data/runtime/drive-clicks.json）
  remote-store.ts   调 HK /drive-click、/drive-stats
  store.ts          按 ENGAGEMENT_STORE=remote 分派
  web-api.ts        浏览器协议层：校验 + 永远 204
src/app/api/drive-click/route.ts
```

- 读写开关复用现有 `isVisitsRemoteEnabled()` 的同一套判断（`ENGAGEMENT_STORE=remote` + URL + SECRET），不新增环境变量。
- `recordDriveClick` 失败只 `logger.warn`，不抛。

### 5.3 客户端新增

```
src/lib/drive-stats/client.ts
```

```ts
export function reportDriveClick(platform: string): void
```

- 读 `getDeviceId()`；没有设备号直接跳过。
- 读 `wavemod-nocount` cookie，有值直接跳过（与 `visit-beacon` 同规则）。
- 模块级 `Set<string>` 记录本会话已上报的平台名，重复点击不再发请求（服务端仍会去重，这里只是减少写盘）。
- `fetch("/api/drive-click", { method: "POST", keepalive: true })`，失败静默。

### 5.4 打点位置（严格限定）

| 文件 | 位置 | 触发条件 |
|---|---|---|
| `download-button.tsx` | `handleCopy` | 桌面端复制成功后（与 `reportDownload` 同一行） |
| `download-button.tsx` | `handleMobileOpen` | 手机端点击「复制并打开」时（与 `reportDownload` 同一行） |
| `download-button.tsx` | `handleMobileCopy` | 手机端复制成功后（与 `reportDownload` 同一行） |
| `card-download-action.tsx` | `copy()` | 卡片 hover 按钮复制成功后 |

**不统计**：直链下载按钮、教程页 `tool-download-card.tsx`、详情抽屉里的网盘名称徽章（不可点击）。

---

## 六、边界与异常

| 场景 | 处理 |
|---|---|
| 设备号缺失 / 非法 | 不计数，204 |
| 爬虫 UA | 不计数，204 |
| 平台名为空 / 全是空白 | 不计数，204（服务端也拒绝空 platform） |
| 未知平台名 | 归一化为去后缀的原名，正常计数（不丢数据） |
| 桌面复制失败 / 手机复制失败 | **不计数**（用户没拿到链接，不算一次使用） |
| 手机「复制并打开」 | 按点击计数：即使剪贴板失败，用户也已经进入分享页 |
| 重复点击 | 服务端按 hash 去重；前端同会话不再发请求 |
| 跨零点迟到请求 | 昨天仍保留列表，能正确去重 |
| HK 服务不可达 | 打点静默丢弃；`/visits` 显示「暂不可用」，不显示 0 |
| 状态文件损坏 | 沿用现有策略：拒绝以空状态启动，避免覆盖历史 |
| 平台名规则变更 | 旧 key 不会自动迁移；变更前需评估是否保留旧桶（本期无历史数据，无此问题） |

---

## 七、验收标准（可逐条勾选）

**数据链路**

- [ ] 桌面端点详情页夸克按钮（复制成功）→ HK 状态 `driveClicks.夸克.total` +1。
- [ ] 手机端点迅雷按钮（打开分享页）→ `driveClicks.迅雷.total` +1。
- [ ] 卡片 hover 快捷按钮点击 → 对应平台 +1。
- [ ] 同设备同天同平台点 5 次（哪怕跨 3 个 mod）→ 只 +1。
- [ ] 同设备同天点两个不同 mod 的夸克 → 合计只 +1。
- [ ] 点直链下载 → 网盘统计不变。
- [ ] 爬虫 UA / 无设备号 / `wavemod-nocount` → 不计。

**展示**

- [ ] `/visits` 出现「网盘点击」区块，平台按累计降序。
- [ ] 每个平台显示累计 / 今日 / 昨日 / 占比 / 30 天 sparkline。
- [ ] 日期缺口补 0，折线不「跳点」。
- [ ] 无数据时显示空态，不显示 0。
- [ ] HK 服务不可达时显示「暂不可用」，不显示 0。
- [ ] 手机宽度下卡片与表格不横向溢出页面（表格自身可横滚）。

**安全 / 隐私**

- [ ] `/visits` 仍然无凭证 404，密钥逻辑不变。
- [ ] 状态文件里没有明文设备号、IP、UA。
- [ ] `/api/drive-click` 响应 `Cache-Control: private, no-store`。

**运维**

- [ ] HK `/health` 能看到新增字段，`bytes` 增长在预期内（连续观察 7 天）。
- [ ] 本地 `npm run dev`（无 HK 配置）能写入并读取 `data/runtime/drive-clicks.json`。
- [ ] `npm run lint`、`npx tsc --noEmit`、`npm run build` 全绿。

---

## 八、测试计划

### 单元测试

- `src/lib/drive-stats/platform.test.ts`：每个规范名的中英文别名、大小写、前后空格、「网盘」后缀、未知平台、空串。
- `src/lib/drive-stats/aggregate.test.ts`：30 天补零、today/yesterday 取值、平台排序、占比计算（总数为 0 时返回 0 不是 NaN）。
- `deploy/hk-engagement/test_service.py`：平台归一化、同设备同天去重、跨天重置、冻结、别名合并、区间读取。
  - 运行：`python -m unittest discover -s deploy/hk-engagement -p "test_*.py"`

### 组件测试

- `download-button.test.tsx`（新增）：mock `reportDriveClick`，验证桌面复制成功、手机打开、手机复制分别调用一次，且传了正确的 `platform`。
- `card-download-action.test.tsx`：复制成功才调用；复制失败不调用。

### 手工验证（HK 服务）

1. 部署新 `service.py`，`systemctl restart wavemod-engagement`。
2. `curl -X POST {HK}/drive-click` 连续发两次同一 `deviceId + platform + day`，断言 `total` 第二次不变。
3. `curl {HK}/drive-stats?days=30&today=…`，断言返回结构与排序。
4. 浏览器真实点击一次，`/visits` 上对应平台今日 +1。
5. `curl -I` 检查 `/visits` 的 `X-Cache-Status` 仍为 `BYPASS`。

---

## 九、分期

### 一期（MVP，本次）

- 平台归一化 + HK 存储 + 打点 + `/visits` 汇总卡 / sparkline / 明细表。
- 只覆盖 mod 的网盘按钮。

### 二期（按需）

- 每个 mod 的网盘点击排行（本期协议不含 `modId`、hash 也不含；二期需要新增字段，且只能从上线后开始累计）。
- 教程页工具下载统计。
- 按周 / 月汇总。

---

## 十、风险与回滚

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| HK 状态文件变大、写盘变慢 | 中 | 中 | 今天/昨天保留列表，更早冻结；观察 `/health` 的 `bytes`；必要时把去重窗口缩到 1 天 |
| 平台名规则漂移导致桶分裂 | 中 | 中 | 归一化只在一处；每次新增规则补单测；读端不自行推断 |
| 打点请求过多拖慢 HK 服务 | 低 | 低 | 前端同会话去重 + 服务端幂等；5s 超时，失败静默 |
| 旧客户端缓存旧 bundle，点击不上报 | 低 | 低 | 上线初期数字偏低，属正常；不做补救 |
| 回滚：改回旧 `service.py` 会丢 `driveClicks` | 中 | 高 | **回滚前先备份** `/var/lib/wavemod-engagement/state.json`；优先只回滚前端/展示，保留新服务（旧数据字段对旧服务无害，但旧服务保存时会丢弃该段） |
| 泄露统计链接 | 低 | 中 | 沿用现有 `VISITS_TOKEN`，换 token 即可失效 |

**不可逆操作说明**

- 本次只**新增** state 段，不修改 `mods` / `visits` 结构，不迁移、不删数据。
- 部署 HK 服务前必须备份 `state.json`（`cp state.json state.json.pre-drive-clicks`）。
- 不触碰 `.env.production` / `.env.local`（不新增环境变量）。

---

## 十一、受影响文件清单

**新增**

- `docs/drive-click-stats-prd.md`
- `src/lib/drive-stats/types.ts`
- `src/lib/drive-stats/platform.ts`
- `src/lib/drive-stats/platform.test.ts`
- `src/lib/drive-stats/aggregate.ts`
- `src/lib/drive-stats/aggregate.test.ts`
- `src/lib/drive-stats/local-store.ts`
- `src/lib/drive-stats/remote-store.ts`
- `src/lib/drive-stats/store.ts`
- `src/lib/drive-stats/web-api.ts`
- `src/lib/drive-stats/client.ts`
- `src/app/api/drive-click/route.ts`
- `deploy/hk-engagement/test_service.py`（服务端纯逻辑单测）

**修改**

- `deploy/hk-engagement/service.py`（新增 `driveClicks` 段 + 两个接口 + `/health` 字段）
- `src/components/features/mods/detail/download-button.tsx`（3 处打点）
- `src/components/features/mods/detail/card-download-action.tsx`（1 处打点）
- `src/app/visits/page.tsx`（新增「网盘点击」区块）
