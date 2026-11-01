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
| 拆包 | `.zip` 合集按顶层目录拆成多个单角色包，字节原样搬运 + 对账；源包与合集长图归档到 `_合集原包/` |
| 裁封面 | 合集长图按包数等分，可在页面里改归属，裁剪结果写成 `<包名>.png` |
| AI 补全 | 词表没命中的条目可以交给 DeepSeek 出建议；角色不在库内一律丢弃 |
| 撤销 | 每次改名写一份 journal，点「撤销上一批」原样恢复（拆包不走 journal：源包只归档不删除） |

## 它不做什么

- **不写数据库**，只读 `character` 与去重键。
- **不移动**已经整理好的包到日期目录顶层，也不触发上传。
- 不删除任何文件；不覆盖同名目标（拆包失败会回滚本轮产物）。

## AI 补全（DeepSeek）

页面每个来源标题右边有「AI 补全 N」，只对**词表没搞定**的条目发起请求。

```bash
# .env.local（本机，不入库）
DEEPSEEK_API_KEY=sk-...
# 可选
DEEPSEEK_MODEL=deepseek-chat        # 默认 deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=25000
```

接口是 OpenAI 兼容的 `POST /chat/completions`，用 `response_format: {type:"json_object"}`，
所以**没有任何新依赖**（不需要官方 SDK）。

纪律：

- 词表命中就绝不问模型；
- 角色白名单来自库内 `distinct character`，模型返回任何白名单外的角色 ⇒ **整条作废**；
- 超时 / 空回复 / JSON 坏了都只报错，不影响人工填名和改名。

## 安全

- 只监听 `127.0.0.1`，局域网访问不到；
- 每次启动生成一次性 token，URL 里没带 `t` 或请求头没带 `x-rename-token` 一律 403；
  （`index.html` 里的 `/style.css`、`/app.js` 会在返回时自动拼上 `?t=`，否则它们也会被自己的鉴权挡住，
  表现是「页面白屏、服务端日志全是 200」）
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

## 拆包的规矩

- 只搬**顶层目录**：每个目录拆成一个包，包内顶层目录 = 包名；
- **字节搬运**：不解压不重压缩，压缩方法与 CRC 沿用源包的中央目录记录；
- **必须对账**：拆出来的文件数与字节数之和要等于源包对应子树，不等就整批回滚；
- 没分配的顶层目录**默认拒绝**（要么分配，要么在界面里勾掉「不要」）；
- 包内自带的 `preview.png` / `preview.jpeg` 会改名成 `screenshot.*`，免得和站内封面重复。

## 撤销记录

`tools/mod-rename/.journal/*.json`（已 gitignore，含本机绝对路径）。只保留最近 30 份。
