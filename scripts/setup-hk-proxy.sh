#!/usr/bin/env bash
#
# WaveMod 香港反代一键装机（nginx + 代理缓存 + certbot）
#
# 目标系统：Ubuntu 22.04 / 24.04（腾讯云/阿里云香港轻量，2核2G 足够）
# 用法：
#   sudo bash scripts/setup-hk-proxy.sh                       # 装好 80/443 + 自签占位证书
#   sudo bash scripts/setup-hk-proxy.sh --issue-cert          # DNS 已指向本机后签正式证书
#   sudo bash scripts/setup-hk-proxy.sh --issue-cert-dns      # DNS 还没切，用 Cloudflare DNS-01 先签
#   sudo bash scripts/setup-hk-proxy.sh --domain=xx.example.com --upstream=wave-mod.vercel.app
#
# 推荐顺序（零证书空窗）：先在旧 DNS 下用 --issue-cert-dns 签好证书，再切 A 记录。
#
# 前置：本脚本会去读仓库里的模板
#   deploy/hk-proxy/nginx/wavemod-proxy.conf.template
#   deploy/hk-proxy/nginx/wavemod-proxy-common.conf.template
# 所以要么把仓库 clone 到机器上，要么把 deploy/hk-proxy 和本脚本一起 scp 上去。
#
# 脚本做这些事：
#   1. 装 nginx / certbot
#   2. 渲染并启用反代配置（含代理缓存、维护页、健康检查）
#   3. 没有正式证书时先放一张自签证书，保证 nginx -t 能过、配置能上线
#   4. --issue-cert：用 webroot 方式签 Let's Encrypt，签完自动切过去
#   5. 装一条每日 reload 的 cron（Vercel 换 IP 时靠它重新解析 upstream）
#
# 刻意不做的事：
#   - 不动云厂商安全组（控制台放行 80/443，脚本里开 ufw 是白开）
#   - 不自动改 DNS（切域名是独立步骤，见 docs/hk-proxy-runbook.md）
#   - 不申请证书（除非显式传 --issue-cert）：DNS 没指过来就签会吃
#     Let's Encrypt 的失败次数限制

set -euo pipefail

DOMAIN="${DOMAIN:-go.sunnyrose.xyz}"
UPSTREAM="${UPSTREAM:-wave-mod.vercel.app}"
EMAIL="${EMAIL:-}"
# Cloudflare API Token 文件（DNS-01 用）。格式见 certbot-dns-cloudflare 文档：
#   dns_cloudflare_api_token = xxxxx
CF_CREDENTIALS="${CF_CREDENTIALS:-/root/.secrets/cloudflare.ini}"
ISSUE_CERT=0
ISSUE_CERT_DNS=0

for arg in "$@"; do
  case "$arg" in
    --issue-cert) ISSUE_CERT=1 ;;
    --issue-cert-dns) ISSUE_CERT_DNS=1 ;;
    --cf-credentials=*) CF_CREDENTIALS="${arg#*=}" ;;
    --domain=*) DOMAIN="${arg#*=}" ;;
    --upstream=*) UPSTREAM="${arg#*=}" ;;
    --email=*) EMAIL="${arg#*=}" ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "[!] 未知参数：$arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 跑：sudo bash $0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/../deploy/hk-proxy/nginx"
CONF_MAIN="$TEMPLATE_DIR/wavemod-proxy.conf.template"
CONF_COMMON="$TEMPLATE_DIR/wavemod-proxy-common.conf.template"

[[ -f "$CONF_MAIN" && -f "$CONF_COMMON" ]] || die \
  "找不到模板：$TEMPLATE_DIR
把 deploy/hk-proxy 整个目录和本脚本一起传上去（或者直接 clone 仓库）。"

LE_DIR="/etc/letsencrypt/live/$DOMAIN"
SELF_DIR="/etc/ssl/wavemod"
CERT_FILE="$LE_DIR/fullchain.pem"
KEY_FILE="$LE_DIR/privkey.pem"

# ── 1. 基础软件 ────────────────────────────────────────────────────────────
log "安装 nginx / certbot / openssl"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx openssl curl ca-certificates

