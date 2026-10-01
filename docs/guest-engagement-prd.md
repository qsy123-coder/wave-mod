# Product Requirements Document: 游客互动（点赞 / 浏览 / 收藏）去登录化

**Version**: 1.0
**Date**: 2026-10-02
**Author**: Sarah (Product Owner)
**Quality Score**: 90/100

---

## Executive Summary

WaveMod 的「点赞 / 浏览 / 收藏」三个计数目前**全部依赖「登录 + Supabase」**：点赞与收藏在 Server Action 里先 `getCurrentUser()`，未登录直接抛错；浏览虽然不要求登录，但仍要走 Supabase 的 admin client 读改写 `mods.views`。而前台卡片读的是 **COS 兜底快照**，所以一旦 Supabase 出口配额被打穿、写入侧静默失败，快照里那三个数字就永久冻住——用户看到的是「好几天都没数据」，实际是**记不进去**，不是没人点。

本方案把这三个计数整体从「登录 + Supabase」上摘下来，改走「**匿名设备号 + 自托管轻量计数器**」：任何访客无需注册登录即可点赞、收藏、产生浏览数；数据落在自托管服务器（腾讯云首尔，PM2）上的一个轻量计数器里，不经过 Supabase 网关，因此不受其配额与 402 影响。Supabase 里已有的旧计数作为**基线**一次性导入，之后新交互在其上累加，历史数据不丢。

这是当前站点的**止血需求**：互动数据已连续多日为零，而互动数是「热门排序 / 精选位 / 创作者榜」等下游功能的输入，继续冻结会让整站的「热度」维度失真。

---

## Problem Statement

**Current Situation**

| 功能 | 现有实现 | 断点 |
|---|---|---|
| 点赞 | `toggleLikeAction` → `getCurrentUser()` 必须有登录 → 写 `likes` 表 → 回写 `mods.likes_count` | 要登录 **且** 走 Supabase |
| 收藏 | `toggleFavoriteAction` 同一套（`favorites` 表 + `favorites_count`） | 同上 |
| 浏览 | `POST /api/mods/[id]/view` → Supabase admin 读 `views` 再 +1 | 不用登录，但仍走 Supabase |

Supabase 出口配额超限后网关一律回 402，写入侧失败是**静默**的（前台只有冰冷的 0，没有任何报错），因此问题被发现时已过去数天。

**Proposed Solution**

引入一层与 Supabase 解耦的互动计数器：

1. 首次访问生成**匿名设备号**（localStorage 里的 UUID），随互动请求上报，用于去重，不做任何身份识别。
2. 服务端在自托管机器上维护一个**轻量计数器**（小文件落盘 + 进程内写队列），提供批量读 + 单条写的极简 API。
3. 前台进入页面时**批量拉一次**最新计数并覆盖快照里的旧值；用户操作后**本地即时更新**，不等服务端回包。
4. 上线时把 Supabase 里现存的 `likes_count` / `favorites_count` / `views` 一次性读出来当作**基线**写进计数器。

**Business Impact**

- 互动数据恢复增长，站点的「热度」维度重新可用（热门排序、精选位、创作者榜）。
- 访客零门槛参与，预计点赞/收藏的转化率显著高于「必须注册」的现状。
- 彻底移除互动链路对 Supabase 出口配额的依赖，杜绝同类故障复发。

---

## Success Metrics

**Primary KPIs**

- **计数恢复增长**：上线后 7 天内，每日 `点赞 + 收藏 + 浏览` 增量 > 0 且连续 7 天不为零（对比现状：连续多日为 0）。
- **游客互动成功率**：未登录用户点击点赞/收藏的**成功响应率 ≥ 99%**（埋点：请求 2xx / 总请求）。
- **计数准确率**：抽检 20 个 mod，前台显示值与计数器落盘值一致率 = 100%（允许快照滞后，不允许错值）。
- **性能**：批量计数接口 P95 < 300ms；单次互动写 P95 < 500ms。

**Validation**

上线后第 3 天、第 7 天各查一次；`/api/updates` 与计数器文件双端比对。若「游客互动成功率」低于 99%，优先排查接口而非 UI。

---

## User Personas

### Primary: 游客小林（未登录访客，占绝大多数流量）

