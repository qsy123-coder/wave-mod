#!/usr/bin/env bash
#
# WaveMod 香港服务器一键部署（PM2 + Nginx 路线，不用 Docker）
#
# 目标系统：Ubuntu 22.04 / 24.04（腾讯云或阿里云香港轻量，2核2G 起）
# 用法：    sudo bash scripts/deploy-hk.sh
#
# 前置：先把 .env.production 放到 /var/www/wave-mod/.env.production
#       （脚本会检查，缺了直接退出，不会拿半套配置去构建）
#
# 脚本做这些事：
#   1. 加 2G swap（2核2G 构建 Next 16 会 OOM，swap 是必需的）
#   2. 装 Node 22 / git / nginx / certbot / pm2
#   3. clone 仓库到 /var/www/wave-mod
#   4. npm ci && npm run build
#   5. pm2 起服务 + 开机自启
#   6. 配 Nginx（apex → www 跳转 + 反代）
#   7. 打印剩下要手动做的事（DNS 与证书，顺序不能反）
#
# 刻意不做的事：
#   - 不申请 SSL 证书。certbot 要求域名已经解析到本机，所以必须等 DNS 切过来之后再跑，
#     否则会失败并可能触发 Let's Encrypt 的速率限制。见脚本结尾的提示。
#   - 不动防火墙。云厂商的安全组要在控制台放行 22/80/443，脚本里开 ufw 是白开。

set -euo pipefail

REPO_URL="https://github.com/qsy123-coder/wave-mod.git"
APP_DIR="/var/www/wave-mod"
SITE_DOMAIN="wave-mod.top"
WWW_DOMAIN="www.wave-mod.top"
NODE_MAJOR=22
SWAP_SIZE="2G"
# 首次部署时 APP_DIR 还不存在，环境变量先落到这里过渡（见第 4 步）
STAGING_ENV="/root/wavemod.env.production"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 跑：sudo bash $0"

# ── 1. swap ────────────────────────────────────────────────────────────────
# Next 16 的构建会开 20+ 个 worker，2G 内存必然 OOM。没有 swap 就先加一块。
log "检查 swap"
if swapon --show | grep -q .; then
  echo "已有 swap，跳过："
  swapon --show
else
  echo "无 swap，创建 ${SWAP_SIZE} ..."
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap 已启用并写入 /etc/fstab："
  swapon --show
fi

# ── 2. 基础软件 ────────────────────────────────────────────────────────────
log "安装基础软件（Node ${NODE_MAJOR} / git / nginx / certbot）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git nginx

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
echo "node $(node -v) / npm $(npm -v)"

apt-get install -y -qq certbot python3-certbot-nginx
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# ── 3. 拉代码 ──────────────────────────────────────────────────────────────
log "拉取代码到 ${APP_DIR}"
mkdir -p "$(dirname "$APP_DIR")"
if [[ -d "$APP_DIR/.git" ]]; then
  echo "目录已存在，执行 git pull"
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi

# ── 4. 环境变量 ────────────────────────────────────────────────────────────
# 两种放置方式都支持：
#   a) 已经放好 $APP_DIR/.env.production
#   b) 先 scp 到 $STAGING_ENV —— 这是**推荐做法**：首次部署时 APP_DIR 还不存在，
#      而且 git clone 要求目标目录为空，所以直接往 APP_DIR 里塞文件会两头堵。
log "检查 .env.production"
if [[ ! -f "$APP_DIR/.env.production" && -f "$STAGING_ENV" ]]; then
  echo "从 ${STAGING_ENV} 取到环境变量，移入 ${APP_DIR}/"
  mv "$STAGING_ENV" "$APP_DIR/.env.production"
fi

[[ -f "$APP_DIR/.env.production" ]] || die \
  "缺少环境变量文件。

在本地执行（把 <服务器IP> 换掉）：
  scp .env.production root@<服务器IP>:${STAGING_ENV}

然后重新跑本脚本，它会自己移到位。

注意：本项目的 NEXT_PUBLIC_SITE_URL 必须是 https://${WWW_DOMAIN}，
auth-actions.ts 的 getBaseUrl() 优先读它，登录回调用得到。"

