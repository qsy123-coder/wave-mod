# 新拟物派 设计规范

style_slug: neumorphism

## 什么时候用
- 实现前需要统一团队或 AI 对这个风格的理解时使用。
- 把任务交给 AI 前，用它确定颜色、布局、组件、动效和可访问性的边界。
- 审核结果时，用它判断生成界面是否仍然属于这个风格。

## 怎么用
- 先读"概览"和"视觉系统"，理解这个风格的识别点。
- 把"布局规则"和"组件规则"当作实现边界。
- 交付前按"交付检查"逐条自检。

## 概览
柔和的内凹外凸立体效果，通过双重阴影模拟光源，浅色背景配同色系元素，营造精致的立体感。

## 设计意图
Neumorphism（新拟物派）是一种介于扁平设计和拟物设计之间的风格，通过柔和的阴影创造出元素从背景中"挤压"或"凹陷"的视觉效果。

## 视觉系统
- Primary: #e0e5ec
- Secondary: #d1d9e6
- Accents: #6d5dfc, #ff6b6b, #4ecdc4, #ffe66d
- Signature cues: 立体感、双重阴影、柔和、浅色系、内凹外凸、modern、contemporary、sleek

## 布局规则
- 区块节奏：`py-12 md:py-20`
- 容器内边距：`px-6 md:px-8`
- 卡片内边距：`p-6 md:p-8`
- 默认间距：`gap-4 md:gap-6`
- 圆角：`rounded-xl`

## 组件规则
- 使用浅色背景 bg-[#e0e5ec] 或 bg-[#f0f0f3]
- 使用双重阴影 shadow-[8px_8px_16px_#b8bcc2,-8px_-8px_16px_#ffffff]
- 凹陷效果使用 inset 阴影 shadow-[inset_8px_8px_16px_#b8bcc2,inset_-8px_-8px_16px_#ffffff]
- 使用中等圆角 rounded-xl (12-24px)
- 交互元素按下时从凸起变凹陷
- 保持元素与背景同色系
- 响应式阴影大小 md: 前缀增大
- 按钮 hover 时减小外阴影（Hover Shadowing，手指靠近遮光效果）：从 shadow-[8px_8px_16px...] 减至 shadow-[4px_4px_8px...]

## 交互与动效
- 过渡：`transition-all duration-200`
- 悬停：`hover:scale-[0.98]`
- 按下：`active:shadow-[inset_4px_4px_8px_#b8bcc2,inset_-4px_-4px_8px_#ffffff]`
- 聚焦：`focus:shadow-[6px_6px_12px_#b8bcc2,-6px_-6px_12px_#ffffff]`
- 动效不得引发布局位移或抢走焦点。

## 可访问性
- 文字对比度保持 WCAG AA 或更高。
- 每个可交互元素都必须保留清晰键盘焦点。
- 移动端触控目标不低于 44px，并尊重 reduced-motion。

## 禁止项
- 禁止使用纯黑或纯白背景
- 禁止使用高对比度配色
- 禁止使用粗边框 border-2 及以上
- 禁止使用渐变背景 bg-gradient-*
- 禁止直角 rounded-none
- 禁止按钮使用任何 translate 位移（新拟物元素是长在背景上的，不可浮起）
- 禁止 hover 时增大阴影（与光影物理规律相悖，手指靠近应使阴影缩小）
- 禁止打破光源方向（亮阴影必须在左上 -X/-Y，暗阴影必须在右下 +X/+Y）

## 交付检查
- 替换示例内容后，页面仍应一眼识别为 新拟物派。
- 按钮、卡片、输入、空状态、错误、加载状态应共享同一套视觉语言。
- 上面"禁止项"里的任何一条都没有被通用组件库的默认样式带进来。