# ── 2. 目录 ────────────────────────────────────────────────────────────────
log "准备目录"
mkdir -p /var/cache/nginx/wavemod /var/cache/nginx/wavemod_tmp
mkdir -p /var/www/letsencrypt
mkdir -p /etc/nginx/snippets "$SELF_DIR"

# ── 3. 证书：没有正式的先用自签占位 ────────────────────────────────────────
# 配置里固定引用同一组路径；有正式证书就指向 Let's Encrypt，没有就指向自签。
# 这样 nginx -t 永远能过，也不会出现「配置引用不存在的证书 → reload 失败」。
if [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]]; then
  echo "已有正式证书：$LE_DIR"
else
  warn "还没有 $DOMAIN 的正式证书，先放一张 30 天自签占位（浏览器会报不安全）"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -keyout "$SELF_DIR/selfsigned.key" -out "$SELF_DIR/selfsigned.crt" \
    -subj "/CN=$DOMAIN" >/dev/null 2>&1
  CERT_FILE="$SELF_DIR/selfsigned.crt"
  KEY_FILE="$SELF_DIR/selfsigned.key"
fi

# ── 4. 渲染配置 ────────────────────────────────────────────────────────────
render() {
  if [[ -f /etc/nginx/conf.d/wavemod-proxy.conf ]]; then
    cp /etc/nginx/conf.d/wavemod-proxy.conf \
       "/etc/nginx/conf.d/wavemod-proxy.conf.bak-$(date +%Y%m%d%H%M%S)"
  fi

  local sd
  sd='s|{{DOMAIN}}|'"$DOMAIN"'|g; s|{{UPSTREAM_HOST}}|'"$UPSTREAM"'|g; s|{{CERT_FILE}}|'"$CERT_FILE"'|g; s|{{KEY_FILE}}|'"$KEY_FILE"'|g'

  sed "$sd" "$CONF_COMMON" > /etc/nginx/snippets/wavemod-proxy-common.conf
  sed "$sd" "$CONF_MAIN"   > /etc/nginx/conf.d/wavemod-proxy.conf

  echo "已渲染："
  echo "  /etc/nginx/snippets/wavemod-proxy-common.conf"
  echo "  /etc/nginx/conf.d/wavemod-proxy.conf"
}

log "渲染 nginx 配置（域名 $DOMAIN → $UPSTREAM）"
render

# 默认站点会占掉 80 的 default_server，删掉避免行为不一致
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || systemctl restart nginx
echo "nginx 已加载新配置"

# ── 5. 每日 reload：让 upstream 重新解析 Vercel IP ─────────────────────────
# nginx 开源版只在启动时解析 upstream 里的域名。Vercel 的生产别名背后是
# anycast IP，平时不变，但换 IP 时没有这条 cron 就会一直打到旧 IP 上。
cat > /etc/cron.d/wavemod-nginx-reload <<'CRON'
# 每天凌晨 reload 一次 nginx，重新解析 upstream 域名（见 setup-hk-proxy.sh）
17 4 * * * root systemctl reload nginx >/dev/null 2>&1
CRON
chmod 0644 /etc/cron.d/wavemod-nginx-reload
echo "已安装每日 reload：/etc/cron.d/wavemod-nginx-reload"

# ── 6. 可选：签正式证书 ────────────────────────────────────────────────────
install_reload_hook() {
  # 续期后自动 reload，否则 nginx 还握着旧证书，直到下次手工重启才生效
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/wavemod-nginx <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/wavemod-nginx
}

apply_new_cert() {
  install_reload_hook
  # 重新渲染：这次会自动切到 Let's Encrypt 的路径
  CERT_FILE="$LE_DIR/fullchain.pem"
  KEY_FILE="$LE_DIR/privkey.pem"
  render
  nginx -t
  systemctl reload nginx
  echo "证书已签发并生效"
}

