# CLAUDE.md - 项目上下文与工程规范

## 项目概述

- **项目名称**：WaveMod
- **目标**：构建一个高性能、可维护、可扩展的现代化全栈应用

## 技术栈

- **前端**：Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **后端**：Next.js API Routes / tRPC + Prisma
- **数据库**：PostgreSQL + Prisma ORM
- **认证**：NextAuth.js v5 (Auth.js)
- **状态管理**：Zustand + TanStack Query
- **部署**：Vercel (前端+Serverless) / Docker
- **其他**：Zod, React Hook Form, ESLint + Prettier + Husky

## 架构原则 (必须严格遵守)

1. **Clean Architecture + Feature-Sliced Design**
   - 按功能/领域（features/）而不是按技术类型组织代码
2. **Server-First**：能用 Server Component / Server Action 就不要用 Client Component
3. **类型安全第一**：所有外部输入必须经过 Zod 校验
4. **保持简单**：避免过度抽象，优先使用现有框架能力
5. **单一职责**：一个文件只做一件事

## 目录结构 (重要)

src/
├── app/ # Next.js App Router
├── features/ # 核心业务功能（按领域组织）
├── entities/ # 业务实体（User, Order 等）
├── shared/ # 通用组件、工具、UI
├── widgets/ # 复杂组合组件
├── lib/ # 工具库、prisma、auth 等
└── types/ # 全局类型定义

## 编码规范

- **TypeScript**：严格模式，`strict: true`，避免 `any`
- **命名**：组件用 PascalCase，函数/变量用 camelCase，文件用 kebab-case
- **组件**：Server Component 优先，Client Component 必须加 `'use client'`
- **样式**：只允许 Tailwind + shadcn/ui，不允许全局 CSS
- **API**：使用 tRPC 或 Server Actions，禁止直接暴露数据库查询
- **错误处理**：统一使用 `try/catch + ZodError` 处理，错误信息不能暴露敏感信息

## 测试策略

- 单元测试：Vitest + React Testing Library（重点测试 utils 和 hooks）
- 组件测试：重点覆盖复杂 widgets
- E2E：Playwright（关键用户流程）
- **TDD 优先**：新功能必须先写测试

## Git 提交规范

使用 Conventional Commits：

- `feat:` 新功能
- `fix:` Bug 修复
- `refactor:` 重构
- `chore:` 构建/依赖/配置
- `docs:` 文档

## Claude 工作要求（核心）

1. **先理解再行动**：任何修改前必须先梳理受影响模块
2. **逐步推进**：一次只做一个功能/重构，不要大范围改动
3. **输出格式**：
   - 先给出**变更计划**（受影响文件列表）
   - 再给出**具体代码 diff**
   - 最后给出**自检清单**（是否符合规范、类型安全、测试覆盖）
4. **永远不要**：
   - 随意删除已有代码
   - 引入未在项目中使用的库
   - 忽略现有架构原则
   - 生成不带注释的复杂逻辑
   - **未经用户明确允许，新建角色分类（character 值）**：站内角色分类由 `src/lib/mods-domain/public.ts` 的 `getAvailableCharacters` 从数据库 distinct `character` 动态生成——新增任何一个 character 值，前台角色分类页就会自动冒出新的分类。因此：
     - 上传/写入任何 mod 前，`character` 必须归一化到站内已有的标准角色清单（`src/lib/constants/character-images.ts` 的 `characterImageMap`），不得直接采用文件名里带修饰的词（如 `千咲皮肤[蜜桃冰]` → `千咲`）。
     - 标准角色名与别名映射见 `src/lib/mods-domain/sorting.ts` 的 `normalizeCharacterName`（`CHARACTER_ALIASES`）。新增映射必须先查库里/`characterImageMap` 是否已有该角色，**绝不能凭空新建**。
     - 已有标准归类示例：`科考摩托` → `滑翔翼,翱翔翼,科考摩托`；`千咲皮肤[XX]` → `千咲`；`反虚化，ui界面，场景，葫芦，特效等` → `UI`。
     - 若某 mod 的标题无法确定对应哪个已有角色，先列出候选并询问用户，确认后才写入。

