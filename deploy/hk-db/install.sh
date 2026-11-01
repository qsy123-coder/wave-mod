#!/usr/bin/env bash
# ============================================================================
# WaveMod 自建 PostgreSQL + pgbouncer 装机脚本（香港反代机）
# ============================================================================
# 适用：Ubuntu 22.04，2C/1.9G/30G，已有 nginx（deploy/hk-proxy）。
#
# 用法（在服务器上以 root 执行）：
#   DB_PASSWORD='<32位随机密码>' \
#   ADMIN_BASIC_USER='waveadmin' \
#   ADMIN_BASIC_PASSWORD='<后台密码>' \
#   DB_DOMAIN='db.sunnyrose.xyz' \
#   bash deploy/hk-db/install.sh
#
# 可选：CF_DNS_API_TOKEN=... 时用 DNS-01 签 db 子域证书（推荐，零空窗）。
#
# 这个脚本只做「装机 + 建库 + 建 htpasswd」，不改 nginx 站点配置；
# nginx 的 Basic Auth 配置由 deploy/hk-proxy 的模板提供，重跑 setup-hk-proxy.sh 生效。
#
# 幂等：重复执行会改角色密码、重渲染配置、重启服务，不会丢数据。
# ============================================================================
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 执行。" >&2
  exit 1
fi

DB_NAME="${DB_NAME:-wavemod}"
DB_USER="${DB_USER:-wavemod_app}"
DB_DOMAIN="${DB_DOMAIN:-db.sunnyrose.xyz}"
ADMIN_BASIC_USER="${ADMIN_BASIC_USER:-}"
ADMIN_BASIC_PASSWORD="${ADMIN_BASIC_PASSWORD:-}"

if [[ -z "${DB_PASSWORD:-}" ]]; then
  echo "缺少 DB_PASSWORD（应用角色的数据库密码）。" >&2
  exit 1
fi
if [[ -z "${ADMIN_BASIC_USER}" || -z "${ADMIN_BASIC_PASSWORD}" ]]; then
  echo "缺少 ADMIN_BASIC_USER / ADMIN_BASIC_PASSWORD（后台 Basic Auth 凭据）。" >&2
  exit 1
fi
# 只允许字母数字，避免把引号/反斜杠带进 SQL 与 userlist。
if [[ ! "${DB_PASSWORD}" =~ ^[A-Za-z0-9]+$ ]]; then
  echo "DB_PASSWORD 只允许字母数字（建议 32 位随机串）。" >&2
  exit 1