certbot_common_args() {
  CERTBOT_ARGS=(-d "$DOMAIN" --agree-tos --non-interactive)
  if [[ -n "$EMAIL" ]]; then
    CERTBOT_ARGS+=(-m "$EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi
}

if [[ "$ISSUE_CERT_DNS" -eq 1 ]]; then
  # DNS-01：不需要 A 记录已经指过来，也不需要 80 端口 —— 推荐在切 DNS **之前**
  # 签好，这样切换时不会出现「自签证书警告」的空窗。
  log "用 Cloudflare DNS-01 签发证书（不依赖 DNS 已切换）"
  apt-get install -y -qq python3-certbot-dns-cloudflare
  [[ -f "$CF_CREDENTIALS" ]] || die \
    "找不到 $CF_CREDENTIALS。先写一行：dns_cloudflare_api_token = <token>，权限只需 Zone.DNS.Edit。"
  chmod 600 "$CF_CREDENTIALS"

  certbot_common_args
  certbot certonly --dns-cloudflare --dns-cloudflare-credentials "$CF_CREDENTIALS" \
    --dns-cloudflare-propagation-seconds 30 "${CERTBOT_ARGS[@]}"
  apply_new_cert

elif [[ "$ISSUE_CERT" -eq 1 ]]; then
  log "检查 DNS 是否已指向本机（反了会吃 Let's Encrypt 速率限制）"
  PUBLIC_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
  RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
  echo "  本机公网 IP : ${PUBLIC_IP:-未知}"
  echo "  $DOMAIN 解析: ${RESOLVED:-未解析到}"
  if [[ -z "$PUBLIC_IP" || -z "$RESOLVED" || "$PUBLIC_IP" != "$RESOLVED" ]]; then
    warn "DNS 还没指到本机，跳过签发。把 A 记录切过来、TTL 生效后重跑："
    warn "  sudo bash $0 --issue-cert"
    warn "或者不切 DNS 也能签：sudo bash $0 --issue-cert-dns"
  else
    log "用 HTTP-01（webroot）签发 Let's Encrypt 证书"
    certbot_common_args
    certbot certonly --webroot -w /var/www/letsencrypt "${CERTBOT_ARGS[@]}"
    apply_new_cert
  fi
fi

# ── 7. 自检 ────────────────────────────────────────────────────────────────
log "自检"

echo -n "  直连 Vercel（不经过本机）: "
if curl -fsS --max-time 15 -o /dev/null -w 'HTTP %{http_code} / %{time_total}s\n' \
     "https://$UPSTREAM/api/updates?days=1"; then
  echo "  上游可达"
else
  warn "从香港机直连 Vercel 失败 —— 先查机器出网，再继续"
fi

echo -n "  经过本机 nginx（自签证书，-k）: "
if curl -kfsS --max-time 30 --resolve "$DOMAIN:443:127.0.0.1" \
     -o /dev/null -w 'HTTP %{http_code} / %{time_total}s\n' "https://$DOMAIN/"; then
  echo "  反代链路通"
else
  warn "本机 nginx 没回 200，看 journalctl -u nginx -n 50 和 /var/log/nginx/error.log"
fi

cat <<DONE

============================================================
装机已完成。剩下三件事必须手动做：
============================================================

【1】云厂商控制台放行端口
    HTTPS(443) 和 HTTP(80) 都要放行。
    ⚠️ 腾讯云轻量的 443 默认是**不放行**的，这一点在首尔机上踩过：
       nginx 本机 curl 200，外网却 timeout。安全组只能在控制台改。

【2】切 DNS（Cloudflare，灰云 / DNS only）
    把 ${DOMAIN} 的 A 记录指向本机公网 IP。
    切之前先把 TTL 降到 60 秒，并提前 24 小时做，别在低峰期才发现缓存没散。
    切完先验证：
      dig +short ${DOMAIN}        # 应该返回本机 IP

【3】DNS 生效后签正式证书
    sudo bash $0 --issue-cert${EMAIL:+ --email=$EMAIL}

常用命令：
    看缓存命中和耗时：tail -f /var/log/nginx/wavemod.access.log
    看错误：tail -f /var/log/nginx/error.log
    缓存占用：du -sh /var/cache/nginx/wavemod
    回滚：把 DNS 切回首尔机（43.133.78.46），TTL 60 秒内生效
    切回自托管前的清单见 docs/hk-proxy-runbook.md

DONE