- **Role**：从搜索引擎/群聊点进来找 mod 的普通玩家
- **Goals**：快速找到想要的 mod，顺手点个赞、收藏一下备用
- **Pain Points**：现在点一下被要求「请先登录后再点赞」；注册成本远高于「点个赞」的收益，于是直接关掉
- **Technical Level**：普通用户；不关心技术，只关心「点了有没有反应」

### Secondary: 老用户阿哲（曾登录过）

- **Role**：早期注册过的用户
- **Goals**：点赞收藏照旧，能看到自己的收藏夹
- **Pain Points**：最近点赞点了没用，以为站点坏了
- **Technical Level**：普通用户

### Tertiary: 站点运营者（你）

- **Role**：WaveMod 站长
- **Goals**：数字能反映真实热度，用于热门排序/精选；故障时能一眼看出「是没人点还是没记上」
- **Pain Points**：故障静默，靠肉眼发现「好几天没数据」太晚

---

## User Stories & Acceptance Criteria

### Story 1: 游客直接点赞

**As a** 未登录访客
**I want to** 直接点卡片/详情页上的点赞
**So that** 我不必注册就能表达喜欢

**Acceptance Criteria:**
- [ ] 未登录状态下点击点赞**立即生效**（按钮变实心、数字 +1），不弹登录提示
- [ ] 再次点击取消点赞，数字 -1，按钮恢复空心
- [ ] 刷新页面后，点赞态与数字保持（点赞态来自本机设备号，数字来自计数器）
- [ ] 同一设备对同一 mod 重复点赞不会重复计数（服务端按设备号去重）
- [ ] 接口失败时**回滚** UI 状态并给出轻提示（非阻塞 toast），不出现「点了没反应」

### Story 2: 游客收藏 + 查看本机收藏清单

**As a** 未登录访客
**I want to** 收藏 mod 并在之后找回
**So that** 收藏真的有用，而不是一个点了就丢的标记

**Acceptance Criteria:**
- [ ] 未登录可收藏/取消收藏，行为与点赞一致（实时、可回滚）
- [ ] `/favorites` 页对游客可访问，数据来自本机（localStorage），展示本机收藏的 mod
- [ ] 登录用户访问 `/favorites` 时，展示「服务端收藏 ∪ 本机收藏」并按 mod id 去重（本次登录侧数据源保持现状）
- [ ] 本机收藏清单为空时展示空态 + 引导文案，不报错

### Story 3: 浏览计数

**As a** 站点运营者
**I want** 浏览数反映真实访问量
**So that** 它可以用作热度信号

**Acceptance Criteria:**
- [ ] 打开 mod 详情页时上报一次浏览
- [ ] 同一设备同一天对同一 mod 只计 1 次；刷新、反复进出**不**增加
- [ ] 机器人 UA（bot/spider/crawler）不计入（沿用现有 `shouldCountView` 规则）
- [ ] 上报失败静默降级，不影响页面渲染

### Story 4: 卡片数字刷新

**As a** 访客
**I want** 看到的数字是当前值
**So that** 我不怀疑站点坏了

**Acceptance Criteria:**
- [ ] 进入列表页/详情页时**批量拉一次**当前页所有 mod 的计数，覆盖快照里的旧值
- [ ] 用户自己的操作**本地即时更新**，不等服务端回包
- [ ] 批量接口失败时**静默降级**为主快照里的值（不白屏、不报错）
- [ ] 一次请求只带当前页的 mod id，不请求全站计数

### Story 5: 旧计数当基线

**As a** 站点运营者
**I want** 历史数据不丢
**So that** 已有热度不被清零

**Acceptance Criteria:**
- [ ] 上线时一次性把 Supabase 现存的 `likes_count` / `favorites_count` / `views` 读入计数器作为起点
- [ ] 导入以只读方式读取（可用直连 5432 兜底），**不修改** Supabase 中的任何数据
- [ ] 导入可重复执行且幂等（重复执行不会把基线叠加两次）

---

## Functional Requirements

### Core Features

**Feature 1: 匿名设备号**

