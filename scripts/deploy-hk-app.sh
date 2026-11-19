#!/usr/bin/env bash
#
# 在香港机上把 wave-mod 应用本身拉起来 / 更新到最新 main（PM2 + next start）。
#
# 背景：2026-11-19 Vercel 因 Hobby 额度把整个 team softBlock（402 DEPLOYMENT_DISABLED），
# 香港 nginx 原来只做反代，暂停后后台直接不可用。改成香港机自己跑应用后，
# 站点与后台都不再依赖 Vercel。
#
# 用法（在服务器上跑，或从本机 ssh 调）：
#   ssh -i C:/Users/WINDOWS11/.ssh/wavemod_hk -p 28822 root@45.135.119.204 \
#     'bash /var/www/wave-mod/scripts/deploy-hk-app.sh'
#
# 做的事：
#   1. git fetch + reset --hard origin/main
#   2. lockfile 变了才 npm ci
#   3. next build（2C2G 机器必须限堆，靠 2G swap 兜住）
#   4. pm2 restart（首次则 start）
#   5. 清 nginx 缓存 + reload，然后跑一遍冒烟
#
# 刻意不做：不碰 .env.production（那个文件由 /root/merge_env.py 生成，手工维护）。

set -euo pipefail

APP_DIR="/var/www/wave-mod"
PM2_NAME="wavemod"
PORT="3000"
BASE="https://go.sunnyrose.xyz"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

cd "$APP_DIR"

[[ -f .env.production ]] || { echo "[x] 缺 .env.production"; exit 1; }

log "拉取 latest main"
BEFORE=$(git rev-parse HEAD)
git fetch --depth=1 origin main
git reset --hard origin/main
AFTER=$(git rev-parse HEAD)
echo "    $BEFORE -> $AFTER"
git --no-pager log -1 --format='    %h %s'

log "依赖"
if [[ ! -d node_modules ]] || ! git diff --quiet "$BEFORE" "$AFTER" -- package-lock.json; then
  npm ci --no-audit --no-fund
else
  echo "    package-lock.json 未变化，跳过 npm ci"
fi

log "构建"
NODE_OPTIONS="--max-old-space-size=1536" NEXT_TELEMETRY_DISABLED=1 npm run build

log "重启应用"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start node_modules/next/dist/bin/next --name "$PM2_NAME" -- start -p "$PORT"
fi
pm2 save >/dev/null
sleep 5

log "清 nginx 缓存并 reload"
rm -rf /var/cache/nginx/wavemod/*
nginx -t
systemctl reload nginx

log "冒烟"
fail=0
for p in / /mods /updates /admin/login /api/updates; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PORT}${p}")
  printf '    %-18s %s\n' "$p" "$code"
  [[ "$code" =~ ^(200|401|308)$ ]] || fail=1
done

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${BASE}/api/updates")
printf '    外网 /api/updates  %s\n' "$code"

pm2 describe "$PM2_NAME" | sed -n '1,12p'

if [[ $fail -ne 0 ]]; then
  echo "[x] 冒烟失败，看 pm2 logs ${PM2_NAME} --lines 80"
  exit 1
fi

log "完成：${AFTER:0:7}"
