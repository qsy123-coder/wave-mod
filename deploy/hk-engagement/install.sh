#!/usr/bin/env bash
# 在香港反代机上安装互动计数服务。
#
# 用法（先把整个 deploy/hk-engagement 目录 scp 到 /tmp/hk-engagement）：
#   sudo bash /tmp/hk-engagement/install.sh
#
# 密钥不在这里：/etc/wavemod-engagement.env 需要事先放好（600），内容见 env.example。
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "must run as root"; exit 1; }

SRC_DIR=$(cd "$(dirname "$0")" && pwd)
APP_DIR=/opt/wavemod-engagement
STATE_DIR=/var/lib/wavemod-engagement

install -d -m 0755 "$APP_DIR"
install -m 0755 "$SRC_DIR/service.py" "$APP_DIR/service.py"

install -d -m 0700 "$STATE_DIR"

install -m 0644 "$SRC_DIR/wavemod-engagement.service" /etc/systemd/system/wavemod-engagement.service

if [[ ! -f /etc/wavemod-engagement.env ]]; then
  echo "缺少 /etc/wavemod-engagement.env（参考 $SRC_DIR/env.example），拒绝安装"
  exit 2
fi
chmod 600 /etc/wavemod-engagement.env

systemctl daemon-reload
systemctl enable --now wavemod-engagement
systemctl --no-pager --full status wavemod-engagement | head -20
