#!/usr/bin/env bash
#
# 给 nginx 的 443 监听打开 HTTP/2（幂等，可反复跑）。
#
# 背景：实测 go.sunnyrose.xyz / www.wave-mod.top 的 ALPN 协商结果是
#   ALPN: server accepted http/1.1   →   using HTTP/1.x
# 浏览器对同一个源只能开 6 条 HTTP/1.1 连接，而 /mods 一页就要发 100+ 个请求
# （HTML/JS/CSS + 60 多个头像），排队非常明显。开 HTTP/2 后一条连接多路复用，
# 这部分排队成本直接消失。
#
# 为什么必须是「独立的幂等脚本」而不是改 scripts/deploy-hk.sh：
#   deploy-hk.sh 第 146 行是 `cat > /etc/nginx/sites-available/wavemod`，里面
#   **只有 80 端口的两个 server 块**；443/ssl 那些行是后来 certbot 就地补上去的。
#   所以：① 那个文件里根本没有 `listen 443 ssl` 可以改；② 重跑 deploy-hk.sh 会
#   用 `cat >` 整体覆盖，把 certbot 写的 443 块连同证书配置一起抹掉。
#   本脚本在现有文件上做定点替换，并留备份，重复跑无副作用。
#
# 用法（服务器上，ubuntu 是 sudo 免密的）：
#   sudo bash enable-http2.sh
#
# 回滚：脚本每次改动前会把原文件备份成 <文件>.bak-<时间戳>，直接 cp 回来再
#       `nginx -t && systemctl reload nginx` 即可。
#
set -euo pipefail

NGINX_DIR="/etc/nginx/sites-available"
# 只碰这两个我们自己的 vhost；default 站没有被 enable（且它的 443 行是注释掉的），
# 这里也一并跳过。
TARGETS=("$NGINX_DIR/wavemod" "$NGINX_DIR/wavemod-alt")

log()  { echo -e "\033[1;34m[http2]\033[0m $*"; }
warn() { echo -e "\033[1;33m[http2]\033[0m $*"; }
die()  { echo -e "\033[1;31m[http2]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 sudo bash 运行（要写 /etc/nginx）"
command -v nginx >/dev/null || die "没找到 nginx"

# ---- 0. 先确认这份 nginx 编译时带了 http_v2 模块 ----
# Ubuntu 官方包默认带；确认一下，免得写进去之后 nginx -t 报 unknown directive。
if ! nginx -V 2>&1 | grep -q -- '--with-http_v2_module'; then
  die "这份 nginx 没有编译 http_v2 模块（nginx -V 里找不到 --with-http_v2_module），开不了 HTTP/2"
fi
log "nginx 版本：$(nginx -v 2>&1)（带 http_v2 模块）"

# nginx 1.25.1 起推荐用独立的 `http2 on;` 指令；本机是 1.18，
# 只在 listen 行上加 http2 参数才是正确写法（新指令在 1.18 上会报 unknown directive）。
NGINX_VER="$(nginx -v 2>&1 | sed -E 's#.*nginx/([0-9]+\.[0-9]+\.[0-9]+).*#\1#')"
log "按 ${NGINX_VER} 的语法处理：listen ... ssl http2"

# ---- 1. 定点替换：给每个 `listen ... ssl` 行补上 http2 ----
STAMP="$(date +%Y%m%d-%H%M%S)"
changed_any=0

for f in "${TARGETS[@]}"; do
  if [ ! -f "$f" ]; then
    warn "$f 不存在，跳过"
    continue
  fi

  before="$(grep -cE '^[[:space:]]*listen[[:space:]].*ssl' "$f" || true)"
  if [ "$before" -eq 0 ]; then
    warn "$f 里没有 listen ... ssl 行（证书还没签？），跳过"
    continue
  fi

  # 备份（每次跑都留一份，便于对照是哪一次改的）
  cp -a "$f" "${f}.bak-${STAMP}"

  # 只处理「以 listen 开头的有效行」，跳过注释行；已经有 http2 的不再动，保证幂等。
  #   listen 443 ssl;                     -> listen 443 ssl http2;
  #   listen [::]:443 ssl ipv6only=on;    -> listen [::]:443 ssl http2 ipv6only=on;
  sed -i -E '/^[[:space:]]*listen[[:space:]].*ssl/ { /http2/! s/([[:space:]]ssl)([[:space:]]|;)/\1 http2\2/ }' "$f"

  after="$(grep -cE '^[[:space:]]*listen[[:space:]].*ssl[[:space:]]+http2' "$f" || true)"
  log "$f：${before} 行 ssl 监听，其中 ${after} 行已带 http2"
  [ "$after" -ge "$before" ] || die "$f 替换不完整（${after}/${before}），请检查 ${f}.bak-${STAMP}"
  changed_any=1
done

[ "$changed_any" -eq 1 ] || die "没有任何文件被处理，什么都没做"

# ---- 2. 语法检查 + 平滑重载 ----
log "nginx -t …"
nginx -t || die "nginx 配置有语法错误，已中止（原文件备份在同目录 .bak-${STAMP}）"
systemctl reload nginx
log "已 reload"

# ---- 3. 自检 ----
echo
log "当前 443 监听："
grep -rnE '^[[:space:]]*listen[[:space:]].*443' "$NGINX_DIR" || true

echo
log "完成。验证 HTTP/2 是否真的生效（在服务器上跑，二选一）："
echo "    # A. 看 ALPN 协商结果，期望出现 h2 / \"ALPN protocol: h2\""
echo "    echo | openssl s_client -alpn h2 -connect 127.0.0.1:443 -servername www.wave-mod.top 2>/dev/null | grep -i alpn"
echo "    # B. 直接看协议版本，期望 HTTP/2 200"
echo "    curl -sS -o /dev/null -w '%{http_version}\\n' -k --resolve www.wave-mod.top:443:127.0.0.1 https://www.wave-mod.top/"
warn "curl 必须 7.47+ 且带 HTTP/2 支持；curl -V 里没有 'HTTP2' 的话，看到的是 http/1.1，不代表服务端没开。"
