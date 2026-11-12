# 本机工具总览

> 2026-11-12 把分散的本地工具收拢进本仓库。此前爬虫/下载器/下载面板在
> `F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\wuwa_mod_crawl`
> 下单独建了一个仓库，现已通过 `git subtree` 并入 `wave-mod/tools/wuwa_mod_crawl`，
> 原有提交历史保留。旧仓库 `qsy123-coder/wuwa_mod_crawl` 仅作历史档案，不再更新。

## 工具位置

| 工具 | 路径 | 语言 | 作用 |
|---|---|---|---|
| 命名工坊 | `tools/mod-rename/` | Node.js | 本地网页工具：扫描每日目录、词表/AI 建议名、分类校验、改名与撤销 |
| 爬虫 + 下载器 | `tools/wuwa_mod_crawl/` | Python | 多来源 Mod 监测、原图/附件下载队列 |
| 下载面板 | `tools/wuwa_mod_crawl/web_status.py` | Python（标准库） | 本地看板：队列进度、失败重试、Clash 切节点 |

数据产物（每日目录 `W-*`、`_Mod每日汇总`、CSV、预览图）**不在仓库里**，仍然位于：

```
F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新
```

原因：那是几百 GB 的本机数据，不是代码；仓库只放代码和文档。

## 启动方式

### 命名工坊

```bash
cd F:\Projects\wave-mod
npm run rename-ui
# 或直接双击仓库根目录的「启动命名工坊.cmd」
```

它读取的数据目录默认是上面的 `A_每日更新`，爬虫状态默认读本仓库的
`tools/wuwa_mod_crawl`。两个路径都可以用环境变量覆盖：

| 变量 | 默认值 |
|---|---|
| `WAVE_MOD_DAILY_BASE` | `F:\BaiduNetdiskDownload\...\A_每日更新` |
| `WAVE_MOD_CRAWL_DIR` | `<仓库>/tools/wuwa_mod_crawl` |

### 下载面板

```bash
cd F:\Projects\wave-mod\tools\wuwa_mod_crawl
python web_status.py            # 自动打开 http://127.0.0.1:8765/
python web_status.py --no-browser
```

也可以双击桌面快捷方式或 `local\run_status_server.bat`。

> 面板需要读取同目录下的 `config.*.ini` 和 `state.*.json`（本机私有，不入库）。

### 爬虫 / 下载器

各来源都有单次和常驻入口（`run_gb_once.py`、`run_gb_forever.py`、
`run_arca_once.py` 等）。本机日常运行由 Windows 计划任务驱动，见下一节。
服务器端（首尔、systemd）的部署文件在 `tools/wuwa_mod_crawl/deploy/`，
本次搬迁**不影响服务器**——服务器上仓库路径仍是 `/home/ubuntu/kekehxl-watcher`。

## Windows 计划任务

| 任务名 | 间隔 | 执行的脚本 |
|---|---|---|
| `GameBananaModWatch` | 15 分钟 | `local\run_gb.bat` |
| `GameBananaModDownload` | 30 分钟 | `local\run_gb_download.bat` |
| `ArcaModDownload` | 30 分钟 | `local\run_arca_download.bat` |
| `KekehxlModSync` | 10 分钟 | `local\run_sync.bat`（`local\sync.ps1`） |

四个任务都通过 `local\hidden_run.vbs` 隐藏窗口启动，由安装脚本用
`$PSScriptRoot` 推导路径。

**搬目录后必须重跑安装脚本**，否则任务仍指向旧路径：

```powershell
cd F:\Projects\wave-mod\tools\wuwa_mod_crawl
powershell -NoProfile -ExecutionPolicy Bypass -File local\install_gb_watch_task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File local\install_gb_download_task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File local\install_arca_download_task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File local\install_sync_task.ps1
```

查看当前任务指向：

```powershell
Get-ScheduledTask -TaskName GameBananaModWatch |
  Select-Object -ExpandProperty Actions | Format-List Execute,Arguments
```

## 密钥与私有文件（绝不入库）

本仓库是**公开仓库**。以下文件都在 `tools/wuwa_mod_crawl/.gitignore` 里被忽略，
只能留在本机：

- `config.ini` / `config.arca.ini` / `config.gb.ini` / `config.afdian.ini` /
  `config.nexus.ini` / `config.patreon.ini` — 含 PushPlus token、Server酱 key、
  站点密码、账号信息
- `patreon_session.txt` — Patreon `session_id` 登录态
- `local/sync.ps1`、`local/install_sync_task.ps1` — 含服务器地址/SSH 密钥名
- `local/baidu_cookies.txt`（以及 `cookies.txt`、`cookies.json`）— 百度/站点 cookie
- `state.*.json` — 下载队列运行状态
- `*.log`、`out/`、`status/`、`__pycache__/`

新增私密文件时，先确认 `.gitignore` 已覆盖，再 `git status` 检查一遍。
提交前可快速自检：

```bash
git ls-files tools/wuwa_mod_crawl | grep -Ei 'config\.[a-z]+\.ini$|state\..*\.json$|\.log$|cookies|session'
# 期望：只出现 *.example.* 这类示例文件
```

## 常见排障

| 现象 | 原因 / 处理 |
|---|---|
| 计划任务跑完什么都没发生 | 任务还指向旧路径。重跑对应 `install_*_task.ps1`，再用 `Get-ScheduledTask` 核对 `Arguments` |
| 下载面板「已下载」显示 0B | 改名/搬目录把文件挪走了，状态没跟上；以实际磁盘为准，详情见 `docs/` 与命名工坊相关说明 |
| 命名工坊建议名缺作者/分类 | 爬虫状态没读到。启动日志里应显示 `爬虫状态：F:\Projects\wave-mod\tools\wuwa_mod_crawl`；也可用 `WAVE_MOD_CRAWL_DIR` 指过去 |
| 下载途中搬动目录后出现「只有缺失文件」的假目录 | 下载器的断点续传按目录结构恢复。等下载结束再搬，或删除残留空目录后重试 |
| 面板起不来/端口占用 | `python web_status.py --port 9000` 换端口；面板默认只绑本机 |

## 本次迁移记录（2026-11-12）

1. 旧仓库未提交的源码先在 `wuwa_mod_crawl` 里提交并推送（`0959f9d`）
2. 停用 4 个计划任务，确认没有正在写的下载进程和 `.part` 残留
3. `git subtree add --prefix=tools/wuwa_mod_crawl` 并入历史（保留原提交）
4. 复制本机私有文件（`config.*.ini`、`state.*.json`、`local/sync.ps1` 等），
   确认全部仍被 `.gitignore` 忽略
5. 命名工坊默认爬虫目录改为 `tools/wuwa_mod_crawl`（旧位置保留兜底）
6. 从新位置重跑 4 个 `install_*_task.ps1`，任务状态 `Ready`
7. 更新桌面「下载面板」快捷方式指向新路径
8. 验证：面板 `/api/status` 正常、命名工坊扫描元数据与搬迁前一致
9. 删除旧目录 `...\wMOD全集-每日更新\wuwa_mod_crawl`
