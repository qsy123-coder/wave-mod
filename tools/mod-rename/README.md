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
| 扫描 | 按日期目录列出两个来源的全部条目，预览图自动挂到对应的 mod 上（`_1`/`-1` 编号会归并，封面永远排第一）；另外把**日期目录顶层**（`根目录`）也列出来，整理/搬上去的包仍然能改名 |
| 建议名 | 韩语词表（`data/glossary.json`）翻译角色与皮肤词；已是规范名的条目原样拆回各字段 |
| 分类校验 | 用 `resolveCharacterAndTitle` + 库内 `distinct character` 判断；**角色不在库里就禁止应用** |
| 去重提示 | 库里已有 `character\|title` 时给黄色警告（不阻止，重新上架要用） |
| 撞名拦截 | 同一批里两行改成同一个目标名（多半是爬虫把同一链接下载了两遍，目录里躺着两份 identical 副本）时，后一条禁止应用并写明撞了谁；不会拖到落盘才失败 |
| 批量改名 | 主条目（exe/目录/首图）和它的预览图一起改，图片按 `-1`/`-2` 编号 |
| 拆包 | `.zip` 合集按顶层目录拆成多个单角色包，字节原样搬运 + 对账；源包与合集长图归档到 `_合集原包/` |
| 裁封面 | 合集长图按包数等分，可在页面里改归属，裁剪结果写成 `<包名>.png` |
| AI 补全 | 词表没命中的条目可以交给 DeepSeek 出建议；角色不在库内一律丢弃 |
| 多附件分组 | 同一 GameBanana 帖子的多个附件（Slim/Thicc × SFW/NSFW 等）在改名时写 `.mod-groups.json`，每日上传脚本据此合并成一张卡 |
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
- **角色以词表/分类为准**：词表已经定出角色时（含 GameBanana 子分类映射），模型只补名称，
  返回的角色会被忽略；`Yangyang: Xuanling` 这类复合子分类按精确映射走（→ 玄翎，不是秧秧）；
- 角色白名单来自库内 `distinct character`，模型返回任何白名单外的角色 ⇒ **整条作废**；
- **允许部分结果**：只认出角色（`Shen QingXiao` → 清宵，名称空）或只翻出名称，也会填进表单，
  不会因为半边缺失把整条丢掉；用户补另一半即可；
- **原文整段英文 ⇒ 名称必须含中文**：模型把 `Ramielle Dan` 原样抄回来会被判失败并报出来，
  不再接受「看着补了其实没翻」；
- 没补上的条目会逐条报原因（角色不在库内 / 模型没返回 / 名称还是韩文或英文），不再静默丢弃；
- 超时 / 空回复 / JSON 坏了都只报错，不影响人工填名和改名。

## 安全

- 只监听 `127.0.0.1`，局域网访问不到；
- 每次启动生成一次性 token，URL 里没带 `t` 或请求头没带 `x-rename-token` 一律 403；
  （`index.html` 里的 `/style.css`、`/app.js` 会在返回时自动拼上 `?t=`，否则它们也会被自己的鉴权挡住，
  表现是「页面白屏、服务端日志全是 200」）
- 校验 `Origin`，别的网页发来的请求会被拒；
- 只允许操作 `WAVE_MOD_DAILY_BASE` 下 `W-日期` 目录的 `arca.live/`、`GameBanana/` 和该日期目录**顶层**（`根目录` 来源）；
- 没有删除接口，只有 `rename`；
- 启动地址会写到 `tools/mod-rename/.url`（控制台关掉后也能找回 token），
  接口报错追加到 `.errors.log`；两个文件都在 gitignore 里。

## 词表

`data/glossary.json`：

```json
{
  "characters": { "금희": "今汐" },        // 韩语角色名 → 站内角色（必须真实存在于库内）
  "words":      { "팬스좌": "粉丝福利" },   // 皮肤/风格词
  "categories": { "Danjin": "丹瑾" },      // GameBanana 子分类 → 站内角色（精确匹配优先）
  "properNames": { "Ramielle Dan": "蕾米埃尔·丹" }, // 英文人名的社区译名，只喂给 AI，
                                                    // 不参与 translate 匹配（否则整段英文名会被当成「已翻译」）
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

## 多附件分组清单

同一条 GameBanana 帖子挂了多个附件时（例如 `Slim SFW` / `Thicc NSFW`），
`applySamePostSuffixes` 仍然给第 2 个以后的标题加后缀，保证文件名不撞；
同时 `applyPostVariantLabels` 按帖子 URL 给整组打上 `variantLabel`，点「应用」时
服务端把「帖子 → 基础标题 → 变体」写进日期目录的 `.mod-groups.json`。

- 变体标签从原始附件名去掉帖子标题后得到，保留 `Normal` / `Thicc Heavy` / `VIP` 等完整描述；
- 每个变体同时记录 `name`（改后主名）、`localName`（改前本地名）、`sourceName`（爬虫原始名），
  夸克分享无论改名前后导出都能对上；
- 清单和改名一起落盘；撤销时如果清单仍是本批写的内容才恢复，避免覆盖后来的改动；
- 每日上传脚本读不到清单 / 清单对不上时，按原来的「一个附件一张卡」处理，不会报错。
