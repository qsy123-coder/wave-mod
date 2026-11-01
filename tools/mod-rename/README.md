# Mod 命名工坊（tools/mod-rename）

把 `W-YYYY.M.D/{arca.live,GameBanana}/` 里的爬虫原始名整理成站内规范：

```
<角色>-<名称>[v版本]（切换键）by <作者>
```

设计文档：`docs/mod-rename-tool-prd.md`。规则唯一来源：`scripts/daily-classify.mjs`
（本工具不重写分类逻辑，只调用）。

## 运行

```bash
npm run rename-ui
# → http://127.0.0.1:4318/?t=<一次性 token>
# 换端口：node tools/mod-rename/server.mjs --port=4319
```

数据目录默认 `F:\BaiduNetdiskDownload\MC-MOD整合包\wMOD全集-每日更新\A_每日更新`，
可用 `WAVE_MOD_DAILY_BASE` 覆盖；爬虫状态目录默认取它的上级 `wuwa_mod_crawl`，
可用 `WAVE_MOD_CRAWL_DIR` 覆盖。没有爬虫状态时仍能改名，只是没有作者/分类信息。

## 它能做什么

| 能力 | 说明 |
|---|---|
| 扫描 | 按日期目录列出两个来源的全部条目，预览图自动挂到对应的 mod 上（`_1`/`-1` 编号会归并） |
| 建议名 | 韩语词表（`data/glossary.json`）翻译角色与皮肤词；已是规范名的条目原样拆回各字段 |
| 分类校验 | 用 `resolveCharacterAndTitle` + 库内 `distinct character` 判断；**角色不在库里就禁止应用** |
| 去重提示 | 库里已有 `character\|title` 时给黄色警告（不阻止，重新上架要用） |
| 批量改名 | 主条目（exe/目录/首图）和它的预览图一起改，图片按 `-1`/`-2` 编号 |
| 撤销 | 每次应用写一份 journal，点「撤销上一批」原样恢复 |

## 它不做什么（P0 边界）

- **不写数据库**，只读 `character` 与去重键。
- **不移动**已经整理好的包到日期目录顶层，也不触发上传。
- **不拆合集包**、不裁封面（P1）。
- **不接模型**（P2）：目前全是词表 + 人工修改。
- 不删除任何文件；不覆盖同名目标。

## 安全

- 只监听 `127.0.0.1`，局域网访问不到；
- 每次启动生成一次性 token，URL 里没带 `t` 或请求头没带 `x-rename-token` 一律 403；
- 校验 `Origin`，别的网页发来的请求会被拒；
- 只允许操作 `WAVE_MOD_DAILY_BASE` 下 `W-日期` 目录的 `arca.live/`、`GameBanana/`；
- 没有删除接口，只有 `rename`。

## 词表

`data/glossary.json`：

```json
{
  "characters": { "금희": "今汐" },        // 韩语角色名 → 站内角色（必须真实存在于库内）
  "words":      { "팬스좌": "粉丝福利" },   // 皮肤/风格词
  "categories": { "Danjin": "丹瑾" },      // GameBanana 子分类 → 站内角色
  "endfieldMarkers": ["엔드필드", "EFMI"]  // 非鸣潮，禁止应用
}
```

新增词条请附来源（哪天的哪个包），**不要凭猜** —— 角色写错会在前台凭空多一个分类。

## 撤销记录

`tools/mod-rename/.journal/*.json`（已 gitignore，含本机绝对路径）。只保留最近 30 份。