## 每日 Mod 上传流程（必须遵守）

### 硬规则：文件夹里出现的每一种网盘都要传

用户 2026-09-22 明确要求：**每天把日期文件夹里出现的每一种网盘都上传，不是只传夸克。**
2026-09-22 那天只传了夸克、迅雷整批漏掉，用户是在前台发现卡片上没有迅雷按钮才知道的
—— 漏网盘**完全静默**：入库不报错、快照也照常发。

### 数据源

```
D:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新\W-YYYY.M.D\
  ├─ 分享结果导出-*.csv     → 夸克网盘（主盘，恒有）
  ├─ 分享结果导出-*.xlsx    → 迅雷网盘
  ├─ *.exe                  → mod 本体
  └─ *.jpeg/.png/.jpg       → 预览图（顶层或「预览图」子目录）
```

**开工前先 `ls` 一遍日期目录**，确认没有第三种导出文件被漏掉。

### 一条命令

```bash
node scripts/upload-daily-by-date.mjs --dry-run --dates=2026.9.22   # 先看，不上传
node scripts/upload-daily-by-date.mjs --dates=2026.9.22             # 正式上传
node scripts/upload-daily-by-date.mjs                               # 全部日期目录
```

脚本会自己读同日目录里的 CSV + xlsx，**按 exe 文件名直接 join**，把当天所有网盘
一起写进 `drive_links`，不需要再单独跑迅雷脚本。xlsx 解析调
`scripts/parse-daily-xunlei-xlsx.ps1`（项目没有声明 zip 依赖，别在 Node 里自己解）。

### 必看的验收输出

```
=== 网盘覆盖 ===
   2026-9-22  夸克 8 / 迅雷 8（导出 8）
```

**逐日 `夸克 == 迅雷 == 导出`** 才算干净。任何 `⚠️` 都要当场查清：
「该目录无迅雷导出」= 可能忘了导出；「有 N 条迅雷导出未匹配上」= 文件名对不上。

同时注意「⚠️ 以下 N 条库内已存在，本次拿到的迅雷链接未写入」——那说明这些记录
**早就入库了**，本次不会写链接，要另跑 `scripts/apply-daily-xunlei-by-date.mjs`
（默认 dry-run，加 `--apply` 写库）。

### 上传后

**只要有新记录入库**，脚本自动发兜底快照到 COS + ping `/api/revalidate`，不用手动做
（全部被去重跳过时不会发 —— 那是对的，缓存里本来就没变化）。
验证用 `https://www.wave-mod.top/api/updates` 查对应日期分组的 `driveLinks`。
（终端里中文显示乱码是控制台代码页问题，不是数据坏了。）

### ⚠️ 事后改 `character` 会让去重失效

去重键是 `character|title`。**事后把某批 mod 迁移到新分类，日期目录里的 key 没变，
脚本会重新解析出旧的 character ⇒ 全量跑时把它们当新增再插一遍，且不报错。**

已经踩过两次（2026-09-21「大卡 → 芙露德莉斯」）。所以：

- 任何「把某角色某批 mod 改到新分类」的操作，**先想每日脚本的去重键会不会变**；
  变了就在 `upload-daily-by-date.mjs` 的 `resolveCharacterAndTitle` 加对应分支，
  规则写进 `scripts/daka-classify.mjs` 那样的纯模块并补单测。
- 改完**必须**验证：`node scripts/upload-daily-by-date.mjs --dry-run`（**不带 `--dates`**），
  「待上传」必须是 **0**。非 0 就是去重键错位了。

## MCP 服务

### 必须参考的文档

"C:\Users\qsy123\Desktop\WaveMod\docs\Coding-Standards.md"
"C:\Users\qsy123\Desktop\WaveMod\docs\AI-Interaction-Guidelines.md"

### Context7 (实时文档)

