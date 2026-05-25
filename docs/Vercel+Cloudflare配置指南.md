# Vercel + Cloudflare 配置指南

本指南帮助你将已部署在 Vercel 的项目接入 Cloudflare DNS。

## 前置条件

- 已在 Vercel 部署项目
- 已购买域名
- 已注册 Cloudflare 账号

---

## 配置步骤

### 步骤 1：获取 Vercel 项目信息

1. 登录 Vercel 控制台（https://vercel.com）
2. 进入你的项目
3. 记下当前的 Vercel 域名，例如：`wavemod.vercel.app`

### 步骤 2：添加域名到 Cloudflare

1. 登录 Cloudflare 控制台（https://cloudflare.com）
2. 点击 "添加站点" 或 "Add a Site"
3. 输入你的域名（例如：`wavemod.com`）
4. 选择 **Free** 免费套餐
5. 点击 "继续"

### 步骤 3：修改域名 NS 记录

Cloudflare 会显示两个 Nameserver（NS）记录，类似：

```text
ns1.cloudflare.com
ns2.cloudflare.com
```

前往你的域名注册商（阿里云/腾讯云/Cloudflare 等）：

1. 找到域名管理
2. 修改 DNS 服务器/NS 记录
3. 替换为 Cloudflare 提供的 NS 记录
4. 保存

等待 DNS 生效（几分钟到几小时）。

### 步骤 4：配置 Cloudflare DNS 记录

在 Cloudflare DNS 管理页面添加以下记录：

#### 主域名 CNAME 记录

```text
类型：CNAME
名称：@
内容：cname.vercel-dns.com
代理状态：仅 DNS（灰云图标）
TTL：自动
```

#### www 子域名 CNAME 记录

```text
类型：CNAME
名称：www
内容：cname.vercel-dns.com
代理状态：仅 DNS（灰云图标）
TTL：自动
```

**重要：保持灰云状态（DNS only）**

### 步骤 5：在 Vercel 添加自定义域名

1. 回到 Vercel 控制台
2. 进入你的项目
3. 点击 "Settings" → "Domains"
4. 点击 "Add Domain"
5. 输入你的域名：`wavemod.com`
6. 点击 "Add"
7. 再添加 www 子域名：`www.wavemod.com`

Vercel 会自动检测 DNS 配置，显示 "Valid Configuration"。

### 步骤 6：配置 Cloudflare SSL/TLS

1. 在 Cloudflare 控制台
2. 进入 "SSL/TLS" → "概述"
3. 选择加密模式：**完全（严格）**

这样 Cloudflare 会验证 Vercel 的 SSL 证书。

### 步骤 7：更新 Supabase 配置

在 Supabase 控制台：

1. Authentication → URL Configuration
2. 更新 Site URL：`https://你的域名.com`
3. 更新 Redirect URLs：
   - `https://你的域名.com/auth/callback`
   - `https://www.你的域名.com/auth/callback`
   - 保留原来的 `https://wavemod.vercel.app/auth/callback`（作为备用）

### 步骤 8：更新 Vercel 环境变量

在 Vercel 控制台：

1. Settings → Environment Variables
2. 找到 `NEXT_PUBLIC_SITE_URL`
3. 修改为：`https://你的域名.com`
4. 保存后会自动重新部署

---

## 验证配置

### 检查 DNS 解析

在本地终端执行：

```bash
nslookup 你的域名.com
```

应该返回 Vercel 的 IP 地址。

### 检查网站访问

访问：

```text
https://你的域名.com
```

应该能正常打开网站。

### 检查 SSL 证书

浏览器地址栏应该显示锁图标，点击查看证书：

- 颁发者：Let's Encrypt 或 Vercel
- 域名：你的域名.com

---

## 可选：配置阿里云 CDN 加速资源

如果你想让图片和 MOD 文件下载更快：

### 1. 开通阿里云 CDN

1. 登录阿里云控制台
2. 搜索 "CDN"
3. 开通 CDN 服务

### 2. 添加加速域名

1. 在 CDN 控制台点击 "添加域名"
2. 加速域名：`assets.你的域名.com`
3. 业务类型：图片小文件
4. 源站信息：
   - 类型：OSS 域名
   - 域名：选择你的 OSS Bucket
5. 加速区域：仅中国大陆 或 全球
6. 提交

### 3. 配置 CNAME

阿里云会提供一个 CDN CNAME 域名，例如：

```text
assets.你的域名.com.w.kunlunsl.com
```

