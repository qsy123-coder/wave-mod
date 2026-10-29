#!/usr/bin/env bash
# 在香港反代机上安装边缘接口进程（/api/engagement + /api/visits）。
#
# 用法（先把 deploy/hk-edge-api 整个目录 + 打好的 dist/server.mjs 一起 scp 到 /tmp/hk-edge-api）：
#   sudo bash /tmp/hk-edge-api/install.sh
#
# 密钥**不在**这里也不在 env.example：本脚本直接从 /etc/wavemod-engagement.env 抄
# ENGAGEMENT_REMOTE_SECRET，两套服务共用一个密钥，避免两处手抄漂移。
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "must run as root"; exit 1; }

SRC_DIR=$(cd "$(dirname "$0")" && pwd)
APP_DIR=/opt/wavemod-edge-api
ENGAGEMENT_ENV=/etc/wavemod-engagement.env

[[ -f "$ENGAGEMENT_ENV" ]] || { echo "缺少 $ENGAGEMENT_ENV，先装互动计数服务"; exit 2; }
[[ -f "$SRC_DIR/dist/server.mjs" ]] || { echo "缺少 dist/server.mjs，先在仓库跑 node scripts/build-hk-edge-api.mjs"; exit 2; }

SECRET=$(grep -E '^ENGAGEMENT_REMOTE_SECRET=' "$ENGAGEMENT_ENV" | head -1 | cut -d= -f2-)
[[ -n "$SECRET" ]] || { echo "$ENGAGEMENT_ENV 里没有 ENGAGEMENT_REMOTE_SECRET"; exit 2; }

NODE_BIN=$(command -v node || true)
[[ -n "$NODE_BIN" ]] || { echo "找不到 node（需要 >= 20）"; exit 2; }

install -d -m 0755 "$APP_DIR"
install -m 0755 "$SRC_DIR/dist/server.mjs" "$APP_DIR/server.mjs"

# 基线：仓库 data/engagement-baseline.json 的副本。已经存在就保留（重导基线不必重新装机）。
if [[ -f "$SRC_DIR/engagement-baseline.json" ]]; then
  install -m 0644 "$SRC_DIR/engagement-baseline.json" "$APP_DIR/engagement-baseline.json"
fi
[[ -f "$APP_DIR/engagement-baseline.json" ]] || { echo "缺少 $APP_DIR/engagement-baseline.json"; exit 2; }

umask 077
cat > /etc/wavemod-edge-api.env <<EOF
# 由 deploy/hk-edge-api/install.sh 生成，别手改（密钥来自 $ENGAGEMENT_ENV）
EDGE_API_HOST=127.0.0.1
EDGE_API_PORT=8792
ENGAGEMENT_STORE=remote
ENGAGEMENT_REMOTE_URL=http://127.0.0.1:8791
ENGAGEMENT_REMOTE_SECRET=$SECRET
ENGAGEMENT_BASELINE_PATH=$APP_DIR/engagement-baseline.json
EOF
chmod 600 /etc/wavemod-edge-api.env

# unit 里的 ExecStart 写死了 /usr/bin/node；装到别处就替换成实际路径
sed "s#/usr/bin/node#$NODE_BIN#" "$SRC_DIR/wavemod-edge-api.service" \
  > /etc/systemd/system/wavemod-edge-api.service
chmod 0644 /etc/systemd/system/wavemod-edge-api.service

systemctl daemon-reload
systemctl enable --now wavemod-edge-api
sleep 1
systemctl --no-pager --full status wavemod-edge-api | head -15

echo "--- 自检"
curl -s --max-time 5 http://127.0.0.1:8792/health; echo
