# Product Requirements Document: 角色详情弹窗（Mod Detail Sheet）版式重构

**Version**: 1.0
**Date**: 2026-10-20
**Author**: Sarah (Product Owner)
**Quality Score**: 91/100

---

## Executive Summary

主站所有「点开一个外观资源」的入口（角色分类页、首页、更新页、`/mods/<id>` 直链）最终都落到同一个详情弹窗 `ModDetailDrawer`。当前预览画框是**写死的固定高度**（`h-[44vh] min-h-[260px] max-h-[520px]`），图片用 `object-contain` 塞进去，导致横屏预览图上下留下大片奶油色空白、整张图被压小，用户看不清「这个外观到底长什么样」——而这正是用户点开详情的第一诉求。

本次要把详情弹窗从「固定画框 + 信息堆叠」重构为**以图为先的内容流**：横图按真实比例完整铺满宽度、竖图限高完整缩放；版式对齐参考图（白底、4px 黑边、硬阴影、大标题、徽章行、青色版本块、粉色主下载、灰底其他网盘、底部操作条）。桌面端同步从右侧窄抽屉改为居中宽弹窗，让横图有足够的展示宽度。

改动集中在 3 个文件 + 1 个共享组件的新增变体，不涉及数据库、不动列表卡片与瀑布流，风险可控。

---

## Problem Statement

**Current Situation**

- 预览画框高度固定，横图（如 720×448、16:10）在画框内等比缩放后高度只占画框的一部分，上下是空白的 `#fff8ef` 底色，视觉上图「变小了」。
- 桌面端弹窗仅 45% 屏宽，横图再被窄栏二次压缩，主视觉信息量不足。
- 顶部信息与下载区是「标签 → 数据卡 → 画廊 → 下载方式标题 → 一串同权重按钮」，没有主次，下载按钮混在网盘按钮里看不出哪个是主推。
- 浏览/下载/收藏与徽章分两处展示，手机首屏被样板信息占掉一部分高度。

**Proposed Solution**

- 预览框改为**由图片比例决定**：横图 `width: 100% / height: auto`，竖图限高后完整缩放；不再有「画框比例」。
- 版式按参考图重排：顶栏角色标签 + 关闭 → 大标题 → 徽章行（网盘 / 更新时间 / 浏览·下载）→ 预览图（右下「点击查看大图」角标）→ 游戏版本青色块 → 简介块 → 粉色主下载 → 其他网盘灰块 → 底部操作条（分享 / 复制链接 / 收藏）。
- 桌面端改为 720px 宽居中弹窗；手机端保持全屏。

**Business Impact**

- 详情页是转化链路最后一跳（看图 → 下载）。图看不清会直接拉低「打开详情 → 点下载」的转化。
- 版式统一后，后续新增字段（作者、适配版本等）有明确的落位规则，不用每次重排。

---

## Success Metrics

**Primary KPIs**

- 横屏预览图留白：手机端 390px 宽视口下，横图渲染高度与 `宽 / 原图宽高比` 的偏差 < 1%，上下留白 = 0。
- 竖屏预览图：整图可见（`object-fit` 无裁切），渲染高度 ≤ 62vh，抽屉不出现横向滚动。
- 桌面端（≥640px）：弹窗宽度 720px、居中，横图渲染宽度 = 容器宽 - 内边距。
- 主下载按钮为视觉最强元素：粉色主按钮的对比度与尺寸（高度 ≥ 48px）高于任何网盘次按钮。

**Validation**

- 用 headless Chrome + CDP 在 393×852（手机）与 1440×900（桌面）两个视口截图核对，各取一张横图 mod（如 720×448）与一张竖图 mod。
- 取 10 个真实 mod（横竖各 5）逐一截图，确认无裁切、无溢出。

---

## User Personas

### Primary: 手机端找外观的玩家
- **Role**: 在手机上刷角色分类页、看预览、存网盘链接
- **Goals**: 快速看清预览图里这套外观的细节，然后拿到网盘链接
- **Pain Points**: 横图被压小、上下留白；信息密度低，要滚很久才能到下载
- **Technical Level**: 中级

### Secondary: 桌面端整理收藏的用户
- **Role**: 在大屏上对比多个 mod
- **Goals**: 一个足够大的预览画面
- **Pain Points**: 45% 窄抽屉让横图比列表卡片还小
- **Technical Level**: 中级

---

## User Stories & Acceptance Criteria

### Story 1: 横屏预览图完整展示

**As a** 手机端用户
**I want to** 打开详情就看到一张按原始比例铺满宽度的预览图
**So that** 我能看清外观细节

**Acceptance Criteria:**
- [ ] 横图（宽/高 ≥ 1）渲染为宽度 = 内容区宽度、高度自动，图片上下无留白
- [ ] 横图不被裁切、不被放大拉伸（`object-fit` 不参与裁切）
- [ ] 画框仍是 4px 黑边 + 硬阴影的卡片样式，图片四周无额外内边距（`p-0`），黑边直接贴图
- [ ] 图片右下角有「点击查看大图」黑底角标，点击打开现有灯箱

