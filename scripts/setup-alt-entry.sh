#!/usr/bin/env bash
#
# 给「全新主机名」入口配 nginx 反向代理 + 独立 Let's Encrypt 证书。
#
# 背景：2026-09-23 站点从 Vercel 搬到首尔自托管时，只改了 DNS，没把域名从 Vercel
# 项目里摘掉，结果 DNS 缓存残留的用户会命中 Vercel 那个「网站已暂停部署」的 402 页。
# go.sunnyrose.xyz 是**从未被解析过**的主机名，全世界任何解析器第一次查它就是对的，
# 所以用户点开必定能进 —— 这是「不用教用户清 DNS」的根本办法。
#
# 为什么单独一个 nginx 文件（而不是塞进 sites-available/wavemod）：
#   scripts/deploy-hk.sh 用 `cat >` 整体覆盖主 vhost，塞进去的话将来任何一次
#   重跑部署脚本都会静默把新入口抹掉。
#
# ⚠️ 顺序要求：certbot 的 HTTP-01 验证需要 go.sunnyrose.xyz 已解析到本机。
#   而本机 nginx 对【未知 Host】会回落到该端口的第一个 server block（apex 的 301 块），
#   直接跳到 https://www.wave-mod.top/ —— 那会让 HTTP-01 拿到 301 而失败。
#   所以顺序是：① 加好本文件里的 server_name ② DNS 生效 ③ 跑本脚本。
#
# 用法（服务器上，ubuntu 是 sudo 免密的）：
#   sudo bash setup-alt-entry.sh
# 幂等：可重复跑，已有配置 / 已有证书会跳过。
#
set -euo pipefail

ALT_DOMAIN="${ALT_DOMAIN:-go.sunnyrose.xyz}"
NGINX_SITE="/etc/nginx/sites-available/wavemod-alt"
NGINX_LINK="/etc/nginx/sites-enabled/wavemod-alt"
UPSTREAM="127.0.0.1:3000"

log()  { echo -e "\033[1;34m[alt-entry]\033[0m $*"; }
warn() { echo -e "\033[1;33m[alt-entry]\033[0m $*"; }
die()  { echo -e "\033[1;31m[alt-entry]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 sudo bash 运行（要写 /etc/nginx 并跑 certbot）"
command -v nginx   >/dev/null || die "没找到 nginx"
command -v certbot >/dev/null || die "没找到 certbot"

# ---- 1. nginx vhost：只在不存在时写 ----
# certbot 之后会就地改写这个文件（补 443 / ssl / 跳转），所以绝不能覆盖。
if [ -f "$NGINX_SITE" ]; then
  log "$NGINX_SITE 已存在，跳过写入（certbot 可能已就地改写）"
else
  log "写入 $NGINX_SITE"
  cat > "$NGINX_SITE" <<'NGINX'
# 新入口：全新主机名，没有 DNS 缓存包袱。
# 由 scripts/setup-alt-entry.sh 首次生成，之后 certbot 会就地补上
# 443 / ssl / http->https 跳转 —— 别再手工覆盖本文件。
server {
    server_name go.sunnyrose.xyz;
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    listen 80;
    listen [::]:80;
}
NGINX
fi

ln -sfn "$NGINX_SITE" "$NGINX_LINK"
nginx -t
systemctl reload nginx
log "nginx 配置已生效并重载"

# ---- 2. 证书：独立 lineage，不动 wave-mod.top 那张 ----
# 分开签的理由：这张证书的续期/失效不该牵连主域名，反之亦然。
if [ -d "/etc/letsencrypt/live/${ALT_DOMAIN}" ]; then
  log "${ALT_DOMAIN} 证书已存在，跳过签发"
else
  log "签发前确认 ${ALT_DOMAIN} 已解析到本机（应为 43.133.78.46）："
  getent hosts "$ALT_DOMAIN" || warn "getent 没查到，DNS 可能还没生效"
  log "开始签发（HTTP-01）…"
  certbot --nginx -d "$ALT_DOMAIN" --non-interactive --agree-tos --redirect \
    || die "certbot 失败。常见原因：DNS 还没生效；或该 Host 被 nginx 默认块 301 走了。"
fi

# ---- 3. 自检提示 ----
echo
log "完成。自检命令（在服务器上跑）："
echo "    curl -sS -o /dev/null -D - --resolve ${ALT_DOMAIN}:443:${UPSTREAM%%:*} https://${ALT_DOMAIN}/ | head -6"
echo "    期望 HTTP/1.1 200 + Server: nginx + x-nextjs-cache: HIT"
warn "若返回 301 且 Location 是 https://www.wave-mod.top/ —— server_name 没生效，检查是否写进了别的文件。"
