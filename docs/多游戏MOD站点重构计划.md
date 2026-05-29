# 多游戏 MOD 站点重构计划

## 背景

当前 WaveMod 主要是面向“鸣潮”的 MOD 站点。后续需要支持多个游戏，例如：

- 鸣潮
- 绝区零
- 原神
- 更多游戏

本次重构不是在原有分类页里简单增加一个游戏分类，而是把“游戏”提升为一级业务维度。后续每个游戏都可能拥有完全不同的首页、分类页、详情页、教程页、排行榜、数据统计页、上传页和 UI 风格。

因此，整体架构需要支持：

- 游戏级路由切换
- 游戏级配置中心
- 游戏级独立页面布局
- 当前功能和数据的复用
- 后续设计稿按游戏逐步替换
- 没有设计稿时 fallback 复用当前通用组件

---

## 总体目标

将当前站点从：

```text
鸣潮角色 MOD 个人站
```

升级为：

```text
多游戏 MOD Hub
```

目标形态：

```text
/wuthering-waves
/wuthering-waves/mods
/wuthering-waves/mods/[id]
/wuthering-waves/guide
/wuthering-waves/ranking

/zenless-zone-zero
/zenless-zone-zero/mods
/zenless-zone-zero/mods/[id]
/zenless-zone-zero/guide
/zenless-zone-zero/ranking

/genshin-impact
/genshin-impact/mods
/genshin-impact/mods/[id]
/genshin-impact/guide
/genshin-impact/stats
```

---

## 核心原则

### 1. 游戏不是普通分类

“鸣潮 / 绝区零 / 原神”不应作为普通 `tags` 或 `character` 分类，而应该作为一级业务维度：

```text
game
```

对应内部 key：

```text
wuthering-waves
zenless-zone-zero
genshin-impact
```

### 2. 每个游戏可以有独立页面体系

后续每个游戏可能拥有不同的：

- 首页
- MOD 列表页
- MOD 详情页
- 教程页
- 排行榜
- 数据统计页
- 上传页
- 管理页
- 视觉风格

因此不能只做 `/mods?game=xxx`。

### 3. 现阶段先完成切换壳和功能复用

当前阶段不追求精美 UI，优先完成：

- 导航栏显眼游戏切换入口
- 游戏路由切换
- 数据按游戏过滤
- 当前功能复用
- 默认 fallback 页面
- 为后续独立设计稿预留结构

---

## 推荐架构

### 一、游戏配置中心

新增：

```text
src/config/games.ts
```

用于统一管理：

- 游戏 key
- 游戏名称
- 游戏 slug
- 是否启用
- 默认主题色
- 是否使用自定义布局
- 游戏导航入口

示例结构：

```ts
export type GameKey = "wuthering-waves" | "zenless-zone-zero" | "genshin-impact";

export type GameConfig = {
  key: GameKey;
  name: string;
  shortName: string;
  slug: string;
  enabled: boolean;
  useCustomLayout: boolean;
  theme: {
    primary: string;
    accent: string;
    background: string;
  };
  nav: {
    home: string;
    mods: string;
    guide: string;
    ranking?: string;
    stats?: string;
  };
};
```

---

### 二、游戏路由结构

新增动态游戏路由：

```text
src/app/[game]/page.tsx
src/app/[game]/mods/page.tsx
src/app/[game]/mods/[id]/page.tsx
src/app/[game]/guide/page.tsx
src/app/[game]/ranking/page.tsx
```

未识别游戏时：

```ts
notFound()
```

---

### 三、现有页面保留

短期不要删除现有路由：

```text
/
/mods
/mods/[id]
/guide
/favorites
/admin/upload
```

原因：

- 避免破坏现有用户路径
- 避免影响 Supabase 回调和收藏页
- 为后续平滑迁移保留缓冲期

后续可逐步考虑：

```text
/ → /wuthering-waves
/mods → /wuthering-waves/mods
/guide → /wuthering-waves/guide
```

---

### 四、数据库字段规划

为 `mods` 表增加：

```text
game_key text not null default 'wuthering-waves'
```

建议 SQL：

```sql
alter table public.mods
  add column if not exists game_key text not null default 'wuthering-waves';

create index if not exists mods_game_key_idx
  on public.mods (game_key);

update public.mods
set game_key = 'wuthering-waves'
where game_key is null;
```

已有数据默认归属：

```text
wuthering-waves
```

---

### 五、数据查询层改造

公共查询需要支持：

```ts
gameKey?: string
```

例如：

```ts
getPublicMods({ gameKey })
getPublicModById({ id, gameKey })
getFeaturedMods({ gameKey })
getLatestMods({ gameKey })
```

默认值：

```text
wuthering-waves
```

查询时增加：

```ts
.eq("game_key", gameKey)
```

---

### 六、组件和页面复用策略

建议建立游戏页面适配层：

```text
src/features/games/
  wuthering-waves/
    pages/
      HomePage.tsx
      ModsPage.tsx
      ModDetailPage.tsx
      GuidePage.tsx
  zenless-zone-zero/
    pages/
      HomePage.tsx
      ModsPage.tsx
      ModDetailPage.tsx
      GuidePage.tsx
  genshin-impact/
    pages/
      HomePage.tsx
      ModsPage.tsx
      ModDetailPage.tsx
      GuidePage.tsx
  shared/
    DefaultGameHomePage.tsx
    DefaultGameModsPage.tsx
    DefaultGameModDetailPage.tsx
    DefaultGameGuidePage.tsx
```

