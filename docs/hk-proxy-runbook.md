# 香港反代上线手册（HK nginx → Vercel）

本文是 `docs/vercel-hk-proxy-migration-prd.md` 里 **Phase 2（香港入口）** 的落地手册。
目标架构：

```
大陆访客 ──TLS──> 香港轻量 (nginx + 代理缓存) ──HTTPS──> Vercel 生产别名 (函数区域 hkg1)
                                                          ├─ Supabase（首尔）
                                                          └─ COS（广州，仅浏览器直连）
```

香港机**不放应用**，只做三件事：终止 TLS、代理缓存、上游故障时兜维护页。
首尔机（`43.133.78.46`）保留 30 天作为热备，回滚就是把 DNS 切回去。

---

## 0. 文件清单

| 路径 | 作用 |
|---|---|
| `scripts/setup-hk-proxy.sh` | 一键装机：装 nginx/certbot、渲染配置、占位证书、可选签正式证书 |
| `deploy/hk-proxy/nginx/wavemod-proxy.conf.template` | 站点配置（缓存、维护页、健康检查） |
| `deploy/hk-proxy/nginx/wavemod-proxy-common.conf.template` | 每个 location 共用的回源指令 |
| `scripts/check-hk-proxy.sh` | 上线验收脚本（状态码、缓存行为、证书天数） |

> 模板里的 `{{DOMAIN}}` / `{{UPSTREAM_HOST}}` / `{{CERT_FILE}}` / `{{KEY_FILE}}`
> 由装机脚本替换，不要手工改渲染后的 `/etc/nginx/*` —— 下次跑脚本会被覆盖
> （旧文件会留在 `*.bak-<时间戳>`）。

**已验证**（2026-10-19，在首尔机的 nginx 1.18 上用独立端口 8080/8443 跑同一份配置）：
首页/列表/更新页 200；`/api/mods` MISS→HIT；带 `query` 的参数 BYPASS；
`/_next/static` MISS→HIT 且 `immutable`；`/api/engagement` BYPASS + `no-store`；
两个健康检查 200。验收脚本 11 项通过（证书项因为用的是 1 天期自签而失败，预期内）。

---

## 1. 买机器与放行端口

- 腾讯云轻量（香港）：2C2G / 30Mbps / 40GB SSD / Ubuntu 22.04 即可。
  峰值只有约 5 req/s，瓶颈在磁盘（代理缓存），不在 CPU。
- **不要选「中国大陆」地域**（要备案）；香港属海外节点。
- 控制台防火墙放行 **22 / 80 / 443**。
  ⚠️ 腾讯云轻量的 443 **默认不放行**，首尔机踩过：本机 curl 200、外网 timeout。
  这个只能在控制台改，服务器上的 ufw 是 inactive，改了没用。

## 2. 装机

先假定用 `ubuntu` 用户登录（腾讯云 Ubuntu 镜像默认禁用 root 的 SSH）。
脚本会去 `<脚本目录>/../deploy/hk-proxy/nginx/` 读模板，所以**相对路径必须保持**。

```bash
# 本地：只传必需的文件（比 clone 整个仓库快得多）
scp -i <密钥> scripts/setup-hk-proxy.sh ubuntu@<香港IP>:/tmp/setup-hk-proxy.sh
scp -i <密钥> -r deploy/hk-proxy ubuntu@<香港IP>:/tmp/hk-proxy

# 服务器：摆成脚本期望的目录结构
sudo mkdir -p /opt/wavemod/deploy
sudo install -D -m 0644 /tmp/setup-hk-proxy.sh /opt/wavemod/scripts/setup-hk-proxy.sh
sudo cp -r /tmp/hk-proxy /opt/wavemod/deploy/

sudo bash /opt/wavemod/scripts/setup-hk-proxy.sh
```

（也可以直接 `git clone` 仓库到 `/opt/wavemod`，只是仓库里带着图库源文件，会慢很多。）

脚本会：

1. 装 nginx / certbot / openssl；
2. 渲染配置到 `/etc/nginx/conf.d/wavemod-proxy.conf` 和
   `/etc/nginx/snippets/wavemod-proxy-common.conf`；
3. 没有正式证书时生成一张 30 天自签证书占位（浏览器会警告，但配置能上线）；
4. `nginx -t` + reload；
5. 装 `/etc/cron.d/wavemod-nginx-reload`：每天 04:17 reload 一次，
   让 `upstream` 重新解析 Vercel 的 IP（开源 nginx 只在启动时解析域名）。

## 3. 签证书（推荐在切 DNS 之前签）