fi
if [[ ! "${DB_USER}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "DB_USER 只能是小写字母/数字/下划线。" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "== 1/8 安装 PostgreSQL 17 与 pgbouncer =="
apt-get update
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release apache2-utils certbot python3-certbot-dns-cloudflare

install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17 pgbouncer

echo "== 2/8 写入 PostgreSQL 调优片段 =="
install -d /etc/postgresql/17/main/conf.d
install -m 0644 "${SCRIPT_DIR}/postgresql.conf.snippet" /etc/postgresql/17/main/conf.d/wavemod.conf
pg_ctlcluster 17 main restart

echo "== 3/8 建应用角色与数据库 =="
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = '${DB_USER}') then
    create role ${DB_USER} login password '${DB_PASSWORD}';
  else
    alter role ${DB_USER} with login password '${DB_PASSWORD}';
  end if;
end
\$\$;
SQL

if ! sudo -u postgres psql -tAc "select 1 from pg_database where datname = '${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi

# 应用角色只拥有自己的库，不是超级用户；schema public 归它所有。
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" <<SQL
alter database ${DB_NAME} owner to ${DB_USER};
grant all on schema public to ${DB_USER};
alter default privileges in schema public grant all on tables to ${DB_USER};
alter default privileges in schema public grant all on sequences to ${DB_USER};
alter default privileges in schema public grant all on functions to ${DB_USER};
SQL

echo "== 4/8 配置 pgbouncer =="
sed -e "s/{{DB_NAME}}/${DB_NAME}/g" \
    -e "s/{{DB_USER}}/${DB_USER}/g" \
    -e "s/{{DB_DOMAIN}}/${DB_DOMAIN}/g" \
    "${SCRIPT_DIR}/pgbouncer.ini.template" > /etc/pgbouncer/pgbouncer.ini

# pgbouncer 的 scram-sha-256 支持 userlist 里写明文（启动时自行派生）
printf '"%s" "%s"\n' "${DB_USER}" "${DB_PASSWORD}" > /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/userlist.txt /etc/pgbouncer/pgbouncer.ini
chmod 600 /etc/pgbouncer/userlist.txt
chmod 640 /etc/pgbouncer/pgbouncer.ini

systemctl enable pgbouncer
if [[ -d "/etc/letsencrypt/live/${DB_DOMAIN}" ]]; then
  systemctl restart pgbouncer
else
  echo "⚠️  证书尚未就绪，pgbouncer 先不启动（见下一步）。"
fi

echo "== 5/8 证书（${DB_DOMAIN}） =="
if [[ -d "/etc/letsencrypt/live/${DB_DOMAIN}" ]]; then
  echo "已存在证书，跳过签发。"
elif [[ -n "${CF_DNS_API_TOKEN:-}" ]]; then
  install -d /root/.secrets
  printf 'dns_cloudflare_api_token = %s\n' "${CF_DNS_API_TOKEN}" > /root/.secrets/cloudflare.ini
  chmod 600 /root/.secrets/cloudflare.ini
  certbot certonly --dns-cloudflare \
    --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
    -d "${DB_DOMAIN}" --non-interactive --agree-tos \
    --email "${CERTBOT_EMAIL:-admin@sunnyrose.xyz}"
else
  echo "⚠️  没有证书也没给 CF_DNS_API_TOKEN：pgbouncer 会因找不到证书起不来。"
  echo "    先加 DNS A 记录 ${DB_DOMAIN} → 本机公网 IP，再二选一："
  echo "      CF_DNS_API_TOKEN=... bash deploy/hk-db/install.sh"
  echo "      或 certbot certonly --nginx -d ${DB_DOMAIN}"
  echo "    签完后 systemctl restart pgbouncer"
fi

if [[ -d "/etc/letsencrypt/live/${DB_DOMAIN}" ]]; then
  systemctl restart pgbouncer
fi

# 续期后自动重启 pgbouncer（否则它会继续用旧证书直到重启）
install -d /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/wavemod-pgbouncer <<'EOF'
#!/bin/sh
systemctl restart pgbouncer
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/wavemod-pgbouncer

echo "== 6/8 后台 Basic Auth（nginx htpasswd） =="
htpasswd -bc /etc/nginx/.htpasswd.wavemod "${ADMIN_BASIC_USER}" "${ADMIN_BASIC_PASSWORD}"
chown root:www-data /etc/nginx/.htpasswd.wavemod
chmod 640 /etc/nginx/.htpasswd.wavemod

echo "== 7/8 每日备份 =="
install -m 0755 "${SCRIPT_DIR}/backup.sh" /usr/local/bin/wavemod-db-backup
install -d -m 0750 /var/backups/wavemod
cat > /etc/cron.d/wavemod-db-backup <<EOF
# 每天 03:10 本地全量备份，保留 30 份
10 3 * * * root DB_NAME=${DB_NAME} /usr/local/bin/wavemod-db-backup >> /var/log/wavemod-db-backup.log 2>&1
EOF
chmod 0644 /etc/cron.d/wavemod-db-backup

echo "== 8/8 自检 =="
sudo -u postgres psql -tAc "select version()"
ss -ltnp | grep -E ':5432|:6432' || true
systemctl --no-pager --lines=0 status pgbouncer || true

cat <<EOF

✅ 装机完成。还差三步（控制台/手工）：

1. 腾讯云轻量防火墙放行 **6432**（本机 ufw 是 inactive，改它没用）。
2. DNS：A 记录 ${DB_DOMAIN} → 本机公网 IP（Cloudflare 灰云）。
3. 在本地仓库执行 migrate + verify（见 deploy/hk-db/README.md）：
     node scripts/migrate-supabase-to-hk.mjs
     node scripts/verify-migration.mjs

应用连接串（Vercel 的 DATABASE_URL）：
  postgresql://${DB_USER}:<DB_PASSWORD>@${DB_DOMAIN}:6432/${DB_NAME}?sslmode=verify-full
EOF