- **状态**：✔ Connected (`https://mcp.context7.com/mcp`)
- **功能**：拉取最新版本库文档和代码示例，避免过时 API
- **工具**：`resolve-library-id`（库名→ID）、`get-library-docs`（获取文档）
- **使用**：遇到任何第三方库的 API 用法、配置、示例时自动调用 Context7 查文档

---

## 可用技能 (Skills)

以下技能已安装在项目中，遇到相关场景时必须通过 `/skill-name` 调用：

### 🗄️ 数据库

- **`/prisma-postgres`** — Prisma Postgres 设置与运维（Console、CLI、API、SDK）。**触发场景**：创建 Prisma Postgres 数据库、配置连接、数据建模。
- **`/prisma-database-setup`** — Prisma 多数据库配置指南（PostgreSQL/MySQL/SQLite/MongoDB）。**触发场景**：搭建新项目、切换数据库、排查连接问题。
- **`/supabase-postgres-best-practices`** — PostgreSQL 性能优化和最佳实践。**触发场景**：优化查询、设计表结构、创建索引、调试慢查询。

### ⚛️ 前端

- **`/next-best-practices`** — Next.js 最佳实践全集。**触发场景**：创建路由/页面、Server/Client Component 边界、数据获取、metadata/SEO、错误处理、图片/字体优化、打包配置。
  
  <!-- - **`/ui-ux-pro-max`** — UI/UX 设计与交互最佳实践。**触发场景**：设计页面/组件、优化交互流程、解决 UX 问题、提升可访问性。 -->

### 🧪 质量保证

- **`/tdd`** — 测试驱动开发（Red-Green-Refactor）。**触发场景**：新增功能、修复 Bug、重构——先写测试再写代码。
- **`/code-review`** — Diff 级别代码审查。**触发场景**：提交前审查变更、检查 correctness 和代码质量。
- **`/verify`** — 验证代码变更是否生效。**触发场景**：改完代码后确认功能真的能用。
- **`/security-review`** — 安全审查。**触发场景**：涉及认证/授权/支付等敏感逻辑时。

### 📋 产品

- **`/product-requirements`** — 交互式需求分析 + PRD 生成。**触发场景**：新功能需求不清晰、需要输出专业 PRD 文档。

---

## 常用命令

```bash
npm run dev          # 启动开发
npm run build        # 构建检查
npm run lint         # 代码检查
npm run test         # 测试
npm run db:push      # Prisma 同步
```

## 质量检查策略（重要）

- **提交前**：必须执行完整质量门禁（`npm run lint` + `npx tsc --noEmit` + `npm run build`）
- **每次任务结束后**：只做必要检查——确认 `npm run build` 通过即可（保证网站能打开）。不要每次都跑 lint 和 tsc，浪费时间
- **开发过程中**：改了代码后跑一次 `npm run build` 验证编译通过即可，不要每改一个文件就跑全量检查

## 提交前质量门禁（强制）

**每次提交/合并到 main 前必须执行以下检查，CI 必须绿：**

1. **Lint 检查**: `npm run lint` — 零 error（warnings 可接受但不鼓励增加）
2. **类型检查**: `npx tsc --noEmit` — 零错误
3. **构建检查**: `npm run build` — 必须成功
4. **CI 验证**: push 后等待 GitHub Actions `Quality Checks` workflow 通过

**工作流**:

```
代码 → Lint → TypeCheck → 自检清单 → Commit → Push → 等待 CI 绿 → 合并 main
```

**Claude 执行规范**:

- 每次 commit 前必须执行 `npm run lint` + `npx tsc --noEmit`，有 error 必须修复
- 如果 lint error 来自**未修改**的文件，视为已有问题，必须一并修复
- **commit / merge / push 前必须先征得用户同意**，不得自行决定提交、合并或推送
- 用户同意后，push 需等待 CI 完成，确认 success 后才能告知用户"完成"
- CI 失败时必须查看日志、修复、重新 push，直到通过