两条路，**优先 DNS-01**，这样切换时没有「自签告警」空窗：

### 3a. DNS-01（推荐，零空窗）

需要一个 Cloudflare API Token，权限只要 `Zone → DNS → Edit`：

```bash
sudo mkdir -p /root/.secrets
sudo tee /root/.secrets/cloudflare.ini >/dev/null <<'EOF'
dns_cloudflare_api_token = 你的token
EOF
sudo chmod 600 /root/.secrets/cloudflare.ini

sudo bash /opt/wavemod/scripts/setup-hk-proxy.sh --issue-cert-dns --email=你的邮箱
```

不需要 A 记录已经指过来，也不需要 80 端口。签完证书就会自动切到
`/etc/letsencrypt/live/<域名>/`。

### 3b. HTTP-01（切完 DNS 之后）

```bash
dig +short go.sunnyrose.xyz      # 先确认返回香港机 IP，再签
sudo bash /opt/wavemod/scripts/setup-hk-proxy.sh --issue-cert --email=你的邮箱
```

脚本会比对「本机公网 IP」和「域名解析结果」，不一致会拒绝签发
（避免吃 Let's Encrypt 的失败次数限制）。

两条路都会安装续期钩子 `/etc/letsencrypt/renewal-hooks/deploy/wavemod-nginx`，
续期后自动 reload nginx。

## 4. 切 DNS

在 Cloudflare（**灰云 / DNS only**，不要开橙云）：

1. **提前 24 小时**把 `go.sunnyrose.xyz` 的 TTL 从 Auto(300s) 改成 **60 秒**；
2. 把 A 记录从首尔 `43.133.78.46` 改成香港机公网 IP；
3. 验证：`dig +short go.sunnyrose.xyz`。

不要动 `wave-mod.top` / `www.wave-mod.top`，它们保持 410。
参考 `docs/域名入口拓扑.md` 与记忆里「换域名只改 DNS 不够」的教训。

## 5. 验收

```bash
bash scripts/check-hk-proxy.sh https://go.sunnyrose.xyz
```

预期全部通过。手工再确认几件事：

```bash
# 1) 响应确实来自 Vercel hkg1
curl -sI https://go.sunnyrose.xyz/api/mods?sort=new | grep -i x-vercel-id
#    期望形如 icn1::hkg1::xxxx（边缘 icn1 是访客所在区域，函数是 hkg1）

# 2) 缓存状态
curl -sI https://go.sunnyrose.xyz/api/mods?sort=new | grep -i x-cache-status   # 第一次 MISS
curl -sI https://go.sunnyrose.xyz/api/mods?sort=new | grep -i x-cache-status   # 第二次 HIT

# 3) 登录、收藏、点赞、下载各点一次（浏览器）
# 4) 每日上传脚本的 /api/revalidate ping 仍能打穿（它走 POST，必然 BYPASS）
```

## 6. 缓存策略（改之前先看这张表）

| 路径 | 缓存 | 说明 |
|---|---|---|
| `/_next/static/*` | 1 年 | 文件名带内容哈希；强制 `immutable` |
| `/favicon.ico` | 1 年 | 15 天 563MB 的热点请求 |
| 其他带扩展名的静态资源 | 7 天 | css/js/图片/字体/视频等 |
| 页面 HTML / RSC | 300 秒，后台刷新 | **只有带登录态 Cookie（`sb-*-auth-token`）的请求绕过**；皮肤/布局 cookie 不绕过；上游回 Set-Cookie 的响应不落盘 |
| `/api/mods` | 7200 秒 | 带 `query=` 的请求不进缓存（长尾搜索）。2026-10-23 日志实测 40% 是 STALE，故从 1800s 再提到 2h |
| `/api/updates` | 300 秒 | 与接口自身 `s-maxage` 对齐 |
| `/api/characters` | 600 秒 | 角色分类列表 |
| `/api/home/lower` | 300 秒 | 首页下半屏数据 |
| `/api/gallery/*` | 302 缓存 1 小时 | 真正的图片由浏览器直连 COS |
| `/api/engagement` | **不缓存** | 响应含 per-device 的 `mine`，缓存会串号 |
| 其他 `/api/*`、`/admin`、`/auth`、`/login`、`/favorites` | **不缓存** | POST 一律 BYPASS |
| 上游 502/503/504 | 维护页 | 页面返回 HTML，API 返回 JSON 503 + `Retry-After` |

> ⚠️ PRD 里写「`/api/engagement` 缓存 30–60 秒」是**错的**：该响应包含
> 「这台设备赞没赞过」，共享缓存会把 A 的状态发给 B。配置里已显式关闭，
> 不要再加回去。

