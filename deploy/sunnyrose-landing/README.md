# 根域发布页（sunnyrose.xyz）

`https://sunnyrose.xyz` 是「永久发布页」：主站打不开时，用户从这里找可用地址。
它是纯静态单文件（6 KB，内联 CSS，零外部请求）。

## 为什么搬到香港机

| | 2026-11-20 之前 | 现在 |
|---|---|---|
| DNS | CNAME → `wavemod-hub.pages.dev`，**橙云** | A → `45.135.119.204`，**灰云（DNS only）** |
| 承载 | Cloudflare Pages | 香港机 nginx 静态站 |
| 大陆实测 TLS 握手 | **0.6s / 7.6s / 15s / 27s / 67s 随机** | 0.25–1.2s |
| 大陆实测 TTFB | 1.3s → 8s → 30s | 0.4–2.7s |

根因：`https://sunnyrose.xyz/cdn-cgi/trace` 返回 `colo=LAX`、`loc=CN` ——
Cloudflare 免费版把大陆访客调度到洛杉矶节点。免费版没有中国大陆网络（企业版专属），
调度完全由 BGP 决定，无法在控制台指定机房。任何「开着橙云的 Pages/Workers」都有同样问题，
**不要**再给根域或主站套橙云。

主站 `go.sunnyrose.xyz` 一直是灰云直连，所以从来没这个问题。

## 文件

| 文件 | 用途 |
|---|---|
| `index.html` | 发布页正文（改文案只改这个） |
| `sunnyrose-landing.conf` | nginx vhost（80 跳转 + 443 静态 + ACME 路径） |
| `install.sh` | 幂等部署：拷文件 → `nginx -t` → reload → 冒烟 |

证书：`/etc/letsencrypt/live/sunnyrose.xyz/`，由 `certbot --nginx` 签发并自动续期
（`renewal/sunnyrose.xyz.conf`，`authenticator = nginx`）。

## 部署

```bash
# 本机
ssh -i C:/Users/WINDOWS11/.ssh/wavemod_hk -p 28822 root@45.135.119.204 \
  'cd /var/www/wave-mod && git fetch --depth=1 origin main && git reset --hard origin/main \
   && bash deploy/sunnyrose-landing/install.sh'
```

只改文案时也可直接传单文件：

```bash
scp -i C:/Users/WINDOWS11/.ssh/wavemod_hk -P 28822 \
  deploy/sunnyrose-landing/index.html root@45.135.119.204:/var/www/sunnyrose/index.html
```

## DNS 状态（Cloudflare zone `sunnyrose.xyz`）

```
A  sunnyrose.xyz      45.135.119.204  proxied=false  ttl=60
A  www.sunnyrose.xyz  45.135.119.204  proxied=false  ttl=60
```

- 改 DNS 用服务器上的 token：`/root/.secrets/cloudflare.ini`（仅 zone 权限，没有 account 权限）。
- `wavemod-hub.pages.dev` 这个 Pages 项目仍然存在，发布页里作为「备用镜像」保留；
  它依旧是橙云，大陆访问慢，但只作为兜底。
- MX / TXT 走 Cloudflare Email Routing，与 A 记录无关，切换时不用动。

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `http://sunnyrose.xyz/` 返回 301 到 `www.wave-mod.top` | 新的 80 vhost 没加载，请求落到 go 的 server block | `nginx -T \| grep -n server_name`，确认 925 行附近有 `sunnyrose.xyz` |
| `certbot` 报 HTTP-01 失败 | DNS 还是橙云 / 本地缓存未过期 | `dig +short @1.1.1.1 sunnyrose.xyz` 必须返回 `45.135.119.204` |
| 浏览器还开着旧页面 | 本地 DNS 缓存（原 TTL 300s） | `ipconfig /flushdns`，最多等 5 分钟 |
| Cloudflare 面板显示 Pages「未验证」 | DNS 记录已从 Pages 解绑 | 正常，Pages 不会自动重建 A 记录 |

## 回滚

DNS 是唯一开关：Cloudflare 控制台把 `@` 和 `www` 改回 CNAME → `wavemod-hub.pages.dev`、
橙云开启即可，服务器上的 vhost 留着不影响。备份在服务器
`/root/dns-backup-sunnyrose-20261120-232114.json`。
