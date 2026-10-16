#!/usr/bin/env bash
#
# WaveMod 自托管（腾讯云首尔）日常更新脚本 —— 把部署停机从「整个 build」压到「切换那几秒」。
#
# 用法（在服务器上）：
#   sudo setsid nohup bash /tmp/deploy-update.sh < /dev/null &
#   # 然后看日志：/tmp/wm-deploy-<目标短 sha>.log
#
# 为什么不是「stop -> build -> start」（旧做法，2026-10-17 之前）：
#   .next 在自托管下是持久目录，线上进程直接从它读 chunk。旧顺序在后端停掉的整整
#   ~100 秒里没人听 3000，而 nginx 只有一条 proxy_pass、没有 upstream 兜底，
#   于是每次部署稳定产出一百秒的 502（nginx error.log 实录：单日 492 次）。
#   反过来「先 build 再停」也不行：next build 会就地改写正在服务的 .next，
#   跑着的进程会引用到已被替换的 chunk（整页变无样式纯 HTML / MODULE_NOT_FOUND）。
#
# 本脚本的做法：
#   1. 构建写进 .next-staging（NEXT_DIST_DIR，见 next.config.ts），**线上进程全程不受影响**；
#   2. 构建成功后才 stop -> rm .next -> mv -> start，停机只剩这几秒；
#   3. 构建失败就在第 2 步之前退出 —— 线上继续跑旧版本，等于零影响。
#
# 日志全 ASCII：它要经 PowerShell 5.1 读回来，中文会被按 GBK 解成乱码。
# 本文件必须 LF 结尾：CRLF 会让 bash 去执行 `set -uo pipefail\r`。
set -uo pipefail

APP_DIR=/var/www/wave-mod
cd "$APP_DIR" || { echo "FAIL: cd $APP_DIR"; exit 1; }

[[ $EUID -eq 0 ]] || { echo "FAIL: must run as root (pm2 lives under root)"; exit 1; }

# 日志名带**目标**提交的短 sha：同一次部署重跑会落到同一个文件（截断重写），
# 不同提交永远不同名 —— 避免把上次 run 的日志尾巴误读成这次的结果。
git fetch --quiet origin main 2>/dev/null || true
TARGET=$(git rev-parse --short origin/main 2>/dev/null || git rev-parse --short HEAD)
LOG=/tmp/wm-deploy-$TARGET.log
exec > "$LOG" 2>&1

echo "=== start $(date -u +%FT%TZ) target=$TARGET ==="

OLD=$(git rev-parse HEAD)
echo "old: $OLD"

git pull --ff-only || { echo "FAIL: git pull"; exit 2; }
NEW=$(git rev-parse HEAD)
echo "new: $NEW"

if git diff --quiet "$OLD" "$NEW" -- package.json package-lock.json; then
  echo "deps unchanged -> skip npm ci"
else
  echo "deps changed -> npm ci"
  npm ci || { echo "FAIL: npm ci"; exit 4; }
fi

# ── 1. 旁路构建：线上进程照常服务旧的 .next ───────────────────────────────────
echo "staging build -> .next-staging (live app keeps serving)"
rm -rf .next-staging
mkdir -p .next-staging
# 带上构建缓存（使这次构建接近增量）。用**拷贝**不用软链：软链会在
# `mv .next-staging .next` 之后变成 .next/cache -> ../.next/cache 自指。
if [ -d .next/cache ]; then
  cp -a .next/cache .next-staging/cache && echo "build cache carried over"
fi
NEXT_DIST_DIR=.next-staging npm run build || { echo "FAIL: build (live site untouched)"; exit 5; }

# Next 会按 distDir 自动往 tsconfig.json 的 include 里补 `<distDir>/types/**/*.ts`，
# 于是每次构建都把 tsconfig.json 改脏。留在工作区是个雷：将来某个提交真去动
# tsconfig.json 时，`git pull --ff-only` 会因「本地改动会被覆盖」直接失败。
# 构建完即还原（还原到索引版本 = 本次 pull 进来的那一版），只丢 Next 的自动改写。
if ! git diff --quiet -- tsconfig.json; then
  git checkout -- tsconfig.json && echo "reverted next's tsconfig churn"
fi

# ── 2. 切换：只剩 stop/rm/mv/start 这几秒 ────────────────────────────────────
echo "cutover"
pm2 stop wavemod || { echo "FAIL: pm2 stop"; exit 7; }

# 旧产物留成 .next-previous 而不是直接删：万一新构建起不来，可以
#   rm -rf .next && mv .next-previous .next && pm2 start wavemod
# 一条命令回滚。每次部署会重新覆盖它，不会累积。
if [ -d .next ]; then
  rm -rf .next-previous
  mv .next .next-previous || { echo "FAIL: keep previous"; exit 10; }
fi

mv .next-staging .next || { echo "FAIL: mv staging"; exit 9; }

pm2 start wavemod || {
  echo "FAIL: pm2 start -- rollback with: rm -rf .next && mv .next-previous .next && pm2 start wavemod"
  exit 6
}

echo "=== DEPLOY_OK $(date -u +%FT%TZ) ==="
