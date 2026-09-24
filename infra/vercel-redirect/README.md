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

## 部署（2026-09-24 已上线并验证）

⚠️ **千万别从仓库根目录跑 `vercel`。** 仓库根有 `vercel.json`（`{"framework":"nextjs"}`）
和 `.vercel/project.json`（指向**已删除的** `wave-mod` 项目），CLI 会向上找 `.vercel`，
从仓库里跑必然部署错地方。**稳妥做法：把这三个文件复制到仓库外面**（例如
`C:\Users\<你>\Desktop\wavemod-redirect`）再部署 —— 那是实测跑通的方式。

```bash
cd <仓库外的副本目录>
npx vercel login     # 浏览器里当前登录的必须是「要用的那个账号」
npx vercel --prod
```

> `vercel login` 的 device-code 流程认的是**浏览器当前签的是哪个账号**，
> 不是你在命令行里选的。要换账号就先退出登录或用无痕窗口。

### 关键：Vercel 按「域名归属」路由，不按 DNS

加域名时 Vercel 显示 **Verification Required**，给出这张表：

```
CNAME   www      bb551498696f4abe.vercel-dns-017.com
TXT     _vercel  vc-domain-verify=www.wave-mod.top,f6feeb9e7d5a5fb79f72
```

**只需要 TXT，绝对不要加 CNAME。** Vercel 的原话是：

> This domain is linked to another Vercel account. To use it with this project,
> add a TXT record at `_vercel.wave-mod.top` to verify ownership.

`wave-mod.top` 挂在**旧账号**名下 —— 当年站点跑在 Vercel 上时认领过，
**删项目不会解除账号级的域名归属**。

原理（本轮实测出来的）：

| 观察 | 结论 |
|---|---|
| 搬站后 A 记录早指向首尔，Vercel 仍按旧账号绑定回 402 暂停页 | 路由**跟 DNS 指向无关** |
| 新账号挂上域名但不认领 ⇒ `404 DEPLOYMENT_NOT_FOUND` | 没被本账号拥有 ⇒ 边缘不映射 |
| 补上 TXT 认领 ⇒ **立刻**变成正常路由 | **认领才是开关** |

所以加 CNAME 是错的：那等于把 `www` 整个交给 Vercel，**所有**用户（包括 DNS 完全正常的
绝大多数）都会被甩过来，`www` 再也不是站点，canonical / SEO / 登录回调全跟着变。
**TXT 是惰性记录，对现有流量零影响；A 记录保持灰云指向 `43.133.78.46`。**

### 裸根路径要单独写一条规则

`/:path*` 在 Vercel 上**不匹配空路径**。裸域名 `https://www.wave-mod.top/`
（恰恰是老用户最常点的那种）会掉进静态 `index.html` 而返回 200 —— 靠那个页面的
meta-refresh 兜底也能跳走，但会白多一跳。必须显式写一条：

```json
{ "source": "/",       "destination": "https://go.sunnyrose.xyz/",       "permanent": false },
{ "source": "/:path*", "destination": "https://go.sunnyrose.xyz/:path*", "permanent": false }
```

### 部署后必须实测

```bash
for p in "/" "/mods/12345" "/mods/12345?page=2"; do
  curl -sS -o /dev/null -D - --resolve "www.wave-mod.top:443:76.76.21.21" "https://www.wave-mod.top$p"
done
# 全部期望：307 + Location: https://go.sunnyrose.xyz/<原路径+查询串>
```

`scripts/endpoint-patrol.mjs` 每天自动做同一件事（6 个 Vercel IP 全查）。

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