### Story 2: 竖屏预览图不裁切且不超屏

**As a** 手机端用户
**I want to** 竖图完整显示但不超过一屏
**So that** 我不用滚动半天，也不丢内容

**Acceptance Criteria:**
- [ ] 竖图（宽/高 < 1）整图完整可见，渲染高度 ≤ 62vh
- [ ] 竖图两侧的空白取抽屉背景色，与图片黑边区分明显
- [ ] 超长竖图（如 1:3）也不会把底部下载区推到很远：最多占 62vh

### Story 3: 信息与操作按主次排布

**As a** 任何用户
**I want to** 一眼看出这是什么角色的什么 mod、哪个是主下载
**So that** 我少一次判断成本

**Acceptance Criteria:**
- [ ] 顶栏左为角色标签（`鸣潮 · {character}` 风格），右为关闭按钮；分享入口移到底部操作条
- [ ] 大标题单独成行，位于顶栏下方
- [ ] 徽章行显示：主网盘平台名、`更新于 YYYY-MM-DD（N 天前）`、`{views} 次浏览 · {downloads} 次下载`
- [ ] 「游戏版本」为独立青色块，显示 `mod.gameVersion`
- [ ] 「简介」为独立白底块；无简介时显示「站长还没有填写简介。」
- [ ] 主下载为粉色通栏按钮，文案含网盘平台名；其余网盘收进灰底「其他网盘」块
- [ ] 底部操作条含：分享、复制网盘链接、收藏

### Story 4: 桌面端居中宽弹窗

**As a** 桌面端用户
**I want to** 详情以一个 720px 宽的居中弹窗呈现
**So that** 横图有足够展示空间

**Acceptance Criteria:**
- [ ] ≥640px 视口：弹窗 720px 宽、水平居中、最大高度 90vh、内部滚动
- [ ] <640px 视口：全屏弹窗（保持现状）
- [ ] 弹窗出场动画保留（不再是从右侧滑入，改为淡入 + 轻微缩放）
- [ ] 首页轮播、更新页、`/mods/<id>` 直链打开的仍是同一个组件且行为一致

---

## Functional Requirements

### Core Features

**Feature 1: 比例自适应的预览画框（`drawer-preview-gallery.tsx`）**
- Description: 去掉固定高度画框，按图片真实宽高比决定渲染尺寸。
- User flow: 图片 `onLoad` 读 `naturalWidth/naturalHeight` → 计算 ratio → ratio ≥ 1 走横图分支，否则走竖图分支。首次进入、比例未知时用 `min-h-[200px]` 占位，避免布局塌陷。
- 横图分支：容器 `w-full`，图片 `w-full h-auto block`。
- 竖图分支：容器 `w-full flex justify-center`，图片 `h-[62vh] max-h-[62vh] w-auto`。
- 角标：绝对定位右下角，`border-[3px] border-black bg-white shadow-[3px_3px_0px_0px_#000]`，文案「点击查看大图」。
- 多图箭头与计数保留（>1 张时），位置压在图片上。
- Edge cases:
  - 无图 → 保留现有「暂无预览图」占位（高度改为固定 40vh）。
  - 图片加载失败 → 落入占位态，不撑出一个 0 高度的空框。
  - 第三方外链图（`isExternalStorageUrl`）→ 不拼 COS 参数，走 `unoptimized`。
- Error handling: `onLoad` 未触发时以 3/4 兜底比例渲染，加载完成后自动切换。

**Feature 2: 内容流重排（`mod-detail-drawer.tsx`）**
- Description: 总览 tab 内容按参考图顺序重排；「总览 / 评论」tab 保留不变。
- 顺序：角色标签 + 关闭（固定顶栏）→ tab 栏 → 大标题 → 徽章行 → 预览图 → 游戏版本块 → 简介块 → 主下载 → 其他网盘 → 底部操作条（固定于弹窗底部，不随内容滚动）。
- 现有「适配 X」徽章的内容并入「游戏版本」块；「版本」徽章移除（信息并入标题或后续另议）。
- 收藏按钮从数据卡旁移到底部操作条，与分享、复制链接等宽三等分。

**Feature 3: 桌面居中弹窗（`components/ui/sheet.tsx`）**
- Description: 为 `Sheet` 新增 `side="center"` 变体。
- 行为：`fixed inset-0 m-auto max-h-[90vh] max-w-[720px]`，入场 `opacity 0→1` + `scale 0.96→1`；`top/right/bottom/left` 四个既有 side 行为**完全不变**。
- Edge cases: 内容高于 90vh → 内部滚动，底部操作条固定。

**Feature 4: 下载区三分块（`download-button.tsx`）**
- Description: 主下载按钮 + 「其他网盘」块 + 底部操作条。
- 主下载：取 `driveLinks[0]` 为主盘，按钮文案「下载模组 · {platform}」；无网盘链接但有直链时，文案回退为「直链下载 ZIP」。
- 其他网盘：剩余 `driveLinks.slice(1)`，灰底块内横排按钮；为空时不渲染该块。
- 复制/唤起逻辑保持现状（手机端跳分享页、桌面端复制并唤起客户端），不改变已确认的交互。

