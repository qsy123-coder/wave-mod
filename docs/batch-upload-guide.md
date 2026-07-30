# 批量上传 Mod 操作指南

## 概述

本文档记录了如何从本地文件夹批量上传 Mod 到 WaveMod 数据库，包括解析网盘分享 CSV、上传预览图片、以及图片优化。

## 数据源结构

### 文件夹布局

```
批量上传文件夹/
├── 批量分享记录_YYYYMMDDHHMM.csv    # 百度网盘分享记录
├── 分享结果导出-{timestamp}.csv     # 夸克网盘分享记录
├── {mod名称1}.exe                   # Mod 安装包
├── {mod名称1}/                      # Mod 解压目录
│   ├── preview.png                  # 预览图（可能有别名如 "{mod名称}.png"）
│   ├── mod.ini                      # WWMI 配置
│   ├── .JASM_ModConfig.json         # JASM 元数据（部分有）
│   ├── mod主站网址.url               # 作者主页
│   └── Meshes/, Textures/, ...      # Mod 资源文件
├── {mod名称2}.exe
├── {mod名称2}/
...
```

### CSV 格式

**百度网盘 CSV** (`批量分享记录_*.csv`)：
```csv
文件名,链接,提取码,分享时间,分享状态
爱弥斯-白银之城-灰姑娘v1.1.exe,https://pan.baidu.com/s/xxxx?pwd=ykri,ykri,2026-07-18 17:01,生成成功
```

**夸克网盘 CSV** (`分享结果导出-*.csv`)：
- 含多行引号字段，每条记录 3 行（状态+分享名 / 链接 / 提取码）
- 用状态机解析，不能简单的按行 split
```csv
成功,爱弥斯-白银之城-灰姑娘v1.1.exe,"我用夸克网盘给你分享了...
链接：https://pan.quark.cn/s/xxxx?pwd=JYKF
提取码：JYKF",JYKF,2026-07-18 16:59
```

## 数据库字段映射

目标表：`public.mods`

| DB 字段 | 来源 | 规则 |
|---|---|---|
| `id` | UUID 自动生成 | `crypto.randomUUID()` |
| `title` | 文件名 | 去掉角色前缀（如"爱弥斯-"）+ `.exe` 后缀；英文名优先用 `.JASM_ModConfig.json` 的 `customName` |
| `character` | 手动指定 | 统一标准化（如"爱弥斯"统一"爱弥丝"/"Aemeath"） |
| `game_key` | 手动指定 | `"wuthering-waves"` / `"zenless-zone-zero"` / `"genshin-impact"` |
| `game_version` | 固定值 | `"未标注"` |
| `version` | 文件名 | 正则提取 `v\d+[\d.]*`，无则 `"未标注"` |
| `description` | 自动生成 | `"{角色名} {title} MOD，提供百度网盘与夸克网盘双渠道下载。"` |
| `download_url` | 可选 | `null`（无直链时） |
| `drive_links` | 两个 CSV 合并 | `[{platform:"百度网盘", url:"..."}, {platform:"夸克网盘", url:"..."}]` |
| `nsfw` | 手动指定 | `true` / `false` |
| `is_published` | 手动指定 | `true` / `false` |
| `is_available` | 固定值 | `true` |
| `images` | 预览图上传 | Supabase Storage URL 数组，至少 1 张 |
| `xxmi_install_guide` | 固定值 | 项目默认 XXMI 安装说明 |
| `mod_author_url` | JASM config | `.JASM_ModConfig.json` 中的 `modUrl` 字段 |
| `created_by` | `null` | 批量上传无特定上传者 |

## 脚本说明

### 1. 批量上传脚本

**文件**: `scripts/batch-upload-aemeath-mods.mjs`

**功能**:
1. 解析百度网盘 + 夸克网盘 CSV，按文件名（去 `.exe`）匹配合并
2. 从文件名解析 title 和 version（去掉角色前缀）
3. 读取 `.JASM_ModConfig.json` 获取 customName 和 authorUrl
4. 上传 `preview.png` 到 Supabase Storage (`mod-assets` bucket)
5. 批量 `INSERT` 到 `mods` 表

**运行**: `node scripts/batch-upload-aemeath-mods.mjs`

**注意事项**:
- 依赖 `.env.local` 中的 `SUPABASE_SERVICE_ROLE_KEY`
- 源文件夹路径硬编码在脚本中，复用需修改 `SOURCE_DIR`
- CSV2 解析用状态机处理多行引号字段，复用需确认 CSV 格式一致
- `preview.png` 可能不存在（部分 mod 用命名 PNG 如 `{mod名称}.png`），需要后续补传

### 2. 图片 WebP 转换脚本