# NEXT_PUBLIC_* 是编译期内联进产物的，改了必须重新构建 —— 顺手告警一次
if ! grep -q "^NEXT_PUBLIC_SITE_URL=https://${WWW_DOMAIN}$" "$APP_DIR/.env.production"; then
  warn "NEXT_PUBLIC_SITE_URL 不是 https://${WWW_DOMAIN}，当前值："
  grep '^NEXT_PUBLIC_SITE_URL=' "$APP_DIR/.env.production" || echo "(未设置)"
  warn "登录回调可能跳到错误域名。确认无误再继续（5 秒后继续，Ctrl+C 可中断）"
  sleep 5
fi

# ── 5. 构建 ────────────────────────────────────────────────────────────────
log "安装依赖并构建（2核2G 约需 5-15 分钟，请耐心等）"
cd "$APP_DIR"
npm ci
# 限制堆上限，配合 swap 避免构建被 OOM killer 杀掉
NODE_OPTIONS="--max-old-space-size=1536" npm run build

# ── 6. PM2 ─────────────────────────────────────────────────────────────────
log "用 PM2 启动"
# 单实例是刻意的：本项目有几十处 revalidateTag/revalidatePath，
# 自托管下它们只清当前实例的缓存，多实例会出现新旧数据不一致。
if pm2 describe wavemod >/dev/null 2>&1; then
  pm2 restart wavemod --update-env
else
  pm2 start npm --name wavemod --cwd "$APP_DIR" -- start
fi
pm2 save
# 开机自启：pm2 startup 会打印一条命令，这里直接抓出来执行
STARTUP_CMD="$(pm2 startup systemd -u root --hp /root | tail -n 1)"
[[ "$STARTUP_CMD" == sudo* || "$STARTUP_CMD" == env* ]] && eval "$STARTUP_CMD" || true
pm2 status

log "本机自检"
sleep 3
if curl -fsS -o /dev/null -w '  127.0.0.1:3000 -> HTTP %{http_code}\n' http://127.0.0.1:3000/; then
  echo "  应用已就绪"
else
  warn "本机 3000 端口没回 200，先看日志：pm2 logs wavemod --lines 50"
fi

# ── 7. Nginx ───────────────────────────────────────────────────────────────
log "配置 Nginx"
cat > /etc/nginx/sites-available/wavemod <<NGINX
# apex 301 到 www：站点规范域名是 www，避免两套域名各存一份缓存
server {
    listen 80;
    listen [::]:80;
    server_name ${SITE_DOMAIN};

    return 301 https://${WWW_DOMAIN}\$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${WWW_DOMAIN};

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/wavemod /etc/nginx/sites-enabled/wavemod
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 8. 收尾 ────────────────────────────────────────────────────────────────
cat <<DONE

============================================================
部署脚本已跑完。剩下四件事必须手动做，顺序不能反：
============================================================

【1】云厂商控制台放行端口
    安全组放行 22 / 80 / 443。本机 ufw 不开没关系，安全组才是真正的门。

【2】切换 DNS（Cloudflare）
    把 ${WWW_DOMAIN} 和 ${SITE_DOMAIN} 的 A 记录都指向本机公网 IP。
    ── 保持「灰云 / DNS only」── 这套部署不依赖 CF 的 CDN，
    开橙云反而会多一层看不懂的缓存。

【3】DNS 生效后再申请证书（顺序反了会失败并吃 Let's Encrypt 速率限制）
    dig +short ${WWW_DOMAIN}          # 先确认返回的是本机 IP
    certbot --nginx -d ${SITE_DOMAIN} -d ${WWW_DOMAIN}
    certbot 会自己改 Nginx 配置并配好自动续期。

【4】Supabase 后台改回调地址
    Authentication → URL Configuration：
      Site URL      : https://${WWW_DOMAIN}
      Redirect URLs : https://${WWW_DOMAIN}/auth/callback
                      https://${SITE_DOMAIN}/auth/callback
    不改的话登录会失败或跳回旧域名。

常用命令：
    更新代码：cd ${APP_DIR} && git pull && npm ci && npm run build && pm2 restart wavemod
    应用日志：pm2 logs wavemod
    Nginx 日志：tail -f /var/log/nginx/error.log
DONE
