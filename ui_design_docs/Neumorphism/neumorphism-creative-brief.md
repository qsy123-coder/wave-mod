STYLEKIT_STYLE_REFERENCE
style_name: 新拟物派
style_slug: neumorphism
style_source: /styles/neumorphism

# Creative Brief

## 什么时候用
当你希望 AI 做方向探索、方案发散时使用。它保留核心风格识别度，但允许实现更灵活。

## 怎么用
- 还在探索方向时，把它复制到 AI 工具里。
- 补充页面类型、目标用户和参考约束。
- 先让 AI 给 2-3 个方向，确定方向后再用硬性提示词落地。

保持整体风格气质即可，允许实现细节灵活调整，但不要偏离核心视觉语言。

## Style Signals

- 立体感
- 双重阴影
- 柔和
- 浅色系
- 内凹外凸
- modern

## Prefer

- 使用浅色背景 bg-[#e0e5ec] 或 bg-[#f0f0f3]
- 使用双重阴影 shadow-[8px_8px_16px_#b8bcc2,-8px_-8px_16px_#ffffff]
- 凹陷效果使用 inset 阴影 shadow-[inset_8px_8px_16px_#b8bcc2,inset_-8px_-8px_16px_#ffffff]
- 使用中等圆角 rounded-xl (12-24px)

## Avoid

- 禁止使用纯黑或纯白背景
- 禁止使用高对比度配色
- 禁止使用粗边框 border-2 及以上
- 禁止使用渐变背景 bg-gradient-*
- 禁止直角 rounded-none
- 禁止按钮使用任何 translate 位移（新拟物元素是长在背景上的，不可浮起）

## Output Guidance

- 先保证整体风格识别度，再优化细节。
- 避免过度炫技，保持可读性与可维护性。