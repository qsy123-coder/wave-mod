# PRD: 首页直达角色分类 + 沉浸式卡片布局

**Version**: 1.0
**Date**: 2026-10-31
**Author**: Product / Claude
**Status**: 已实现（2026-10-31，提交 ae70511b；CI 与线上均已验证）

---

## 背景与问题

站点的高频用户（每天来看更新的那批人）几乎只看 `/mods` 的角色分类列表：

- 首页 `/` 是给新访客看的门面（Hero、轮播、ZZZ 第二屏），老用户每次都要多点一次「直链下载」才能到列表，多一次导航、多一次等待。
- 进了 `/mods` 之后，左侧 240px 角色侧栏 + 顶部 sticky 导航栏各占一块，桌面端真正给卡片的横向空间只剩约 `1680 - 240 - 24 = 1416px`；竖屏浏览时导航栏又吃掉约 76px 高度。

用户 2026-10-31 明确提出两件事：

1. **首页毫秒级直接跳转到角色分类页**，并且可以开关；
2. **角色分类页加一个布局按钮**，隐藏左侧边栏（带动画）+ 隐藏最上方导航栏，让卡片最大限度展示。

已确认的产品决策（本轮问答）：

| 决策点 | 结论 |
| --- | --- |
| 跳转机制 | 首页 HTML 最前面的内联脚本 + localStorage，绘制前 `location.replace("/mods")`；不改 `proxy.ts`，首页继续保持静态/CDN 缓存 |
| 开关位置 | 顶栏账户下拉 + `/mods` 工具栏两处，共用同一状态 |
| 沉浸按钮 | **一个**按钮同时隐藏侧栏与导航栏，状态记忆在本机 |
| 手机端 | 仅桌面端（`lg` ≥ 1024px）生效，手机保持现有导航 |

---

## 目标 / 非目标

### 目标

- 开启「直达分类」后，访问 `/` 在**首次绘制前**被替换为 `/mods`，用户看不到首页内容（不是「首页闪一下再跳」）。
- `/mods` 工具栏提供「直达分类」和「沉浸布局」两个开关，桌面端用沉浸布局可隐藏侧栏与导航栏，卡片区立即获得释放出来的全部空间。
- 两处开关状态一致，刷新/下次访问保持；切换有动画（侧栏滑出 + 内容区宽度过渡，导航栏上滑 + 外壳高度过渡）。
- 不破坏现有：布局切换（网格/瀑布流）、列数选择、无限滚动、详情抽屉、角色筛选、返回顶部、手机端导航。

### 非目标（本次不做）

- 不改 `src/proxy.ts`、不做服务端 302 重定向；不新增数据库字段/接口（纯本机 localStorage）。
- 不隐藏 `mod` 详情抽屉里的任何栏；不影响 `/gallery`、`/guide`、游戏分站（`/[game]/mods`）与后台。
- 手机端不隐藏导航栏、不提供悬浮退出按钮（移动端侧栏本来就是隐藏的）。
- 不做跨设备同步、不做埋点统计、不加快捷键（`Esc` 已被搜索框/抽屉占用，避免冲突）。

---

## 用户故事

### Story 1: 直达角色分类

**As a** 每天来收 mod 的老用户
**I want to** 打开站点/首页时直接落在角色分类页
**So that** 我不用每次多一次点击和等待

**验收标准**

- [ ] 默认关闭。关闭时 `/` 行为与现在完全一致。
- [ ] 在顶栏账户下拉或 `/mods` 工具栏开启后，访问 `/` **在浏览器首次绘制前**被替换到 `/mods`（Network 面板中首页文档会被替换，页面上不出现 Hero/轮播）。
- [ ] 使用 `location.replace`，浏览器后退不会卡回首页形成「首页 ↔ /mods」死循环。
- [ ] 关闭后再次访问 `/`，首页正常显示。
- [ ] localStorage 不可用（隐私模式/被禁用）时静默失效，首页正常显示，不报错。
- [ ] 无 JS 的爬虫/极老客户端照常拿到首页（SEO 不受影响；站点已全站 `noindex`）。

### Story 2: 沉浸布局