- Description：首次访问时在 localStorage 生成一个随机 UUID（如 `wavemod-device-id`），之后所有互动请求带上它
- User flow：访问站点 → 无则生成 → 存 localStorage → 互动时随请求发送
- Edge cases：localStorage 被禁用/隐私模式下不可写 → 退化为「本会话内有效」（用内存变量），不阻塞交互
- Error handling：设备号缺失时服务端仍接受写入，但视为不可去重（计数器按「+1」处理），不报错

**Feature 2: 轻量计数器（服务端）**

- Description：自托管机器上一个独立的计数器，保存 `{ modId: { likes, favorites, views, likedBy: [deviceId], favoritedBy: [deviceId], viewedToday: {...} } }`，落盘为单个 JSON 文件，进程内维护写队列 + 原子替换（临时文件 + rename）
- User flow：读走内存快照；写走队列，串行落盘（可合并同 mod 的多次写）
- Edge cases：进程重启 → 从文件恢复；文件损坏 → 从备份恢复并记日志（不静默清零）
- Error handling：落盘失败不阻塞响应（内存已更新），但必须在服务端日志留痕

**Feature 3: 互动 API**

- Description：一个批量读 + 一个写的极简接口（如 `GET /api/engagement?ids=a,b,c` 与 `POST /api/engagement`），不读 cookie、不要求登录
- User flow：前端进页面批量读；用户操作时写
- Edge cases：请求体/参数非法 → Zod 校验拒绝；未知 modId → 接受写入但不影响其他 mod
- Error handling：任何失败都返回结构化错误，前端据此回滚或降级

**Feature 4: 前台合并与交互**

- Description：`ModInteractionBar` 及卡片上的三个数字改为「快照值 → 客户端拉取覆盖 → 本地操作叠加」三层；点赞/收藏按钮从「提交表单等结果」改为「乐观更新」
- User flow：进页面 → 批量拉 → 覆盖 → 点击 → 即时变 → 后台写
- Edge cases：快照里没有该 mod（新上传）→ 计数从 0 起
- Error handling：拉取失败保留快照值；写入失败回滚并 toast

**Feature 5: 移除登录门槛**

- Description：删除点赞/收藏路径上的 `getCurrentUser()` 前置校验与「请先登录」提示；`toggleLikeAction` / `toggleFavoriteAction` 不再写 Supabase
- User flow：无登录要求
- Edge cases：老页面/旧链接仍提交到 Server Action → 兼容期内保留入口，行为改为走新通道
- Error handling：—

### Out of Scope（本次明确不做）

- **评分**：继续走 Supabase（修好前仍不可用）
- **评论**：继续走 Supabase
- **`likes` / `favorites` 表的清理与迁移**：本次只把它们当只读基线，不动表结构、不删数据
- **登录用户的 profile 页「我的点赞/收藏」列表**：仍读现状数据源；本次不改造（游客侧改用本机清单）
- **跨设备同步**：游客数据只在本机，不做账号绑定合并
- **反刷的强对抗**（验证码、行为分析）：本期不做，仅做设备号去重
- **移动端 App / 桌面端（JASM）**：只影响 Web

---

## Technical Constraints

### Performance

- 批量读接口只接收当前页 id（通常 ≤ 24 个），响应体为 `{id: {likes, favorites, views}}`；P95 < 300ms
- 单次写 P95 < 500ms；落盘异步化，不进入请求关键路径
- 不得引入全站级重扫（与现有 `revalidateModEngagementCaches` 的省流量策略保持一致）

### Security

- 设备号为**随机 UUID**，不含任何用户身份信息，不与其他数据关联，属匿名标识
- 不引入新的第三方数据出口；计数器只在自托管机器本地落盘
- 接口必须做输入校验（Zod）与体量限制（单次 id 数量上限），防止被当作无限写入的放大器
- 不因为「无登录」而放开管理类操作：计数器只允许增减互动数，不允许任意改写

### Integration

- **COS 兜底快照**：仍是最新内容来源；计数以「快照值 + 计数器覆盖」合并，不改变快照生成管线
- **现有备份链路**：计数器文件应纳入既有 `backup-to-github.mjs` 的每日备份范围
- **Supabase**：仅在上线时**只读**一次用于导入基线；导入后互动链路与其完全解耦

### Technology Stack