## 6.1 Vercel Security Checkpoint：访客看到「外观资源加载失败」（2026-10-31）

### 现象

页面本身能打开，点开某条 mod 的详情抽屉却显示
**「外观资源加载失败，请稍后重试。」**（`mod-detail-drawer.tsx` 的通用错误分支），
换设备/刷新依旧；同一条 mod 的 HTML 页面仍是 200。

### 根因

Vercel 的自动 DDoS 缓解（`sys_dos_mitigation`）把**香港反代的出口 IP**
`45.135.119.204` 整段判成攻击源，对它下发了 15 分钟左右的 Challenge。
于是所有回源请求（页面、`/api/mods/<id>`）都拿到 **403 + 约 17KB 的
"Vercel Security Checkpoint" HTML**。页面 HTML 往往已被 nginx 缓存所以照常打开，
而详情抽屉的 `fetch('/api/mods/<id>')` 拿到 403 → 非 404 → 走通用错误文案。

关键点：**这不是数据问题，也不是某条 mod 坏了**。DB 里 `is_published`、API 返回都正常。

### 怎么确认（3 条命令）

```bash
# 1) 香港机访问日志：403 且 urt≈0、body≈17417/17425，就是挑战页
ssh -i ~/.ssh/wavemod_hk -p 28822 root@45.135.119.204 \
  "grep -a ' /api/mods/' /var/log/nginx/wavemod.access.log | tail -30"

# 2) 谁被挑战、什么时候结束
vercel firewall persistent-actions list   # System Rule Challenge 45.135.119.204
vercel firewall overview                 # Rules 里出现 sys_dos_mitigation

# 3) 挑战窗口结束后直连验证
curl -s -o /dev/null -w '%{http_code}\n' \
  https://go.sunnyrose.xyz/api/mods/07a91e64-0106-492d-b7d2-7cade4fbf25d
```

### 处置

- **等**：这类 Challenge 窗口约 15 分钟，结束后自动恢复（2026-10-31 那次为
  02:53–03:08 UTC）。
- **已加的兜底**（commit `453f2f90`）：所有带 `proxy_cache` 的 location 的
  `proxy_cache_use_stale` 都加了 `http_403` —— 挑战期间把盘里的旧 200 发给访客，
  没有缓存条目的 URL 仍透传 403。
- **Hobby 没有 IP Bypass**：`vercel firewall system-bypass add <ip>` 会返回 402
  （Pro/Enterprise 才有）。若挑战持续、且新 URL 也被挡住，只能临时
  `vercel firewall system-mitigations pause`（立即生效，24 小时后自动恢复）。
- 不要为了「修复」去改 title / `character` / 重新上传：那会让去重键错位，
  详见 CLAUDE.md 的每日上传硬规则。

## 7. 已知问题（切换前必须知道）

### 7.1 Vercel 到广州 COS 不通（2026-10-19，计数部分已解决）

2026-10-19 实测：从 Vercel 函数（hkg1）访问
`wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com`，TCP 连接 40 秒才
`ETIMEDOUT`，16 个互动计数分片全部失败。

**已解决**（commit `087966ab`）：互动计数改存 Supabase Postgres
（`engagement_totals` + `engagement_devices` + 原子 RPC `engagement_apply`）。
线上实测 `/api/engagement` 0.7–0.9s、`sort=hot` 1.15s、点赞 toggle 正常落库。
COS 实现保留为回退，带 5s 截止 + 60s 熔断。

**仍存在的轻微影响**：远程兜底快照（COS）拉不到，Supabase 失败时会退回
打包内那份构建期快照（数据会停在最后一次部署）。概率低、可接受；
以后若要彻底消除，可把快照也放到 Supabase Storage / 香港中转。

### 7.2 缓存曾被皮肤 cookie 整层打穿（2026-10-21 已修）

`ThemeProvider` 挂载时会无条件写 `wavemod-theme`（默认皮肤也写），而反代原先按
「请求带任何 Cookie 就绕过缓存」判断登录态，结果**97% 的页面请求都在 BYPASS**：
日志 33 小时里 `/updates` 3,144 次 BYPASS / 31 次 HIT。同一时段 `/api/mods` 的
300 秒 TTL 对「十几分钟才来一次」的 URL 也基本不命中——它一条路由占了 Vercel
全部 Active CPU 的 65%，按当时速率外推约 10.75 CPU 小时/月，而 Hobby 只有 4 小时。