**As a** 想要一屏多看几张卡片的浏览者
**I want to** 一键隐藏左侧角色栏和顶部导航栏
**So that** 卡片能占满视口

**验收标准**

- [ ] `/mods` 工具栏出现「沉浸布局」按钮（桌面端可见）；点击后：
  - 左侧栏向左滑出并淡出，宽度收为 0，腾出的横向空间由卡片区接管；
  - 顶部导航栏上滑离开视口，`/mods` 外壳同步上提、高度补满 `100dvh`；
  - 动画约 300ms，结束后卡片区铺满视口，无空白条、无横向/纵向多余滚动条。
- [ ] 再点一次（按钮位置不变）恢复原布局，同样有动画。
- [ ] 沉浸状态下侧栏里的「全部角色」按钮仍有入口：工具栏出现同款「全部角色」按钮，
      点击打开同一个全部角色分类抽屉，选中角色能正常跳转并关闭抽屉。
- [ ] 状态存入 localStorage；刷新 `/mods` 后保持（首次硬加载允许看到一次收起动画，视为入场动画）。
- [ ] 离开 `/mods`（如点侧栏/工具栏外的链接进入教程页）时导航栏立即恢复，沉浸状态只作用于 `/mods` 与 `/mods/*`。
- [ ] 窗口缩到 `< 1024px` 时自动失效：导航栏可见、侧栏保持原手机形态；状态仍保留，回到桌面宽度后恢复。
- [ ] 尊重 `prefers-reduced-motion`：减少动效时直接切换，不做位移/宽度过渡。
- [ ] 沉浸状态下：工具栏、搜索、筛选、布局切换、列数、详情抽屉、「回到顶部」全部照常可用。

### Story 3: 两处开关一致

**As a** 在任一位置改过设置的用户
**I want to** 另一处立即显示相同状态
**So that** 不会出现「工具栏说开着、菜单说关着」

**验收标准**

- [ ] 顶栏账户下拉中的「直达分类」带勾选态；`/mods` 工具栏的按钮有激活样式。
- [ ] 任一处切换后，另一处立即同步（同一 Context 状态 + 同一 localStorage key）。
- [ ] 刷新页面后两处都从 localStorage 恢复。

---

## 方案设计

### 1. 直达分类：首页内联脚本（不选服务端 302）

**做法**：在 `(home)/layout.tsx` 返回树的最前面放一段同步内联脚本（与根 layout 里主题脚本同一思路）：

```html
<script>
(function(){try{
  if(location.pathname!=="/")return;
  if(window.localStorage.getItem("wavemod-auto-open-mods")==="1"){
    location.replace("/mods");
  }
}catch(e){}})();
</script>
```

**为什么不用服务端 302 / `proxy.ts`**：

- `src/proxy.ts` 的 matcher 目前只覆盖 `/admin/*`、`/visits/*`，里面直接做管理员鉴权（非管理员会被弹去登录）。把 `/` 加进去必须先拆出一段短路逻辑，风险高。
- 更重要的是：`/` 现在是可以被 CDN 整页缓存的静态页（`revalidate = 1800`）。让它每次都过边缘函数会损失缓存收益、增加函数调用，属于为一个小功能反向支付架构成本。
- 内联脚本在 HTML 解析阶段同步执行，**早于首屏绘制**，用户感知就是「直接到了 /mods」；首页 HTML 依旧静态、CDN 友好。
- 代价：`/` 的 HTML 仍会下载一次再被替换（但有 CDN 缓存，通常几十毫秒）；无 JS 环境不生效（可接受）。

**开关写入**：客户端 Provider 写 localStorage，key 统一在 `src/lib/preferences/site-preferences.ts` 定义，脚本字符串由同一模块生成，避免两处各写一个常量。

### 2. 沉浸布局：状态放 Context，类名分两层加

状态需要同时被三个不同布局层级的组件读到：

- 顶部导航栏在 `(site)/layout.tsx`（以及首页 `(home)/layout.tsx`）；
- `/mods` 外壳在 `(site)/mods/layout.tsx`；
- 侧栏在 `mods-listing-view.tsx`。

