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
| `images` | 预览图上传 | **腾讯云 COS URL** 数组，至少 1 张（上传时自动转 WebP q=85） |
| `xxmi_install_guide` | 固定值 | 项目默认 XXMI 安装说明 |
| `mod_author_url` | JASM config | `.JASM_ModConfig.json` 中的 `modUrl` 字段 |
| `created_by` | `null` | 批量上传无特定上传者 |

## 图片存储架构（2026-07 更新）

### 当前方案：腾讯云 COS（主）+ Supabase Storage（备份）

```
管理员上传图片
  → 客户端 Canvas API 转 WebP (q=85)
  → /api/cos/sign (STS 临时密钥)
  → cos-js-sdk-v5 直传 COS（主存储）
  → Supabase Storage 备份
  → 数据库存储 COS URL

用户浏览
  → next/image + isExternalStorageUrl()
  → COS CDN 域名（国内 <1s 加载）
```

### 存储路径

```
COS:  https://{bucket}.cos.{region}.myqcloud.com/mods/{character}/{modId}/{filename}
Supabase (备份): https://{ref}.supabase.co/storage/v1/object/public/mod-assets/mods/{character}/{modId}/{filename}
```

### 环境变量

```bash
COS_SECRET_ID=     # 腾讯云 API 密钥 SecretId
COS_SECRET_KEY=    # 腾讯云 API 密钥 SecretKey
COS_BUCKET=        # Bucket 名称，如 wave-mod-preview-1327973389
COS_REGION=        # 地域，如 ap-guangzhou
```

### 存量图片迁移

已用 `scripts/migrate-to-cos.mjs` 将 Supabase Storage 上的图片批量迁移到 COS。脚本特性：
- 幂等（已迁移的 COS URL 自动跳过）
- 断点续传（中断后重跑不重复）
- 重试机制（下载失败 3 次指数退避重试）

```bash
# 预览
node scripts/migrate-to-cos.mjs --dry-run

# 按角色迁移
node scripts/migrate-to-cos.mjs --character=爱弥斯

# 全部迁移
node scripts/migrate-to-cos.mjs
```

## 脚本说明

### 1. 批量上传脚本

**文件**: `scripts/batch-upload-aemeath-mods.mjs`

**功能**:
1. 解析百度网盘 + 夸克网盘 CSV，按文件名（去 `.exe`）匹配合并
2. 从文件名解析 title 和 version（去掉角色前缀）
3. 读取 `.JASM_ModConfig.json` 获取 customName 和 authorUrl
4. 上传预览图（Sharp 转 WebP q=80 → 上传到 Supabase Storage）
5. 批量 `INSERT` 到 `mods` 表

**运行**: `node scripts/batch-upload-aemeath-mods.mjs`

**注意事项**:
- 依赖 `.env.local` 中的 `SUPABASE_SERVICE_ROLE_KEY`
- 源文件夹路径硬编码在脚本中，复用需修改 `SOURCE_DIR`
- CSV2 解析用状态机处理多行引号字段，复用需确认 CSV 格式一致
- 预览图上传到 Supabase Storage 后，如需转 COS，运行 `scripts/migrate-to-cos.mjs`

### 2. 图片 WebP 转换

**新上传**：`StorageImageUpload` 组件（管理后台）内置客户端转换：
- PNG/JPEG → Canvas API 转 WebP（**质量 85%**）
- 已有 WebP 和 GIF 跳过转换
- 无需依赖 Sharp 或服务端处理

**存量图片**：`scripts/convert-images-to-webp.mjs`
- 下载原始 PNG → Sharp 转 WebP（750px 宽, 80% 质量）→ 上传
- 注意：此脚本上传到 Supabase Storage，后续需运行 `migrate-to-cos.mjs`

**运行**: `node scripts/convert-images-to-webp.mjs`

### 3. 补充缺失图片脚本

**文件**: `scripts/fix-missing-images.mjs`