修法（纯 nginx 配置）：`$cache_bypass_cookie` 只认 `sb-*-auth-token`、
`/api/mods` TTL 提到 1800 秒、HTML 提到 300 秒、UA 拉黑扫描器。
验收：带皮肤 cookie 应 HIT，带 `sb-*-auth-token` 应 BYPASS。

### 7.3 Hobby 的 100 万次函数调用

健康日动态请求约 7.3 万/天 ≈ 220 万/月，是上限的 2 倍。本反代的缓存就是为它设计
的。上线后每天在 Vercel 面板看 Function Invocations；2026-10-21 实测已降到
约 9.1K 次/12 小时（≈55 万/月），余量充足，下一个瓶颈是 Active CPU 而不是调用次数。

**2026-10-23 复查：调用次数确实安全，Active CPU 才是真瓶颈。** 面板显示 7K 次/12h
（≈42 万/月），但 Active CPU 合计 453s/12h，按 nginx 日志里「12:00–24:00 占全天 69%」
折算约 **5.5 CPU 小时/月**，而 Hobby 只有 4 小时/月（超了直接暂停，不是计费）。
其中 `/api/mods` 一条占 53%（单次 ≈160ms）。两条措施一起上：

1. 本表 TTL 从 1800s 提到 7200s（日志 40% 是 STALE，长尾 URL 半小时 TTL 基本不命中）；
2. 列表页结果在 Next 侧再加一层整页缓存（`public.ts` 的 `getCachedModsPage`），
   命中时不再反序列化 11 个分片（≈5.5MB）再重排整表。

### 7.4 上游超时

`proxy_read_timeout 60s`。Vercel 冷启动通常 1–2 秒，但 `sort=hot` 这种坏路径会
直接吃满超时并返回维护页 —— 这是有意的：宁可给一个可读的维护页，也不要让访客
连接挂 120 秒。

### 7.5 Server Action 的 Origin 校验（2026-10-19 已修）

**现象**：切换后页面全部 200，但某些动作静默失败；抓包能看到形如
`POST /`（Next Server Action）返回 **500**，响应体是一个 digest 错误。
首尔直连时同样的请求是 200。

**原因**：反代把回源 Host 改成了 `wave-mod.vercel.app`，而浏览器发来的
`Origin` 是 `https://go.sunnyrose.xyz`。Next 的 Server Action CSRF 校验
比对 Origin 与 host/x-forwarded-host，不一致就拒绝整条 action。

**修法**：`next.config.ts` 里显式放行对外域名（只写 host，不要带 scheme）：

```ts
experimental: {
  serverActions: { allowedOrigins: ["go.sunnyrose.xyz"] },
}
```

**验证**：headless Chrome 打开首页，抓 `POST` 的 `Next-Action` 请求，
状态必须是 200；日志里 `POST /` 不应再出现 5xx。

> 以后换对外域名，记得同步改 `allowedOrigins`，否则同样会全站 500。

## 8. 回滚

| 场景 | 操作 | 生效时间 |
|---|---|---|
| Vercel 部署坏 | Vercel 面板 Promote 上一个 Ready 版本 | ≤ 2 分钟 |
| 香港机故障 | DNS A 记录切回首尔 `43.133.78.46`（TTL 60s） | ≤ 5 分钟 |
| nginx 配置错误 | `cd /etc/nginx/conf.d && cp wavemod-proxy.conf.bak-<时间戳> wavemod-proxy.conf && nginx -t && systemctl reload nginx` | 秒级 |
| 想完全停用反代 | 把 DNS 切回首尔，香港机保留但不再有流量 | ≤ 5 分钟 |

回滚前先确认首尔机还在正常服务（`curl -sI https://www.wave-mod.top/` → 200）。

## 9. 日常运维

```bash
# 实时看缓存命中/耗时（cache=HIT/MISS/BYPASS 是关键指标）
tail -f /var/log/nginx/wavemod.access.log

# 错误日志
tail -f /var/log/nginx/error.log

# 缓存占用
du -sh /var/cache/nginx/wavemod

# 证书
certbot certificates
certbot renew --dry-run

# 配置校验与重载
nginx -t && systemctl reload nginx

# 上游健康
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://go.sunnyrose.xyz/__health/origin
```

监控建议：外部 uptime 服务同时探 `/__health`（香港机）与 `/__health/origin`
（香港 → Vercel），两段分别告警，能一眼区分「机器挂了」和「上游挂了」。

## 10. 不在本手册范围

- 在香港机上跑应用本体（本方案只做反代）；
- 国内 CDN / 备案；
- 多香港节点与自动故障转移（当前是单机 + DNS 回滚）；
- 限流/防刷（如需，在 `location` 里加 `limit_req`，不要动缓存策略）。