所以新增 `SitePreferencesProvider`（客户端 Context）挂在根 layout 的 `ClientProviders` 内，暴露：

```ts
{ autoOpenMods, setAutoOpenMods, immersive, setImmersive }
```

初值 `false`，挂载后从 localStorage 读取（与 `use-layout-preference.ts` 同一 hydration 安全模式），因此不会产生 hydration mismatch。

**侧栏收起与主内容区展开（`mods-listing-view.tsx` + `mods-infinite-grid.tsx`）**

- 侧栏外层**瞬时切换宽度**：展开 `lg:w-[240px]`，收起 `lg:w-0 lg:-mr-6`
  （`-mr-6` 抵消父容器 `gap-6` 留下的 24px）。面板固定 `w-[240px]`，
  用 `translate` + `opacity` 滑出/滑入（合成层）。
- 主内容区**不做逐帧宽度重排**，改用网格的 **FLIP 缩放**：
  1. `setImmersive` 同时写入 `layoutShift`（key + delta，delta = 侧栏 240 + gap 24 = 264）；
  2. 网格在 `useLayoutEffect` 里用「切换前宽度 + delta」作为目标宽度排一次版；
  3. 给网格容器加 `translateX(delta) scale(切换前宽度/目标宽度)`，把新布局
     在视觉上映射成旧布局；下一帧过渡到 `none`（300ms）。
  - 整段动画只有 `transform`，不重排任何卡片；视觉上是卡片区平滑缩放展开/收窄。
- 收起时加 `inert` + `aria-hidden` + `pointer-events-none`，避免 Tab 键焦点跑进看不见的链接。
- `prefers-reduced-motion` 下跳过 FLIP，直接按目标宽度切换。
- **为什么不用逐帧宽度过渡**：卡片区每帧都要重排列宽、卡片位置与文字换行，
  真实浏览器里仍有细微抖动；FLIP 实测（1440×900、瀑布流、开启 GPU）
  平均 4.6ms/帧、0 帧 > 33ms。
- **沉浸模式下「全部角色」按钮仍可用**：它会随侧栏面板滑走，所以 `/mods` 工具栏补一个
  同款入口（`data-character-picker-trigger`），打开的是**同一个**
  `CharacterPickerDrawer`。抽屉状态因此上提到 `mods-listing-view`；后台 / 游戏分站
  不传 `onOpenPicker`，`CharacterSidebar` 回落到组件内自管模式，行为不变。

**导航栏收起（`site-header-client.tsx`）**

- 条件：`immersive && isDesktop && pathname` 是 `/mods` 或 `/mods/*`。
- 加 `-translate-y-full opacity-0 pointer-events-none`，并常驻 `transition-transform/opacity duration-300`；同一条件下加 `inert`。
- 关键点：header 是 `sticky`，**仍然占据文档流高度**。只做位移会留下 76px 空白，所以必须由 `/mods` 外壳反向补偿。

**外壳补偿（`(site)/mods/layout.tsx`）**

现有外壳：

```tsx
<div className="flex h-[calc(100dvh-var(--site-header-h))] flex-col overflow-hidden">
```

- 抽取为客户端组件 `ModsShell`，按沉浸状态二选一（不要在同一个元素上叠加普通类 + `lg:` 覆盖，避免 Tailwind 生成顺序带来的不确定性）：
  - 普通：`h-[calc(100dvh-var(--site-header-h))]`
  - 沉浸（且桌面）：`h-[100dvh] -mt-[var(--site-header-h)]`
- 外壳**不做 height/margin 插值**，用 `transition-[height,margin-top] duration-0` + `transition-delay` 控制切换时机：
  - 收起（目标状态 `delay-0`）：外壳立刻补满视口，此时导航栏还盖在顶部，随后导航栏滑走把内容「揭」出来；
  - 展开（目标状态 `lg:delay-300`）：外壳先保持满屏，等导航栏滑下来盖住顶部后再缩回 ——
    否则导航栏还在半空时顶部会露出一条背景空隙。
