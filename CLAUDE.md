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
