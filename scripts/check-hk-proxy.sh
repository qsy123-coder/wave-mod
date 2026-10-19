#!/usr/bin/env bash
#
# 验收香港反代：从任意机器（大陆、香港、CI）打一遍关键路径，检查状态码与缓存行为。
#
# 用法：
#   bash scripts/check-hk-proxy.sh                          # 默认 https://go.sunnyrose.xyz
#   bash scripts/check-hk-proxy.sh https://hk.example.com   # 切 DNS 前用测试域名
#   bash scripts/check-hk-proxy.sh https://1.2.3.4 -k       # 自签证书阶段跳过校验
#
# 退出码非 0 = 有检查项失败，可以直接接进 CI 或监控。
#
# 检查什么：
#   - 首页 / 列表 / 详情 200
#   - /api/mods 第二次命中代理缓存（HIT），带 query 的请求不被缓存（BYPASS）
#   - `/_next/static` 命中缓存并且是 immutable
#   - /api/engagement 明确 BYPASS + no-store（per-device 数据，绝不能进缓存）
#   - 健康检查可用，证书剩余天数 > 7

set -uo pipefail

BASE="${1:-https://go.sunnyrose.xyz}"
BASE="${BASE%/}"
CURL_OPTS=()
if [[ "${2:-}" == "-k" || "${2:-}" == "--insecure" ]]; then
  CURL_OPTS=(-k)
fi

HOSTPORT="$(printf '%s' "$BASE" | sed -E 's#^https?://##; s#/.*##')"
HOST="${HOSTPORT%%:*}"
PORT=443
[[ "$HOSTPORT" == *:* ]] && PORT="${HOSTPORT##*:}"

PASS=0
FAIL=0

ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad()  { printf '\033[1;31m  ✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }

# 发一次请求，打印状态码与关键响应头；结果暂存到 $TMP 供断言
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

req() {
  curl -sS -m 60 "${CURL_OPTS[@]}" -o /dev/null -D "$TMP" -w '%{http_code} %{time_total}' "$@" || true
}

header() { grep -iE "^$1:" "$TMP" | head -1 | tr -d '\r' | sed -E 's/^[^:]+: *//'; }

expect_code() {
  local label="$1" url="$2" want="$3"
  local out code time
  out="$(req "$url")"
  code="${out%% *}"; time="${out##* }"
  if [[ "$code" == "$want" ]]; then
    ok "$label  HTTP $code  ${time}s"
  else
    bad "$label  期望 $want，实际 ${code:-无响应}  ${time}s"
  fi
}

echo "目标：$BASE"
echo

echo "[连通性]"
expect_code "首页"        "$BASE/"         200
expect_code "列表页"      "$BASE/mods"     200
expect_code "每日更新页"  "$BASE/updates"  200

echo
echo "[代理缓存]"
OUT="$(req "$BASE/api/mods?sort=new&pageSize=12")"
CACHE="$(header x-cache-status)"
[[ "${OUT%% *}" == 200 ]] && ok "/api/mods 冷请求 200" || bad "/api/mods 冷请求失败：${OUT%% *}"

OUT="$(req "$BASE/api/mods?sort=new&pageSize=12")"
CACHE="$(header x-cache-status)"
# HIT 是常态；STALE/UPDATING 表示「回旧值 + 后台刷新」，同样是缓存生效，不算失败
case "$CACHE" in
  HIT|STALE|UPDATING) ok "/api/mods 第二次命中缓存（$CACHE）" ;;
  *) bad "/api/mods 第二次应命中缓存，实际 ${CACHE:-无该响应头}" ;;
esac

OUT="$(req "$BASE/api/mods?sort=new&query=probe$RANDOM")"
CACHE="$(header x-cache-status)"
[[ "$CACHE" == "BYPASS" ]] && ok "带 query 的 /api/mods BYPASS" || bad "带 query 的 /api/mods 应 BYPASS，实际 ${CACHE:-无该响应头}"

OUT="$(req "$BASE/api/engagement?ids=00000000-0000-4000-8000-000000000000")"
CACHE="$(header x-cache-status)"
CC="$(header cache-control)"
if [[ "$CACHE" == "BYPASS" ]] && [[ "$CC" == *no-store* ]]; then
  ok "/api/engagement BYPASS + no-store"
else
  bad "/api/engagement 必须 BYPASS + no-store（实际 cache=$CACHE cc=$CC）—— 缓存它会串号"
fi

echo
echo "[静态资源]"
ASSET="$(curl -sS -m 30 "${CURL_OPTS[@]}" "$BASE/" | grep -o '/_next/static/[^" ]*\.js' | head -1)"
if [[ -n "$ASSET" ]]; then
  req "$BASE$ASSET" >/dev/null
  CACHE="$(header x-cache-status)"
  CC="$(header cache-control)"
  case "$CACHE" in
    MISS|HIT|STALE|UPDATING) ok "静态 chunk 可缓存（首次 $CACHE）" ;;
    *) bad "静态 chunk 未进缓存：${CACHE:-无该响应头}" ;;
  esac
  [[ "$CC" == *immutable* ]] && ok "静态 chunk 带 immutable" || bad "静态 chunk 缺 immutable：${CC:-空}"
else
  bad "首页里找不到 /_next/static 资源，页面可能没渲染出来"
fi

echo
echo "[健康检查]"
expect_code "/__health"         "$BASE/__health"         200
expect_code "/__health/origin"  "$BASE/__health/origin"  200

echo
echo "[证书]"
EXPIRY="$(echo | openssl s_client -servername "$HOST" -connect "$HOST:$PORT" 2>/dev/null \
          | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
if [[ -n "$EXPIRY" ]]; then
  DAYS=$(( ( $(date -d "$EXPIRY" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 ))
  if [[ "$DAYS" -ge 7 ]]; then
    ok "证书剩余 ${DAYS} 天（到期 $EXPIRY）"
  else
    bad "证书只剩 ${DAYS} 天，续期可能没跑（到期 $EXPIRY）"
  fi
else
  bad "读取不到证书信息"
fi

echo
echo "结果：$PASS 通过 / $FAIL 失败"
[[ "$FAIL" -eq 0 ]]