在 Cloudflare DNS 添加记录：

```text
类型：CNAME
名称：assets
内容：assets.你的域名.com.w.kunlunsl.com
代理状态：仅 DNS（灰云图标）
```

### 4. 更新项目配置

在 `next.config.ts` 中：

```typescript
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.你的域名.com',
      },
    ],
  },
};
```

在代码中使用 CDN 域名：

```typescript
const imageUrl = `https://assets.你的域名.com/path/to/image.jpg`;
```

---

## 常见问题

### DNS 一直不生效

可能原因：

1. NS 记录修改未保存
2. DNS 缓存

解决方法：

```bash
# 清除本地 DNS 缓存（Windows）
ipconfig /flushdns

# 清除本地 DNS 缓存（macOS）
sudo dscacheutil -flushcache

# 清除本地 DNS 缓存（Linux）
sudo systemd-resolve --flush-caches
```

### Vercel 显示 "Invalid Configuration"

可能原因：

1. DNS 记录配置错误
2. DNS 未生效

解决方法：

1. 确认 Cloudflare DNS 记录是 `cname.vercel-dns.com`
2. 确认是灰云状态
3. 等待 DNS 传播（最多 48 小时）

### 网站显示 "ERR_TOO_MANY_REDIRECTS"

可能原因：

1. Cloudflare SSL/TLS 模式设置错误

解决方法：

1. 在 Cloudflare 控制台
2. SSL/TLS → 概述
3. 改为 "完全（严格）"

### 登录回调失败

可能原因：

1. Supabase Redirect URLs 未更新

解决方法：

1. 在 Supabase 控制台
2. Authentication → URL Configuration
3. 确认 Redirect URLs 包含你的新域名

---

## 性能优化建议

### 1. 启用 Cloudflare 缓存规则

在 Cloudflare 控制台：

1. 进入 "规则" → "页面规则"
2. 创建规则：
   - URL：`*你的域名.com/*.{jpg,jpeg,png,gif,css,js,svg,woff,woff2}`
   - 设置：缓存级别 = 标准
   - 设置：浏览器缓存 TTL = 4 小时

### 2. 启用 Brotli 压缩

在 Cloudflare 控制台：

1. 进入 "速度" → "优化"
2. 开启 "Brotli"

### 3. 启用 Auto Minify

在 Cloudflare 控制台：

1. 进入 "速度" → "优化"
2. 开启 "Auto Minify"
3. 勾选 JavaScript、CSS、HTML

---

## 架构图

```text
中国用户
  ↓
Cloudflare DNS（灰云）
  ↓
Vercel（海外边缘节点）
  ↓
Next.js 应用
  ↓
┌─────────────┬────────────────┐
│ Supabase    │ 阿里云 OSS + CDN │
│ Auth/DB     │ 图片/MOD文件     │
└─────────────┴────────────────┘
```

---

## 成本说明

```text
Vercel：免费
Cloudflare：免费
域名：50-100 元/年
阿里云 CDN（可选）：10-50 元/月

总计：约 10-20 元/月
```

---

## 为什么不开橙云代理

Cloudflare 橙云代理对中国用户帮助有限：

```text
❌ 免费套餐在中国大陆没有稳定节点
❌ 可能让中国用户访问更慢
❌ 增加一层代理延迟
```

保持灰云（DNS only）可以：

```text
✓ 直连 Vercel 边缘节点
✓ 减少延迟
✓ 避免额外的代理层
```

---

## 后续优化方向

如果觉得访问速度还是慢，可以考虑：

1. 迁移到香港服务器（30 元/月）
2. 迁移到国内服务器 + 备案（80 元/月）
3. 使用 Cloudflare Workers 作为缓存层（$5/月）

---

## 技术支持

如遇到问题：

1. 查看 Vercel 文档：https://vercel.com/docs
2. 查看 Cloudflare 文档：https://developers.cloudflare.com
3. 检查 DNS 解析：`nslookup 你的域名.com`
4. 检查 Vercel 部署日志

---

## 总结

Vercel + Cloudflare 的配置要点：

```text
✓ Cloudflare DNS 记录指向 cname.vercel-dns.com
✓ 保持灰云状态（DNS only）
✓ Vercel 添加自定义域名
✓ Cloudflare SSL/TLS 设置为"完全（严格）"
✓ 更新 Supabase 和 Vercel 环境变量
✓ 可选：配置阿里云 CDN 加速资源
```

这样配置后，你的网站就可以通过自定义域名访问了。
