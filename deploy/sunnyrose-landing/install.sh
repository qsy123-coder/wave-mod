#!/usr/bin/env bash
#
# 根域发布页（sunnyrose.xyz）—— 香港机静态站部署 / 更新。
#
# 背景：根域原先是 CNAME → wavemod-hub.pages.dev + Cloudflare 橙云。
# 大陆访客被 CF 免费版调度到 LAX（cf-response `CF-RAY ...-LAX`），实测 TLS 握手
# 15–67 秒随机抖动，发布页「加载好久才进去」。2026-11-20 改成灰云 A 记录
# 直连本机 + nginx 静态站，TTFB 降到 0.4–2.7 秒。
#
# 用法（在服务器上跑）：
#   bash deploy/sunnyrose-landing/install.sh
#
# 幂等：重复跑只会覆盖 index.html / vhost，然后 nginx -t + reload。
# 证书由 certbot 管理，本脚本不碰 /etc/letsencrypt。
#
# ⚠️ 本文件只写 sites-available/sunnyrose-landing，不碰 conf.d/wavemod-proxy.conf；
#    scripts/deploy-hk-app.sh 只重写后者，两边互不覆盖。
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/wave-mod}"
WEB_ROOT="/var/www/sunnyrose"
NGINX_SITE="/etc/nginx/sites-available/sunnyrose-landing"
NGINX_LINK="/etc/nginx/sites-enabled/sunnyrose-landing"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { printf '\n\033[1;34m[landing]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[landing]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 sudo bash 运行（要写 /etc/nginx）"
command -v nginx >/dev/null || die "没找到 nginx"

[ -f "$SRC_DIR/index.html" ] || die "缺 $SRC_DIR/index.html"
[ -f "$SRC_DIR/sunnyrose-landing.conf" ] || die "缺 $SRC_DIR/sunnyrose-landing.conf"

log "静态文件 → $WEB_ROOT"
mkdir -p "$WEB_ROOT" /var/www/letsencrypt
install -m 0644 "$SRC_DIR/index.html" "$WEB_ROOT/index.html"
chown -R www-data:www-data "$WEB_ROOT"

log "vhost → $NGINX_SITE"
if [ -f "$NGINX_SITE" ] && ! diff -q "$SRC_DIR/sunnyrose-landing.conf" "$NGINX_SITE" >/dev/null; then
  cp "$NGINX_SITE" "${NGINX_SITE}.bak-$(date +%Y%m%d%H%M%S)"
  log "已备份旧 vhost"
fi
install -m 0644 "$SRC_DIR/sunnyrose-landing.conf" "$NGINX_SITE"
ln -sfn "$NGINX_SITE" "$NGINX_LINK"

log "nginx -t"
nginx -t || die "nginx 配置检查失败，未 reload"

systemctl reload nginx
log "已 reload"

log "冒烟（本机 Host 头）"
fail=0
expect() {  # host path want extra_curl_args...
  local host=$1 path=$2 want=$3; shift 3
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $host" "$@" "http://127.0.0.1${path}" 2>/dev/null)
  printf '    %-26s %-30s %s\n' "$host" "$path" "$code"
  [[ "$code" == "$want" ]] || fail=1
}
expect_https() {
  local host=$1 path=$2 want=$3
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' -H "Host: $host" "https://127.0.0.1${path}")
  printf '    %-26s %-30s %s (https)\n' "$host" "$path" "$code"
  [[ "$code" == "$want" ]] || fail=1
}

# 80 只做跳转，200 永远来自 443
expect sunnyrose.xyz     / 301
expect www.sunnyrose.xyz / 301
expect_https sunnyrose.xyz     / 200
expect_https www.sunnyrose.xyz / 200

# ACME 路径必须可达（HTTP-01 兜底；60 天后续期失败会在这里暴露）
mkdir -p /var/www/letsencrypt/.well-known/acme-challenge
echo acme-probe > /var/www/letsencrypt/.well-known/acme-challenge/probe.txt
expect sunnyrose.xyz /.well-known/acme-challenge/probe.txt 200
rm -f /var/www/letsencrypt/.well-known/acme-challenge/probe.txt

echo
if [ $fail -ne 0 ]; then
  die "冒烟失败：确认 sites-enabled 链接、以及 nginx 没有别的 server block 抢同一个 Host"
fi
log "完成。外网自检：curl -s -o /dev/null -w 'tls=%{time_appconnect} ttfb=%{time_starttransfer}\\n' https://sunnyrose.xyz/"
