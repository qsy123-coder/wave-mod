# 旧链接兜底重定向（Vercel）

## 这是什么

一个只做一件事的 Vercel 项目：把所有打到 `www.wave-mod.top` / `wave-mod.top` 的请求
**307 跳到 `https://go.sunnyrose.xyz`**（同一路径 + 查询串）。

## 为什么需要它

2026-09-23 站点从 Vercel 搬到首尔自托管，**只改了 DNS，没把域名从 Vercel 项目里摘掉**。
结果 Vercel 边缘至今仍在替这个域名应答，返回 402 `DEPLOYMENT_DISABLED`
（那张「网站已经暂停部署」的页面）。

而搬站后**一部分用户的 DNS 缓存里还留着旧 Vercel IP**（运营商 DNS 超额缓存、
路由器缓存、浏览器/微信内置解析器，各地各网不一），他们打开旧链接就会命中那个 402。

`go.sunnyrose.xyz`（全新主机名，无解析历史）解决了「用户点新入口」的问题，
但**小白不会记地址，他们点的是群里的历史链接** —— 只有这里能把那些链接接住。

## 部署

⚠️ **必须在 `infra/vercel-redirect/` 目录里部署，绝不能从仓库根目录跑 `vercel`。**
仓库根有 `vercel.json`（`{"framework":"nextjs"}`）和 `.vercel/project.json`（指向**已暂停的**
`wave-mod` 项目），从根跑会部署错东西。

```bash
cd infra/vercel-redirect
npx vercel login     # 交互式，需要一个「能用的」Vercel 账号（免费 Hobby 即可）
npx vercel --prod
```

然后把 `www.wave-mod.top` 和 `wave-mod.top` 两个域名都加到这个项目上。

### 前置条件

1. **先从暂停的 `wave-mod` 项目里摘掉这两个域名** —— Vercel 同一个域名不能被两个项目同时认领。
2. 加域名时 Vercel 会要求 **TXT 验证**（在 Cloudflare 加一条 `_vercel` TXT）。
   ⚠️ **别让 Vercel 的引导覆盖 A 记录** —— `www` 和 apex 的 A 必须继续指向 `43.133.78.46`。

### 部署后必须实测

```bash
curl -sS -o /dev/null -D - --resolve "www.wave-mod.top:443:76.76.21.21" https://www.wave-mod.top/
# 期望：307 + Location: https://go.sunnyrose.xyz/
```

**这是唯一有不确定性的环节**：域名绑到新项目后，Vercel 是否还在共享 anycast IP 上
按 Host 头路由，需要实测确认。

即使不成立，**结果也可接受**：残留用户看到的是 Vercel 404，而不是那张吓人的
「网站已暂停部署」。退路是向 Vercel 提 Usage Enquiry 申诉解封
（`vercel.com/help`，Problem Area 选 Usage Enquiry）。

## 为什么是 307 而不是 301

`permanent: false` → 307。**刻意不用 301/308**：永久重定向会被浏览器长期缓存，
以后想改跳转目标、或者想拆掉这个项目，都会非常难受。

## 什么时候删掉它

**大约 2 周后**（超出国内运营商 DNS 最恶劣的超额缓存窗口）即可删除项目。

判断依据：`https://www.wave-mod.top` 在干净 DNS 下已经稳定直达首尔，
且不再收到残留用户的访问。删掉之后，所有用户都直接走 `go.sunnyrose.xyz` / 主站。

## 相关

- 入口拓扑与本次事故复盘：`docs/域名入口拓扑.md`
- 永久发布页：`hub/README.md`
- 巡检（本项目的存活与行为由 `scripts/endpoint-patrol.mjs` 定时检查）