用于补传批量上传时遗漏的预览图（如 `preview.png` 不存在但文件夹内有其他 PNG）。

## 图片显示问题排查

### 问题 1: `/_next/image` 返回 400/500

**现象**: 浏览器中外链图片不显示，Network 面板显示 `/_next/image?url=...` 返回错误。

**根因**: Next.js 的 `/_next/image` 代理端点要求 `remotePatterns` 白名单 + `unoptimized` 标记。外部存储 URL（如 COS、Supabase）不应走 Next.js 优化器。

**解决方案**: 使用 `isExternalStorageUrl()` 统一判断：

```tsx
import { isExternalStorageUrl } from "@/lib/storage/shared";

<Image
  src={mod.coverImage}
  unoptimized={isExternalStorageUrl(mod.coverImage ?? "")}
  ...
/>
```

该函数覆盖 Supabase Storage 和 腾讯云 COS 两类外链 URL。

### 问题 2: 图片文件太大加载慢

**解决方案**: 上传时自动转 WebP（质量 85%）。效果：PNG 2-3MB → WebP 40-200KB（减小 90-97%）。

### 问题 3: 直接写数据库后页面不显示新 Mod

**根因**: `getPublicMods()` 使用 Next.js `"use cache"` + `cacheLife("minutes")`。直接通过 Supabase admin client 写入绕过了 Server Action 的 `revalidatePublicModCaches()` 调用。

**解决方案**: 重启 Next.js dev server，或等待缓存过期（几分钟）。

### 问题 4: COS 图片国内加载慢

**现象**: 之前使用 Supabase Storage（海外服务器），国内用户图片加载 >3s。

**解决方案**: 已迁移到腾讯云 COS（国内 CDN 节点），加载时间 <1s。详见 PRD: `docs/migrate-to-tencent-cos-prd.md`

## 工具函数

### COS / Supabase URL 工具

**文件**: `src/lib/cos/shared.ts` + `src/lib/storage/shared.ts`

```typescript
// 判断是否是腾讯云 COS 公开 URL
export function isCosStorageUrl(url: string): boolean;

// 判断是否是 Supabase Storage 公开 URL
export function isSupabaseStorageUrl(url: string): boolean;

// 统一判断外部存储 URL（COS + Supabase），用于 next/image unoptimized
export function isExternalStorageUrl(url: string): boolean;
```

## 预览图 WebP 转换规则

### 管理后台上传（StorageImageUpload 组件）

- **方式**: 客户端 Canvas API，上传前实时转换
- **格式**: WebP
- **质量**: 85%（肉眼与 PNG 无差别）
- **跳过**: 已有 WebP、GIF 动图保持原样
- **降级**: 转换失败时自动降级为原图上传

### 批量上传脚本

- **方式**: Sharp（服务端转换）
- **宽度**: 750px（保留比例，不放大）
- **格式**: WebP
- **质量**: 80%
- **效果**: PNG 2-3MB → WebP 40-70KB (减小 97-99%)

## 批量上传检查清单

使用批量上传脚本前，确认以下事项：

- [ ] 源文件夹包含两个 CSV 文件（百度网盘 + 夸克网盘）
- [ ] CSV 文件名与 .exe 文件名一一对应（去掉 .exe 后匹配）
- [ ] 每个 .exe 有匹配的预览图（同名的 `.jpg` 或 `.png`）
- [ ] `.env.local` 中 `SUPABASE_SERVICE_ROLE_KEY` 已配置
- [ ] `.env.local` 中 COS 相关环境变量已配置（`COS_SECRET_ID` 等）
- [ ] 确认角色配置（`name`、`storage_key`(ASCII)、`game_key`、`subdirs`）
- [ ] 上传后重启 dev server 或等待缓存过期（`"use cache"` + `cacheLife`）
- [ ] 上传到 Supabase 后如需 CDN 加速，运行 `node scripts/migrate-to-cos.mjs`