当前阶段：

```text
所有游戏先使用 shared 默认页面
```

后续拿到设计稿后：

```text
按游戏、按页面逐步替换
```

---

## 当前阶段最小可行版本

### 阶段 1：新增游戏配置

新增：

```text
src/config/games.ts
```

初始支持：

- 鸣潮：`wuthering-waves`
- 绝区零：`zenless-zone-zero`
- 原神：`genshin-impact`

---

### 阶段 2：数据库增加 `game_key`

新增迁移：

```text
supabase/add_game_key_to_mods.sql
```

同步更新：

```text
src/types/supabase.ts
```

---

### 阶段 3：查询层支持 `gameKey`

改造：

```text
src/lib/mods-domain/public.ts
```

必要时同步：

```text
src/lib/mods-domain/admin.ts
```

---

### 阶段 4：新增游戏路由

新增：

```text
src/app/[game]/page.tsx
src/app/[game]/mods/page.tsx
src/app/[game]/mods/[id]/page.tsx
src/app/[game]/guide/page.tsx
```

当前页面可以简陋，但需要功能可用。

---

### 阶段 5：导航栏新增显眼游戏切换入口

在：

```text
src/components/layout/site-header.tsx
```

增加游戏切换器。

推荐位置：

```text
Logo 旁边
```

展示形式：

```text
当前游戏徽章 + 下拉菜单
```

示例：

```text
鸣潮 MOD ▼
```

下拉：

```text
鸣潮
绝区零
原神
```

点击跳转：

```text
/wuthering-waves
/zenless-zone-zero
/genshin-impact
```

---

### 阶段 6：默认 fallback 页面

对没有设计稿的游戏显示：

```text
绝区零 MOD 分站
当前游戏正在搭建中
已复用通用 MOD 功能
```

功能仍可复用：

- MOD 列表
- MOD 详情
- 收藏
- 评论
- 下载

没有数据时显示空状态。

---

## 后续设计稿接入计划

当某个游戏有设计稿后：

1. 新增对应游戏页面组件
2. 在 resolver 中优先使用自定义组件
3. 没有自定义组件的页面继续 fallback 到 shared 页面

示例：

```text
src/features/games/zenless-zone-zero/pages/HomePage.tsx
src/features/games/zenless-zone-zero/pages/ModsPage.tsx
```

---

## 上传页规划

当前阶段上传/编辑表单增加：

```text
game_key
```

形式：

```text
游戏下拉选择
```

默认：

```text
wuthering-waves
```

后续如每个游戏字段差异较大，再拆为：

```text
/admin/upload/wuthering-waves
/admin/upload/zenless-zone-zero
/admin/upload/genshin-impact
```

---

## 收藏页规划

当前阶段保留：

```text
/favorites
```

作为全游戏收藏统一页。

后续可升级为：

```text
/wuthering-waves/favorites
/zenless-zone-zero/favorites
```

---

## 管理后台规划

当前阶段不大改后台，只做：

- 上传页支持 `game_key`
- 编辑页支持 `game_key`
- 管理列表支持游戏筛选

后续可升级为：

```text
/admin/games
/admin/games/[game]/mods
/admin/games/[game]/stats
```

---

## 风险点

### 1. 重复 URL 和 SEO

短期可能同时存在：

```text
/mods/[id]
/wuthering-waves/mods/[id]
```

长期需要：

- canonical
- redirect
- 统一详情页入口

### 2. 不同游戏字段不同

短期共用当前字段。

长期建议增加：

```text
metadata jsonb
```

用于每个游戏自定义字段。

### 3. 设计稿差异过大

如果每个游戏完全不同，应使用页面级分层，而不是只改组件样式。

---

## 推荐实施顺序

### 第一期：游戏切换与功能复用

目标：

```text
导航栏出现游戏切换入口
游戏路由可访问
鸣潮数据正常显示
绝区零/原神显示空状态或搭建中提示
功能不破坏
```

### 第二期：后台支持多游戏

目标：

```text
上传/编辑支持 game_key
管理列表支持游戏筛选
```

### 第三期：独立设计稿接入

目标：

```text
按游戏逐步替换首页、分类页、教程页、排行榜等页面
```

### 第四期：数据统计和运营功能

目标：

```text
游戏下载排行
角色排行
标签热度
收藏统计
后台统计页
```

---

## 第一阶段预期交付物

如开始实施第一期，预计涉及：

```text
src/config/games.ts
supabase/add_game_key_to_mods.sql
src/types/supabase.ts
src/lib/mods-domain/public.ts
src/app/[game]/page.tsx
src/app/[game]/mods/page.tsx
src/app/[game]/mods/[id]/page.tsx
src/app/[game]/guide/page.tsx
src/components/layout/site-header.tsx
```

---

## 当前决策

当前先只完成：

```text
游戏 MOD 界面的切换
功能复用
后续设计稿预留架构
```

暂不进行完整 UI 重做。
