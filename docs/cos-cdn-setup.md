# COS 图片挂腾讯云 CDN（让滚动图片不再排队）

> **当前状态（2026-11-24 起）**：
> - **图片**默认直连 COS 广州源站，不再走境外 CDN。实测同一张 960 档图（125KB），
>   大陆直连源站 0.36s，境外 CDN 各节点 2.1–7.9s（且实际是 HTTP/1.1，并没有 h2）。
>   详情页首图、多图切换、列表卡片图全在这个域名上，2–8 秒就是「预览图很慢」的来源。
> - **视频/封面**仍走 `https://cdn.sunnyrose.xyz`（`NEXT_PUBLIC_COS_VIDEO_BASE`）：
>   COS 源站对 `tutorial/` 下的对象回 `Content-Disposition: attachment`，
>   Safari / iOS / 微信会把 `<video>` 当下载。
> - 生产 `.env.production`：
>   ```
>   NEXT_PUBLIC_COS_IMAGE_BASE=https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com
>   NEXT_PUBLIC_COS_VIDEO_BASE=https://cdn.sunnyrose.xyz
>   ```
> - 日后域名备案、有了**境内** CDN，把 `NEXT_PUBLIC_COS_IMAGE_BASE` 换成境内 CDN
>   即可，代码不用改。

**背景**：WaveMod 的 COS 默认域名是 **HTTP/1.1**，浏览器对同一域名最多 6 条并发连接。
一个角色分类页一次要下 16–32 张卡片图，只能 6 张一批地排队，所以筛选/滚动时会看到整屏图片骨架。
aetouban 的图片走 `cdn.aetouban.cn`（腾讯云 CDN，境外节点 + HTTP/2 + 边缘缓存），24 张图可以并行、且多数直接命中缓存。

**代码侧已就绪**：设置 `NEXT_PUBLIC_COS_IMAGE_BASE` 后，卡片图、预览图、角色头像会自动从
`*.cos.ap-guangzhou.myqcloud.com` 改写到 CDN 域名，保留对象路径和 `imageMogr2` 参数。

---

## 1. 腾讯云 CDN 添加加速域名

控制台 → CDN → 域名管理 → 添加域名：

| 项 | 值 |
|---|---|
| 加速域名 | 例如 `cdn.sunnyrose.xyz` |
| 加速区域 | **境外/全球**（中国大陆节点要求域名 ICP 备案；`xyz` 未备案就选境外，aetouban 也是境外节点） |
| 源站类型 | COS 源站 → 选择桶 `wave-mod-preview-1327973389`（广州） |
| 回源协议 | HTTPS |
| 回源端口 | 443 |
| HTTP/2 | 开启（CDN 默认） |
| 缓存 | 按扩展名 `webp;jpg;jpeg;png;avif;gif` 缓存 **7 天**；保留查询参数（`imageMogr2` 的参数要参与缓存键） |
| HTTPS 证书 | 腾讯云免费证书或上传证书 |

添加后腾讯云会给一个 CNAME，例如 `xxx.cdn.dnsv1.com`。

## 2. DNS（Cloudflare）

在 Cloudflare 给 `sunnyrose.xyz` 添加：

```
cdn  CNAME  xxx.cdn.dnsv1.com   （DNS only，灰云）
```

> 必须是灰云。CDN 前面再套一层 Cloudflare 代理会冲突，也会丢掉 CDN 的 HTTP/2/缓存行为。

## 3. 验证 CDN

```bash
curl -I "https://cdn.sunnyrose.xyz/character-imgs/%E7%88%B1%E5%BC%A5%E6%96%AF.webp"
```

应看到 200、`Content-Type: image/webp`，并带 CDN 的缓存头。等几分钟首次回源后，
再请求应出现 `X-Cache-Lookup: Cache Hit`（或同类命中头）。

## 4. 设置环境变量并重新部署

香港机 `/var/www/wave-mod/.env.production`（`NEXT_PUBLIC_*` 在构建期内联，
改完必须重新 `npm run build` + `pm2 restart`）：

```
# 图片：默认源站（大陆快）；有了境内 CDN 才换成 CDN 域名
NEXT_PUBLIC_COS_IMAGE_BASE = https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com
# 视频/封面：必须留在 CDN（源站 force-download 会让 Safari 当下载）
NEXT_PUBLIC_COS_VIDEO_BASE = https://cdn.sunnyrose.xyz
```

部署后前台图片 URL 会是：

```
https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/.../preview.webp?imageMogr2/thumbnail/320x%3E/format/webp
https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/character-imgs/xxx.webp
```

## 5. 验收

```bash
# 详情页首图预载 + 档位耗时 + 缩略图字节预算，一条命令全查
node scripts/verify-preview-image-perf.mjs
node scripts/verify-preview-image-perf.mjs --expect-host=wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com
```

脚本会断言：HTML 里只有一条抽屉首图 preload（列表卡片不再抢带宽）、
`imageSrcSet` 覆盖 640/960/1280/1920、热请求 TTFB ≤ 1.2s、首图 ≤ 260KB、
缩略图单张 ≤ 40KB。任何一条回退都会非 0 退出。

## 注意事项

- CDN 流量会单独计费：在腾讯云 CDN 控制台加**用量告警**（如 80%）和月度上限。
- COS 桶保持公有读；如担心盗链，可在 CDN 配 Referer 白名单（先确认内置浏览器/隐私模式不剥 Referer）。
- 源站 COS 在**广州**。这个 CDN 是**境外**加速（域名未备案走不了境内节点），
  对大陆访客反而更慢 —— 这就是图片改回源站的原因。视频量小、且必须靠 CDN 去掉
  force-download 头，所以单独保留。
- 以后备案完成 / 换境内 CDN，只改 `NEXT_PUBLIC_COS_IMAGE_BASE`，不用改代码。