### Out of Scope
- 列表卡片（`mod-card.tsx`）与瀑布流（`masonry-packing.ts`）——本次完全不动。
- 分站详情页（`game-mod-detail-content.tsx`、ZZZ 详情页）。
- 灯箱新增缩放/拖拽能力。
- 评论区样式。
- 数据库 schema、COS 图片尺寸策略、快照结构。

---

## Technical Constraints

### Performance
- 不新增依赖；`framer-motion` 已在 `download-button.tsx` 中使用，其余动画用 CSS 实现。
- 图片仍走 COS 数据万象变换 + `srcset`（320/480/560/800），不拉原图。
- 注意：Next `<Image>` 会丢弃自定义 `srcset`（见 `lib/cos/shared.ts` 注释），预览图改用原生 `<img>` + `cosImageSrcSet`，与 `mod-card.tsx` 一致。

### Security
- 无新增用户输入；不改鉴权。
- 外链图片仍按 `isExternalStorageUrl` 判定，不信任其域名。

### Integration
- **Sheet 组件**：新增变体，必须回归验证其它使用方（hero 轮播、updates-grid、移动端首页）。
- **COS 图片服务**：只读，沿用 `withCosImageTransform(current, COS_IMG_HERO)`。
- **互动计数**：`useEngagement` 逻辑不变，只移动展示位置。

### Technology Stack
- Next.js 15 App Router / React 19 / Tailwind（项目已有 neo-brutalism token：`.neo-card`、`.neo-sticker`）
- 浅色奶油底 `#fff8ef`、主粉 `#FF2D78`、青色块 `#22D3EE`、灰块 `#F2F2F2`、硬阴影 `4-6px 0 0 #000`

---

## MVP Scope & Phasing

### Phase 1: MVP
- 预览画框比例自适应（横图铺满 / 竖图限高）
- 角标「点击查看大图」
- 信息流重排（标签、标题、徽章、版本块、简介块）
- 下载区三分块 + 底部操作条
- 桌面端居中 720px 弹窗

**MVP Definition**：用户点开详情，第一屏能完整看到横屏预览图，并能一步找到主下载入口。

### Phase 2: Enhancements
- 多图切换的高度过渡动画
- 竖图/横图混排时的缩略图比例优化

### Future Considerations
- 详情页独立路由（当前 `/mods/<id>` 渲染的是列表外壳）
- 灯箱手势缩放

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| `Sheet` 新增 `center` 变体影响其它抽屉 | Med | High | 新变体为纯增量，默认值仍是 `right`；改完跑一遍首页轮播、`/updates`、`/mods/<id>` 三个入口 |
| 多图横竖切换导致高度跳动 | High | Low | 已确认接受；Phase 2 再加过渡动画 |
| 原生 `<img>` 替换 `next/image` 后失去 lazy/尺寸优化 | Med | Low | 手动 `loading="lazy"` + `srcset` + 显式 `sizes` |
| 图片比例测量在 CDN 慢时延迟 → 短暂布局塌陷 | Med | Med | 加载前用 `min-h-[200px]` + 兜底 3/4 比例 |
| 主网盘判定（`driveLinks[0]`）与用户预期不一致 | Low | Med | 顺序来自后端返回，本次不改排序；若出现异常再补排序规则 |

---

## Dependencies & Blockers

**Dependencies**
- COS 缩略图参数（已上线）
- 现有灯箱（`mod-detail-drawer.tsx` 内）
- 现有互动计数 hook（`useEngagement`）

**Known Blockers**
- 无

---

## Assumptions（需用户确认，默认按此实现）

1. **更新时间**：库中 `SiteMod` 没有 `updated_at`，`更新于` 使用 `createdAt`（每日入库时设置为当天 12:00 上海时间）。
2. **主网盘**：以 `driveLinks[0]` 为主盘，按钮文案显示其 `platform`。
3. **游戏版本**：青色块取 `mod.gameVersion`（与现有「适配 X」徽章同源）。
4. **收藏按钮**：移到底部操作条，与分享、复制链接三等分；参考图未包含该元素。
5. **竖图限高**：暂定 62vh（手机）/ 62vh（桌面），实现后可按截图微调。

---

## Appendix

### Glossary
- **详情弹窗 / Sheet**：`ModDetailDrawer`，主站所有 mod 详情视图。
- **预览画廊**：`DrawerPreviewGallery`，弹窗顶部图片区。
- **neo-brutalism**：项目现有白底 + 4px 黑边 + 硬阴影的视觉体系。

### References
- 参考图 1：720×448 横版 mod 预览图（比例基准）
- 参考图 2：手机端详情弹窗版式（内容顺序与配色基准）
- `src/components/features/mods/detail/mod-detail-drawer.tsx`
- `src/components/features/mods/detail/drawer-preview-gallery.tsx`
- `src/components/features/mods/detail/download-button.tsx`
- `src/components/ui/sheet.tsx`

---

*本 PRD 通过与用户多轮澄清（范围 / 竖图策略 / 评论区 / 桌面形态 / 徽章行 / 切换行为 / 下载区结构）产出。*