- 服务端：Next.js Route Handler（自托管，PM2）
- 存储：本机 JSON 文件 + 原子替换（**不引入数据库、不引入新依赖**，遵循 CLAUDE.md「不引入未声明依赖」）
- 前端：React 19 + TanStack Query（项目已有），乐观更新 + 本地回滚
- 兼容：现代浏览器；localStorage 不可用时降级为本会话内存

---

## MVP Scope & Phasing

### Phase 1: MVP（本次上线必须）

- 匿名设备号（含 localStorage 不可用时的降级）
- 轻量计数器 + 落盘 + 原子替换 + 启动恢复
- 批量读 / 单条写 API
- 点赞、收藏、浏览三条链路接入，移除登录门槛
- 前台批量拉取 + 乐观更新 + 失败降级
- 旧计数一次性幂等导入
- `/favorites` 支持游客本机清单

**MVP Definition**：未登录访客能点赞、收藏、产生浏览数；刷新后数字还在；Supabase 挂着也不影响。

### Phase 2: 增强（上线后视情况）

- 收藏/点赞的设备号集合压缩与分段存储（控制文件体积）
- 按 IP + 时间窗的频率限流
- 计数器的健康检查与「写入失败」告警（避免再次静默）
- 评分接入同一套通道

### Future Considerations

- 账号可选绑定：把本机互动合并进账号，实现跨设备同步
- 互动数据回流到热门排序 / 精选位的自动化决策

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 设备号可被清空重刷（数字虚高） | 中 | 低 | 设备号去重 + 浏览按「设备+天」；后续加 IP 限流；数字用途是热度参考而非计费 |
| 计数器文件损坏或丢失 | 低 | 高 | 原子替换写；纳入每日备份；启动时校验并在损坏时回退备份 + 告警，绝不静默清零 |
| PM2 多实例导致计数互相覆盖 | 中 | 中 | **上线前必须确认单实例**；若多实例，改为追加日志 + 单写者落盘 |
| 首次导入基线重复执行导致叠加 | 低 | 中 | 导入脚本幂等（以 `mods.id` 为键做「仅当缺失时写入」） |
| 游客本机收藏与登录收藏合并出现重复 | 中 | 低 | 合并时按 mod id 去重；以「服务端优先」为准 |
| 「无登录」被误认为可无限写入 | 低 | 中 | 接口校验 + 体量上限 + 后续限流；不开放管理类写操作 |
| 改造触及缓存策略，反而拖慢站点 | 中 | 中 | 计数走独立接口，不进 ISR 路由；不新增全站级 revalidate |

---

## Dependencies & Blockers

**Dependencies**

- **一次前端部署**：自托管机器 `build + restart`（推 main 不会自动部署）
- **服务器可写路径**：计数器文件需要落在 PM2 进程有写权限的目录（当前仓库/PM2 属 root，需确认落点与权限）
- **单实例确认**：PM2 是否单进程运行，决定计数器实现（内存 + 落盘 vs 追加日志）
- **一次 Supabase 只读**：用于导入基线，可用直连 5432 兜底

**Known Blockers**

- 服务器登录链路目前较脆（SSH 抖动、权限归属 root），部署与落点确认可能占用额外时间
- 若 PM2 为多实例且短期无法收敛为单实例，需先改设计再开工

---

## Appendix

### Glossary

- **匿名设备号**：localStorage 中随机生成的 UUID，仅用于互动去重，不代表任何用户身份
- **计数器**：自托管机器上保存互动数字的轻量文件存储，替代 Supabase 承担互动写入
- **基线**：上线时从 Supabase 读出的历史计数，作为新计数器的初始值
- **快照**：构建期/脚本产出的 COS 上的 `mods-snapshot.json.gz`，是前台内容的兜底来源

### References

- 现有实现：`src/actions/mods/like-actions.ts`、`src/actions/mods/favorite-actions.ts`、`src/app/api/mods/[id]/view/route.ts`
- 缓存策略：`src/lib/mod-cache.ts`（`revalidateModEngagementCaches`）
- 快照与兜底：`docs/disaster-recovery.md`
- 计数器落盘与备份：`scripts/backup-to-github.mjs`

---

*本 PRD 经交互式需求澄清与质量评分产出，覆盖业务、功能、体验与技术四个维度。*