**文件**: `scripts/convert-images-to-webp.mjs`

**功能**:
1. 查询指定 character 的所有 mod
2. 下载原始 PNG → Sharp 转 WebP（750px 宽, 80% 质量）→ 上传到 Supabase Storage
3. 更新数据库 `images` 字段

**运行**: `node scripts/convert-images-to-webp.mjs`

**效果**: PNG 2-3MB → WebP 40-70KB (减小 97-99%)

### 3. 补充缺失图片脚本

**文件**: `scripts/fix-missing-images.mjs`

用于补传批量上传时遗漏的预览图（如 `preview.png` 不存在但文件夹内有其他 PNG）。

## 图片显示问题排查

### 问题 1: `/_next/image` 返回 500

**现象**: 浏览器中 Supabase Storage 图片不显示，Network 面板显示 `/_next/image?url=...` 返回 500。

**根因**: Next.js 的 `/_next/image` 代理端点无法正确代理 Supabase Storage URL（开发模式下 7 秒超时返回 500）。

**解决方案**: 在所有使用 `next/image` 渲染 mod 封面图的组件中，对 Supabase 图片添加 `unoptimized` 属性：

```tsx
<Image
  src={mod.coverImage}
  unoptimized={mod.coverImage?.includes("supabase.co")}
  ...
/>
```

**已修复的组件**（共 14 个）:
- `src/components/common/mod-card.tsx`
- `src/components/features/home/hero-carousel.tsx`
- `src/features/games/wuthering-waves/components/home/wuwa-hero-carousel.tsx`
- `src/features/games/wuthering-waves/components/home/wuwa-featured-mods-rail.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-mods-card.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-hero-carousel-client.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-lower-home.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-mod-detail-parts.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-comments-section.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-ranking-sidebar-right.tsx`
- `src/features/games/zenless-zone-zero/components/zenless-ranking-leaderboard.tsx`
- `src/app/[game]/profile/profile-content.tsx`
- `src/app/[game]/profile/profile-right-rail.tsx`
- `src/app/[game]/profile/profile-mod-mini-card.tsx`

### 问题 2: 图片文件太大加载慢

**解决方案**: 用 Sharp 将 PNG 转为 WebP。Supabase 的 `render/image` 转换 API 是付费功能（`FeatureNotEnabled`），需用本地脚本处理。

### 问题 3: 直接写数据库后页面不显示新 Mod

**根因**: `getPublicMods()` 使用 Next.js `"use cache"` + `cacheLife("minutes")`。直接通过 Supabase admin client 写入绕过了 Server Action 的 `revalidatePublicModCaches()` 调用。

**解决方案**: 重启 Next.js dev server，或等待缓存过期（几分钟）。

## 工具函数

### Supabase Storage URL 工具

**文件**: `src/lib/storage/shared.ts`

```typescript
// 判断是否是 Supabase Storage 的公开 object URL
export function isSupabaseStorageUrl(url: string): boolean;

// 将公开 object URL 转换为 render/image 转换 URL（需开通付费功能）
export function toSupabaseRenderUrl(url: string, options?: { width?: number; quality?: number }): string;
```

## 预览图 WebP 转换规则（强制）

**批量上传脚本已内置 WebP 自动转换**，无需再单独运行转换脚本。转换参数：

- **宽度**: 750px（保留比例，不放大）
- **格式**: WebP
- **质量**: 80%
- **效果**: PNG 2-3MB → WebP 40-70KB (减小 97-99%)；JPG 也可减小 70-90%

脚本 `scripts/batch-upload-multi-char.mjs` 在 `uploadPreviewImage()` 中使用 Sharp 将原始图片（.jpg/.png）统一转为 `.webp` 后上传到 Supabase Storage，不依赖 Supabase 付费 render/image API。

### 存量图片转换

对于已上传的 PNG/JPG 图片，可用独立脚本转换：

**文件**: `scripts/convert-images-to-webp.mjs`

**用法**: `node scripts/convert-images-to-webp.mjs`

## 批量上传检查清单

使用批量上传脚本前，确认以下事项：

- [ ] 源文件夹包含两个 CSV 文件（百度网盘 + 夸克网盘）
- [ ] CSV 文件名与 .exe 文件名一一对应（去掉 .exe 后匹配）
- [ ] 每个 .exe 有匹配的预览图（同名的 `.jpg` 或 `.png`）
- [ ] `.env.local` 中 `SUPABASE_SERVICE_ROLE_KEY` 已配置
- [ ] 确认角色配置（`name`、`storage_key`(ASCII)、`game_key`、`subdirs`）
- [ ] 上传后重启 dev server 或等待缓存过期（`"use cache"` + `cacheLife`）
