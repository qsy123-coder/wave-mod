#!/usr/bin/env bash
# ============================================================================
# WaveMod 自建库每日备份
# ============================================================================
# 由 deploy/hk-db/install.sh 安装到 /usr/local/bin/wavemod-db-backup，
# 由 /etc/cron.d/wavemod-db-backup 每天 03:10 调用。
#
# 只做本机全量 dump（custom 格式）+ 保留 30 份；异地副本由
# .github/workflows/backup.yml 连同一个 DATABASE_URL 再跑一遍。
# ============================================================================
set -euo pipefail

DB_NAME="${DB_NAME:-wavemod}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wavemod}"
RETENTION="${RETENTION:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/${DB_NAME}-${STAMP}.dump"

install -d -m 0750 "${BACKUP_DIR}"

# -Fc：custom 格式，可用 pg_restore 选择性恢复；-Z6 已经够小（29MB 库）。
pg_dump -Fc -Z6 -d "${DB_NAME}" -f "${OUT}"

# 写一份校验和，恢复前可先核对
sha256sum "${OUT}" > "${OUT}.sha256"

# 只保留最近 N 份（按文件名排序，比 mtime 更稳）
find "${BACKUP_DIR}" -maxdepth 1 -name "${DB_NAME}-*.dump" -type f \
  | sort -r | tail -n +$((RETENTION + 1)) | xargs -r rm -f
find "${BACKUP_DIR}" -maxdepth 1 -name "${DB_NAME}-*.dump.sha256" -type f \
  | sort -r | tail -n +$((RETENTION + 1)) | xargs -r rm -f

echo "[$(date -Iseconds)] backup ok: ${OUT} ($(du -h "${OUT}" | cut -f1))"
