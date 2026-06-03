# 编码规范

## TypeScript

- 启用严格模式
- 禁止使用 `any` 类型 —— 采用合适的类型定义或 `unknown` 类型
- 为所有属性、接口响应和数据模型定义接口
- 显而易见的场景使用类型推断，需要明确的场景显式声明类型

## React

- 仅使用函数组件（不使用类组件）
- 使用 Hooks 管理状态和副作用
- 组件职责单一 —— 一个组件只完成一项功能
- 将可复用逻辑抽离为自定义 Hooks

## Next.js

- 默认使用服务端组件
- 仅在必要时使用 `'use client'`（交互逻辑、Hooks、浏览器 API）
- 表单提交和简单数据变更使用服务端动作
- 以下场景使用 API 路由：
  - 网络钩子（Stripe、GitHub 等）
  - 带进度追踪的文件上传
  - 长时间运行的操作
  - 需要指定 HTTP 状态码或响应头
  - 为未来移动端/命令行客户端提供接口
  - 第三方集成
- 除此之外，直接在服务端组件中获取数据
- 详情/集合页面使用动态路由

## Tailwind CSS v4

**重要**：项目使用 Tailwind CSS v4，采用基于 CSS 的配置方式。

- **禁止**创建 `tailwind.config.ts` 或 `tailwind.config.js` 文件（此类文件适用于 v3）
- 所有主题配置必须在 `src/app/globals.css` 中通过 `@theme` 指令以 CSS 形式编写
- 使用 CSS 自定义属性定义颜色、间距等样式变量
- 禁止使用基于 JavaScript 的配置

v4 配置示例：

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(50% 0.2 250);
}
```

## 文件结构

- 组件：`src/components/[功能模块]/组件名.tsx`
- 页面：`src/app/[路由]/page.tsx`
- 服务端动作：`src/actions/[功能模块].ts`
- 类型定义：`src/types/[功能模块].ts`
- 工具函数：`src/lib/[工具名].ts`

## 命名规范

- 组件：大驼峰式（`ItemCard.tsx`）
- 文件：与组件名一致，或使用短横线连接式
- 函数：小驼峰式
- 常量：全大写+下划线分隔
- 类型/接口：大驼峰式（无前缀）

## 样式规范

- 全部使用 Tailwind CSS 编写样式
- 合适场景使用 shadcn/ui 组件
- 禁止使用行内样式
- 优先适配深色模式，浅色模式作为可选方案

## 数据库

- 所有数据库操作使用 Prisma ORM
- 数据表结构变更必须使用 `prisma migrate dev`（禁止使用 `db push`）
- 提交代码前执行 `prisma migrate status`，确认迁移文件同步
- 生产环境部署必须在应用启动前执行 `prisma migrate deploy`

## 数据获取

- 服务端组件直接通过 Prisma 获取数据
- 客户端组件使用服务端动作
- 所有入参使用 Zod 进行校验

## 错误处理

- 服务端动作中使用 try/catch 捕获异常
- 动作统一返回 `{ success, data, error }` 格式数据
- 通过轻提示展示用户友好的错误信息

## 代码质量

- 无特殊说明禁止保留注释代码
- 清理未使用的导入和变量
- 函数代码尽量控制在 50 行以内