- `/mods` 上 `BodyScrollLock` 已锁 body 滚动、`ConditionalFooter` 已返回 null，负 margin 不会引起窗口滚动或页脚被顶出。
- `--site-header-h` 由 header 的 ResizeObserver 实测写入，位移不改变它，所以负 margin 拿到的是真实高度；`/mods` 的 header 没有顶部通知条，高度就是导航行高度。

**为什么用「负 margin + 高度补满」而不是给 header 动画 `height`**：

- `height: auto → 0` 无法过渡（auto 不可插值），要做就得把 header 高度钉成像素，影响顶部通知条动态开关，牵一发动全身；
- 负 margin + `100dvh` 只改 `/mods` 自己的外壳，不必改 header 的测量逻辑；再配合延迟跳变，切换过程被导航栏的位移遮住。

### 3. 手机端与降级

- `useIsDesktop()`（`matchMedia("(min-width: 1024px)")`）为假时，所有沉浸效果类名都不加；Provider 里的状态仍保留，回到桌面自动恢复。
- `prefers-reduced-motion: reduce` 时关闭过渡（`motion-reduce:transition-none`）。
- 隐藏动画只影响 `transform/opacity/width/margin/height`，不触发 React 重排之外的布局抖动；瀑布流容器已有 ResizeObserver，会跟随宽度重新分列。

### 4. 开关 UI

- **顶栏账户下拉**（仅桌面、非后台）：新增一项「进入首页自动打开角色分类」，带 ✓ 选中态；点击不关菜单或关菜单均可，实现时与现有条目风格一致。
- **`/mods` 工具栏**（仅主站，`gameModsPath === "/mods"`）：
  - 「直达分类」：紧凑按钮，`Home` 图标 + 文案，激活时黑底白字；
  - 「沉浸布局」：`Maximize2` / `Minimize2` 图标切换，`hidden lg:inline-flex`；
  - 放在现有布局切换组（`ml-auto`）左侧，不挤占搜索框。
- 游戏分站（`game-mods-filter-client.tsx`）不渲染这两个控件。

---

## 数据与接口变更

- **无数据库、无 API、无 schema 变更。**
- 新增两个 localStorage key：

| Key | 值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `wavemod-auto-open-mods` | `"1"` / `"0"` | 无（视为关） | 首页直达分类 |
| `wavemod-mods-immersive` | `"1"` / `"0"` | 无（视为关） | `/mods` 沉浸布局 |

- 新增模块 `src/lib/preferences/site-preferences.ts`：key 常量、SSR 安全的读/写函数、生成首页内联脚本的纯函数（可单测）。
- 不触碰去重键 `character|title`、不影响每日上传脚本与快照。

---

## 边界与异常

| 场景 | 行为 |
| --- | --- |
| 隐私模式 / localStorage 抛错 | try/catch 吞掉；首页正常显示；开关点击仍能生效于当前会话（内存态），只是不持久 |
| 直达开启后用户想回首页 | 在 `/mods` 工具栏关闭「直达分类」即可；不提供「主页」临时绕行（避免死循环） |
| 直达开启 + 沉浸开启 + 刷新 `/mods` | 首帧普通布局，挂载后播放一次收起动画（视为入场动画），无功能问题 |
| 在 `/mods` 开启沉浸后点导航去 `/guide` | header 立即恢复（pathname 不再匹配），沉浸状态保留但不能在别页生效 |
| 窗口从桌面缩到手机宽度 | 沉浸自动失效；导航栏恢复；状态保留 |
| 侧栏滚动位置 | 隐藏/显示不重建节点，仍由 `scroll-memory` 维持 |
| 瀑布流列数 | 容器变宽后按现有 ResizeObserver 重新分列；若 300ms 过渡期间重排明显，可改为「宽度在 180ms 处一次到位，位移/透明度仍过渡」（实现阶段的兜底） |
| 详情抽屉 / 批量选择 / 返回顶部 | 不受影响；z-index 关系不变 |
| 首页 ISR / CDN | 不变（脚本是静态 HTML 的一部分） |

---

## 验收标准（汇总清单）

