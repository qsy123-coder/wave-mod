# 第三方许可与来源说明

本目录下的抽卡统计逻辑（卡池映射、垫抽、50/50、UP 周期、成本档案、软保底模型）
移植自开源项目：

- **项目**：wuwa-gacha-tool
- **作者**：Juliy（GitHub: [juliy819](https://github.com/juliy819)）
- **仓库**：https://github.com/juliy819/wuwa-gacha-tool
- **许可**：Apache License 2.0（https://www.apache.org/licenses/LICENSE-2.0）

移植涉及的原文件：

- `src-tauri/src/gacha/fetcher.rs` —— 13 类卡池、硬保底、国服/国际服接口
- `src-tauri/src/gacha/parser.rs` —— 五星区间、歪、50/50、UP 周期
- `src/pages/AnalyticsPage.tsx` —— 分段软保底模型与理论期望

修改说明：原实现为 Rust + Tauri 桌面应用，本仓库改写为纯 TypeScript 模块并适配
`wave-mod` 的站内页面结构；算法口径保持一致，I/O、存储与 UI 全部重写。

Apache License 2.0 全文见：https://www.apache.org/licenses/LICENSE-2.0

```
Copyright 2026 Juliy

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
