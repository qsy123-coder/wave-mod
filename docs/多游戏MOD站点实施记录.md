# 多游戏 MOD 站点实施记录

本文档用于记录“多游戏 MOD 站点重构”过程中每个重要功能、阶段和关键决策的完成情况。

对应计划文档：

```text
docs/多游戏MOD站点重构计划.md
```

---

## 记录规范

每完成一个重要功能或阶段，追加一条记录，建议格式：

```text
## YYYY-MM-DD 阶段名称

### 完成内容

- ...

### 涉及文件

- ...

### 数据库变更

- ...

### 验证结果

- ...

### 遗留问题

- ...
```

---

## 2026-05-27 计划文档落地

### 完成内容

- 已将多游戏 MOD 站点重构方案写入计划文档。
- 已建立本实施记录文档，用于后续记录每个重要功能或阶段的完成情况。

### 涉及文件

- `docs/多游戏MOD站点重构计划.md`
- `docs/多游戏MOD站点实施记录.md`

### 数据库变更

- 暂无。

### 验证结果

- 文档已创建。

### 遗留问题

- 尚未开始代码实现。
- 后续第一阶段需要完成游戏配置、游戏路由、导航栏切换入口、查询层 `gameKey` 支持和数据库 `game_key` 字段规划。

---

## 2026-05-27 第一阶段：游戏切换壳与功能复用

### 完成内容

- 新增游戏配置中心，初始支持鸣潮、绝区零、原神。
- 新增动态游戏路由：
  - `/[game]`
  - `/[game]/mods`
  - `/[game]/mods/[id]`
  - `/[game]/guide`
- 新增通用 fallback 游戏页面：
  - 默认游戏首页
  - 默认游戏 MOD 列表页
  - 默认游戏教程页
- MOD 查询层支持 `gameKey` 过滤。
- MOD API 支持 `gameKey` 查询参数。
- 无限滚动 MOD 列表支持按游戏加载，并在游戏路由下跳转到游戏详情页。
- 导航栏新增显眼的“游戏切换”入口，移动端菜单也加入游戏切换区。
- Supabase 类型补充 `mods.game_key` 字段。
- 新增数据库迁移 SQL，为 `mods` 表增加 `game_key` 字段和索引。

### 涉及文件

- `src/config/games.ts`
- `src/features/games/shared/default-game-home-page.tsx`
- `src/features/games/shared/default-game-mods-page.tsx`
- `src/features/games/shared/default-game-guide-page.tsx`
- `src/app/[game]/page.tsx`
- `src/app/[game]/mods/page.tsx`
- `src/app/[game]/mods/[id]/page.tsx`
- `src/app/[game]/guide/page.tsx`
- `src/components/layout/site-header-client.tsx`
- `src/components/features/mods/list/mods-infinite-grid.tsx`
- `src/app/api/mods/route.ts`
- `src/lib/mods-domain/public.ts`
- `src/lib/mods-domain/mappers.ts`
- `src/lib/mods-domain/types.ts`
- `src/types/supabase.ts`
- `supabase/add_game_key_to_mods.sql`

### 数据库变更

新增迁移：

```sql
alter table public.mods
  add column if not exists game_key text not null default 'wuthering-waves';

create index if not exists mods_game_key_idx
  on public.mods (game_key);

update public.mods
set game_key = 'wuthering-waves'
where game_key is null;
```

### 验证结果

- 已对本次新增和修改的核心文件读取诊断，未发现 linter errors。
- 尚未完成整项目 `npm run lint`，因为终端状态读取过程被中断。

### 遗留问题

- 需要在 Supabase SQL Editor 执行 `supabase/add_game_key_to_mods.sql`。
- 后台上传/编辑页尚未加入游戏选择下拉。
- 旧路由 `/mods/[id]` 仍然保留，后续需要处理 canonical 或重定向策略。
- 当前绝区零、原神暂无数据，页面会显示空状态。
- 后续接入设计稿后，需要按游戏逐步替换 fallback 页面。

---

## 2026-05-27 第二阶段：后台上传和管理支持多游戏

### 完成内容

- 后台 MOD 表单增加“所属游戏”下拉选择。
- 上传表单默认游戏为 `wuthering-waves`。
- 编辑表单可回填已有 MOD 的 `gameKey`。
- 创建 MOD 时写入 `mods.game_key`。
- 编辑 MOD 时同步更新 `mods.game_key`。
- 编辑页查询补充 `game_key` 字段。
- 后台 MOD 管理列表展示游戏归属徽章。
- 创建和编辑后补充对应游戏首页、游戏列表页和游戏详情页的 revalidate。

### 涉及文件

- `src/lib/admin/mod-form.ts`
- `src/constants/upload-defaults.ts`
- `src/components/features/admin/upload/upload-form.tsx`
- `src/actions/admin/upload-actions.ts`
- `src/actions/admin/edit-mod-actions.ts`
- `src/app/admin/mods/page.tsx`

### 数据库变更

- 本阶段无新增数据库迁移。
- 依赖第一阶段的 `mods.game_key` 字段。

### 验证结果

- 已对本阶段修改文件读取诊断，未发现 linter errors。

### 遗留问题

- 仍需先在 Supabase 执行 `supabase/add_game_key_to_mods.sql`，否则后台写入 `game_key` 会失败。
- 后台管理列表目前只展示游戏归属，尚未提供游戏筛选功能。
- 绝区零、原神的角色建议仍会 fallback 到默认角色建议，后续可按游戏维护角色数据源。
