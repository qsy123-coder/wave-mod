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

## 角色 / 武器素材

五星图标与角色立绘来自同一项目的资源包仓库：

- **仓库**：https://github.com/juliy819/wuwa-gacha-tool-resources
- **发布**：GitHub Releases 的 `resource-pack.zip`（`resources-2026.11.07-769922de`）
- **上游数据**：nanoka.cc 的资源快照（`catalog.json` + `icons/` + `portraits/`）
- **本站处理**：按 `resourceId` 命名上传到 COS 的 `gacha-res/icons|<portraits>/<id>.webp`，
  由 `scripts/upload-gacha-resources-to-cos.mjs` 执行；页面按 ID 取图，不依赖角色名。
- 该资源包仓库未声明开源许可；素材版权归游戏厂商及原数据站所有，仅用于本站的
  非商业展示，与 mod 预览图同一性质。

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
