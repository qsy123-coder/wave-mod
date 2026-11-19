# 香港机自托管应用（2026-11-19 起）

## 为什么改

2026-11-19 00:00（+08）起全站后台 402：

```
HTTP/1.1 402 Payment Required
X-Vercel-Error: DEPLOYMENT_DISABLED
```

Vercel 把整个 `new-deploy2` team 做了 Fair-Use softBlock（Hobby 额度）。
前台当时还能进，是因为香港 nginx 对公开页在发 `X-Cache-Status: STALE` 的旧缓存；
`/admin/*` 是 BYPASS 直连上游，所以只有后台炸。

11 月用量（`GET /v2/usage`，到 11-18 16:00 UTC）：出网 **14.98 GB**（10 月同期 1.06 GB），
Hobby 的 Fast Origin Transfer 只有 10 GB，11-13 就已跨线。

## 现在是什么架构

```
访客 ──TLS──> 香港机 nginx（:443，代理缓存 / 页脚统计 / 快照转发）
                 └─ proxy_pass ──> 127.0.0.1:3000  (pm2: wavemod, next start)
                                       └─ PostgreSQL 17 @ 127.0.0.1:5432
                                       └─ COS / 边缘统计服务（8791/8792）
```

Vercel 不再在链路上。旧项目 `prj_W9fgQ4IkezyshouTUgzp1BGhjwD9` 保持暂停状态，
GitHub 集成已断开（不会再产生失败构建）。

## 部署 / 更新

```bash
ssh -i C:/Users/WINDOWS11/.ssh/wavemod_hk -p 28822 root@45.135.119.204 \
  'bash /var/www/wave-mod/scripts/deploy-hk-app.sh'
```

脚本做：`git reset --hard origin/main` → lockfile 变了才 `npm ci` →
`NODE_OPTIONS=--max-old-space-size=1536 npm run build` → `pm2 restart` →
清 nginx 缓存 → 冒烟。

## 环境变量

`/var/www/wave-mod/.env.production`（`chmod 600`）由 `/root/merge_env.py` 合成：

| 来源 | 说明 |
|---|---|
| `/root/wavemod.local.env` | 本机 `.env.local` 的副本 |
| `/root/wavemod.decrypted.env` | `scripts/vercel-dump-env.mjs` 解出来的 8 个 `encrypted` 变量 |
| `/etc/wavemod-edge-api.env` | `ENGAGEMENT_*` 三个 |
| 脚本常量 | `MODS_SNAPSHOT_URL=https://go.sunnyrose.xyz/__snapshot/mods-snapshot.json.gz` |

Vercel 里 26 个 `sensitive` 变量（COS/阿里云/DB 等）**读不回来**，凡本机 `.env.local`
没有的（阿里云 SMS/RAM 那把 key、`ADMIN_PHONES`、`SUPABASE_SERVICE_ROLE_KEY`）
在自托管环境里就是空的 —— 影响只有手机号登录，后台账号密码 / Cookie 登录不受影响。

## 回滚到 Vercel

前提是 Vercel 那边已解封（升级 Pro 或换账号重新导入）。

```bash
ssh -i C:/Users/WINDOWS11/.ssh/wavemod_hk -p 28822 root@45.135.119.204 'bash -s' <<'EOF'
F=/etc/nginx/conf.d/wavemod-proxy.conf
C=/etc/nginx/snippets/wavemod-proxy-common.conf
cp "$(ls -t $F.bak-selfhost-* | head -1)" $F
cp "$(ls -t $C.bak-selfhost-* | head -1)" $C
nginx -t && systemctl reload nginx
EOF
```

`pm2 delete wavemod` 停掉本机应用即可，`.env.production` 与 `.next/` 留着不影响。

## 已知坑

1. **2C2G 构建**：不加 `--max-old-space-size=1536` 会 OOM；`/swapfile` 2G 必须在。
2. **`.env.production` 里的值不要再包一层引号**：`next.config.ts` 会 `new URL()`，
   `NEXT_PUBLIC_SUPABASE_URL=\"https://…\"` 会导致 `ERR_INVALID_URL`，构建直接失败。
3. **缓存要手动清**：`rm -rf /var/cache/nginx/wavemod/*` 之后 `systemctl reload nginx`，
   否则首页仍是停摆前的旧快照（`/api/updates` 的 `today` 会停在旧日期）。
4. **每日上传脚本的 `/api/revalidate`** 现在打到本机应用，不再经过 Vercel；
   恢复后实测返回 `{"ok":true,...}`。