- [ ] 直达分类默认关；开启后访问 `/` 首绘前替换到 `/mods`，页面不出现首页内容。
- [ ] 关闭后 `/` 正常显示；localStorage 禁用时不报错。
- [ ] 顶栏账户下拉与 `/mods` 工具栏两处开关状态实时同步、刷新保持。
- [ ] `/mods` 沉浸按钮（桌面）隐藏侧栏 + 导航栏，卡片区铺满，动画约 300ms，无空白/滚动条异常。
- [ ] 再点恢复；离开 `/mods` 导航栏恢复；手机宽度下不生效。
- [ ] `prefers-reduced-motion` 下无过渡但仍能切换。
- [ ] 网格/瀑布流、列数、筛选、搜索、抽屉、返回顶部、无限滚动全部回归通过。
- [ ] `npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。

---

## 测试计划

### 单元测试（Vitest）

- `src/lib/preferences/site-preferences.test.ts`
  - 读/写 round-trip；非法值回落默认；
  - 生成的内联脚本包含正确 key，且对 `"1"` 才会 `location.replace("/mods")`；
  - localStorage 抛错时读取不抛出。

### 单元测试（Vitest，已落地）

- `src/lib/preferences/site-preferences.test.ts`（13 条）
  - `parseStoredFlag`：只认 `"1"`；
  - `isModsPathname` / `isImmersiveActive`：路径、桌面、开关三条件；
  - `buildAutoOpenModsScript`：在沙箱里真正执行脚本，覆盖「开启 + 首页 → replace」「关闭 → 不动」「非 `/` 不动」「localStorage 抛错静默」。

> 注：本仓库的 Vitest 运行在 `environment: "node"`，没有 jsdom / RTL，也没有追加依赖。
> Provider 与工具栏的状态同步改用下面的浏览器实测覆盖。

### 浏览器实测（CDP + 无头 Chrome，已执行）

1. 桌面 1440×900：初始侧栏 240px、header 76px；点击沉浸后侧栏 0px（opacity 0、inert）、header 上移 76px（inert）、外壳高度 824→900、margin 0→-76，逐帧采样确认是平滑插值而非瞬移；页面无多余滚动条。
2. 刷新 `/mods`：沉浸状态保持。
3. 开启直达后硬加载 `/`：地址栏直接变为 `/mods`，首页 HTML 中的内联脚本在 header 之前执行。
4. 开启直达后点 logo 走客户端导航回 `/`：被 `HomeAutoRedirect` 兜回 `/mods`。
5. 顶栏账户下拉勾选 → 工具栏按钮同步高亮、localStorage 写入；工具栏关闭 → 顶栏同步。
6. 800px 宽：导航栏可见、侧栏 `display:none`、沉浸按钮不渲染；持久化状态保留但不生效。
7. 全程无 console error / 未捕获异常。

### 回归范围

- 网格/瀑布流、列数选择、筛选、搜索、布局切换、详情抽屉、返回顶部、无限滚动。

---

## 实现记录（2026-10-31）

- 首页内联脚本放在 `(home)/layout.tsx` 返回树最前面（header 之前），实测 HTML 顺序正确。
- 站内客户端导航不会执行 `<script>`，补了 `HomeAutoRedirect`（读 Provider 状态后 `router.replace("/mods")`）。
- **Tailwind v4 的 `translate` 工具类写的是 `translate` 属性**，过渡必须写 `transition-[translate,opacity]`；写 `transform` 会变成瞬移（实测修正）。
- 项目的 `components/ui/dropdown-menu.tsx` 是自研普通 `<button>`，**不支持 Radix 的 `onSelect`**；顶栏开关改用 `onClick` + `DropdownMenuCheckboxItem`（实测修正）。

### 第二轮优化（2026-10-31，用户反馈「主内容区变大过渡不流畅」+「全部角色按钮也要显示」）

- 逐帧测量定位：最初卡顿来自侧栏宽度过渡（面板宽度跟着外层变，65 个条目逐帧重排）；
  中间试过「宽度瞬跳 + 面板位移」（60fps 但卡片区跳变）和「宽度连续过渡 + 面板固定」
  （真实浏览器仍有细微抖动）。
- **最终方案：FLIP 缩放**。`setImmersive` 同时写入 `layoutShift`（delta = 264）；
  网格在 `useLayoutEffect` 里按目标宽度排一次版，并立刻把新布局
  `translateX(delta) scale(旧宽/新宽)` 映射回旧布局，下一帧过渡到 `none`。
  整段动画只有合成层 `transform`，卡片不逐帧重排。
  开启 GPU 的 Chrome 实测平均 **4.6ms/帧、0 帧 > 33ms**。
- 外壳 height/margin 仍不做逐帧插值：用 `duration-0` + `transition-delay` 让展开侧的复位
  等导航栏落位，避免顶部露出空隙。
- 沉浸模式下「全部角色」按钮：抽屉状态上提到 `mods-listing-view`，工具栏增加同款入口；
  `CharacterSidebar` 保留受控/自管两种模式，后台与游戏分站行为不变。
- 实测：t≈60ms 网格 transform 为中间缩放假（收起 scale≈0.90 / 展开 scale≈1.19），
  t≈180ms 过渡完成；工具栏抽屉打开 67 个分类格，点选后正常跳转并关闭；无控制台错误。
- 备注：也试过浏览器原生 View Transitions（整页/命名分组），中间帧新旧界面重影明显，
  自定义 `clip-path` 在伪元素上不生效，已放弃。

---

## 分期

**Phase 1（本次）**

- 直达分类（内联脚本 + 两处开关）
- 沉浸布局（侧栏 + 导航栏 + 外壳补偿 + 状态记忆）
- 单测 + 手工验收

**Phase 2（视反馈）**

- 跨设备同步（写用户档案）
- 沉浸模式快捷键 / 悬停顶栏临时唤出
- 手机端可选沉浸（需先设计常驻退出入口）

---

## 风险与回滚

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 首页脚本导致首页彻底不可达（用户不知道去哪关） | 低 | 中 | `/mods` 工具栏开关常驻、沉浸时也不隐藏；顶栏下拉同样可关 |
| 负 margin 补偿在顶部通知条/视口单位变化时算错 | 低 | 中 | 只用 `--site-header-h` 实测值；`/mods` 无 topBar；验证 dvh + 移动端地址栏 |
| 侧栏宽度过渡期间瀑布流反复重排导致掉帧 | 中 | 低 | 实测帧率；必要时宽度在 180ms 处一次到位，仅位移/透明度过渡 |
| 隐藏导航栏后用户找不到出口 | 低 | 中 | 沉浸按钮在工具栏内始终可见；离开 `/mods` 自动恢复 |
| 新增客户端 Context 造成根布局重渲染 | 低 | 低 | 只包两个布尔值 + 稳定 setter；不放在高频更新路径 |

**回滚方式**：功能全部由 localStorage 开关驱动、默认关闭，删除两个控件 / 内联脚本即可回到现状态；不涉及数据迁移。

---

## 受影响文件（实现阶段改动清单）

**新增**

- `src/lib/preferences/site-preferences.ts`
- `src/lib/preferences/site-preferences.test.ts`
- `src/components/layout/site-preferences-provider.tsx`
- `src/components/layout/use-is-desktop.ts`
- `src/components/features/home/home-auto-redirect.tsx`
- `src/components/features/mods/list/mods-shell.tsx`

**修改**

- `src/app/layout.tsx`（挂 Provider）
- `src/app/(home)/layout.tsx`（插入直达脚本）
- `src/components/layout/site-header-client.tsx`（沉浸位移 + 账户下拉开关）
- `src/app/(site)/mods/layout.tsx`（外壳改用 `ModsShell`）
- `src/components/features/mods/list/mods-listing-view.tsx`（侧栏收起动效 + `inert`）
- `src/components/features/mods/list/mods-page-client.tsx`（向工具栏传开关与回调）
- `src/components/features/mods/list/mods-toolbar.tsx`（两个新控件）
- `docs/mod-layout-toggle-prd.md` 无需改动；本 PRD 独立

**明确不改**

- `src/proxy.ts`、`next.config.ts`
- `src/features/games/**`（分站）、后台、`/gallery`、`/guide`
- 数据库、上传脚本、去重键、快照逻辑
