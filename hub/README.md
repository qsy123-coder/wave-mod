# WaveMod 永久发布页（hub）

主站域名被封时，用户通过这里找到最新可用地址。**本目录是一套独立的纯静态页面**，不参与 Next.js 构建，专门部署到 Cloudflare Pages。

## 当前入口

| 入口 | 地址 | 角色 |
|---|---|---|
| 主站 | `https://www.wave-mod.top` | 主域名（可被墙，消耗品） |
| **独立域名（宣传地址）** | `https://sunnyrose.xyz` | **永久入口，用户记忆/打印的固定地址** |
| 中转页（CF Pages） | `https://wavemod-hub.pages.dev` | 免费镜像 |
| 备用渠道 | QQ `3372543343` / 邮箱 `2175075194@qq.com`（TG 待填） | 域外兜底 |

## 域名被封时怎么更新（5 分钟）

1. 改 **`index.html`**：删除失效的 `.site` 块，把新域名加进去（复制已有的 `.site` 块，改 label + url）
2. 改 **`domains.json`**：同步更新 `primary` / `mirrors` / `channels`（与 index.html **必须保持一致**）
3. 改 **`index.html`** 底部的最后更新时间、`domains.json` 的 `updatedAt`
4. `git add hub/ && git commit -m "hub: 更新可用域名" && git push`
5. GitHub Actions（`hub.yml`）自动部署 → `wavemod-hub.pages.dev` 及独立域名**同步更新**，几分钟内生效

## 独立域名怎么挂

1. 买一个便宜域名（.top/.xyz，~10 元/年），**名字不要含 wavemod/敏感词**，开启隐私保护
2. 域名注册商处把 NS 指向 Cloudflare（CF 控制台 → 添加站点 → 免费套餐 → 记下 NS）
3. CF 控制台 → Workers & Pages → 项目 `wavemod-hub` → Custom domains → 添加域名（CF 自动签发证书）
4. 把这个域名写进 `index.html` + `domains.json`，push 一次

## 所需的 GitHub Secrets

部署工作流 `hub.yml` 需要：

| Secret | 值 | 状态 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF API Token，需含 **Pages: Edit** 权限 | 已有（可能需加权限） |
| `CLOUDFLARE_ACCOUNT_ID` | CF 控制台右下角 → My Profile → API Tokens 页面右上角显示 | **需新增** |

## 首次部署

push `hub/**` 后 workflow 自动跑；第一次 `wrangler pages deploy` 会自动创建项目 `wavemod-hub`。
也可手动触发：GitHub → Actions → Deploy Hub Page → Run workflow。

## 注意

- `index.html` 是**自包含**静态页（内联 CSS，无外部依赖），JS 禁用也能正常显示链接
- `domains.json` 供监控/脚本解析，与 HTML 手工同步维护
- 本目录不进 Next.js 构建，不影响 `npm run build`
