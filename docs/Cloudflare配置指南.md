# Cloudflare 配置指南

本指南帮助你将域名接入 Cloudflare 并配置 DNS，实现香港服务器的域名访问。

## 前置条件

- 已购买域名
- 已部署香港服务器
- 服务器已配置 Nginx + HTTPS

---

## 步骤 1：注册 Cloudflare 账号

1. 访问 https://cloudflare.com
2. 点击右上角 "Sign Up"
3. 输入邮箱和密码
4. 验证邮箱

---

## 步骤 2：添加站点到 Cloudflare

1. 登录 Cloudflare 控制台
2. 点击 "添加站点" 或 "Add a Site"
3. 输入你的域名（例如：`wavemod.com`）
4. 点击 "添加站点"
5. 选择 **Free** 免费套餐
6. 点击 "继续"

---

## 步骤 3：修改域名 NS 记录

Cloudflare 会显示两个 Nameserver（NS）记录，类似：

```text
ns1.cloudflare.com
ns2.cloudflare.com
```

### 在阿里云修改 NS 记录

1. 登录阿里云控制台
2. 进入 "域名" → "域名列表"
3. 找到你的域名，点击 "管理"
4. 点击 "DNS 修改"
5. 选择 "修改 DNS 服务器"
6. 将 DNS 服务器修改为 Cloudflare 提供的两个 NS 记录
7. 保存

### 在腾讯云修改 NS 记录

1. 登录腾讯云控制台
2. 进入 "域名注册" → "我的域名"
3. 找到你的域名，点击 "管理"
4. 点击 "修改 DNS 服务器"
5. 输入 Cloudflare 提供的两个 NS 记录
6. 保存

### 在 Cloudflare 修改 NS 记录

如果域名在 Cloudflare 注册：

1. 在 Cloudflare 控制台
2. 进入域名管理
3. DNS 会自动配置

### 等待 DNS 生效

NS 记录修改后，需要等待 DNS 生效：

- 通常：几分钟到几小时
- 最长：24-48 小时

可以在 Cloudflare 控制台查看状态，显示 "Active" 即表示生效。

---

## 步骤 4：配置 DNS 记录

在 Cloudflare DNS 管理页面添加以下记录：

### 主域名 A 记录

```text
类型：A
名称：@
内容：你的香港服务器IP
代理状态：仅 DNS（灰云图标）
TTL：自动
```

### www 子域名 CNAME 记录

```text
类型：CNAME
名称：www
内容：你的域名.com（例如：wavemod.com）
代理状态：仅 DNS（灰云图标）
TTL：自动
```

### 重要：不要开启橙云代理

**必须保持灰云状态（DNS only）**，原因：

- 香港服务器直连中国用户速度已经很快
- Cloudflare 橙云代理可能让中国用户访问更慢
- 橙云会绕到海外节点，增加延迟

### 可选：资源域名 CNAME 记录

如果你使用阿里云 OSS + CDN：

```text
类型：CNAME
名称：assets
内容：你的阿里云CDN域名
代理状态：仅 DNS（灰云图标）
```

```text
类型：CNAME
名称：download
内容：你的阿里云CDN域名
代理状态：仅 DNS（灰云图标）
```

---

## 步骤 5：配置 SSL/TLS

### 加密模式

1. 在 Cloudflare 控制台
2. 进入 "SSL/TLS" → "概述"
3. 选择加密模式：**完全（严格）**

这样 Cloudflare 会验证你服务器的 Let's Encrypt 证书。

### 其他 SSL 设置

保持默认即可：

- 始终使用 HTTPS：开启
- 自动 HTTPS 重写：开启
- 最低 TLS 版本：TLS 1.2

---

## 步骤 6：配置安全设置

### 防火墙规则（可选）

在 "安全性" → "WAF" 中：

- 保持默认规则即可
- 不建议开启 "Bot Fight Mode"（可能影响中国用户）

### 速率限制（可选）

如果需要防止恶意请求：

1. 进入 "安全性" → "速率限制"
2. 创建规则，例如：
   - 路径：`/api/*`
   - 速率：100 请求/分钟
   - 操作：阻止

---

## 步骤 7：配置页面规则（可选）

### 强制 HTTPS

1. 进入 "规则" → "页面规则"
2. 创建规则：
   - URL：`http://*你的域名.com/*`
   - 设置：始终使用 HTTPS

### 缓存规则（可选）

对于静态资源：

- URL：`*你的域名.com/*.{jpg,jpeg,png,gif,css,js}`
- 设置：缓存级别 = 标准

---

## 步骤 8：验证配置

### 检查 DNS 解析

在本地终端执行：

```bash
nslookup 你的域名.com
```

应该返回你的香港服务器 IP。

### 检查 HTTPS

访问：

```text
https://你的域名.com
```

浏览器地址栏应该显示锁图标。

### 检查代理状态

在 Cloudflare DNS 页面确认：

- A 记录和 CNAME 记录都是灰云图标
- 不是橙云图标

---

## 常见问题

### DNS 一直不生效

可能原因：

1. NS 记录修改未保存
2. 域名注册商需要额外验证
3. DNS 缓存

解决方法：

```bash
# 清除本地 DNS 缓存（Windows）
ipconfig /flushdns

# 清除本地 DNS 缓存（macOS）
sudo dscacheutil -flushcache

# 清除本地 DNS 缓存（Linux）
sudo systemd-resolve --flush-caches
```

### 网站显示 "DNS_PROBE_FINISHED_NXDOMAIN"

原因：DNS 记录未正确配置

解决方法：

1. 检查 Cloudflare DNS 记录是否正确
2. 确认 NS 记录已生效
3. 等待 DNS 传播

### 网站显示 "ERR_SSL_VERSION_OR_CIPHER_MISMATCH"

原因：SSL 配置不正确

解决方法：

1. 确认服务器已安装 Let's Encrypt 证书
2. Cloudflare SSL/TLS 模式改为 "完全（严格）"
3. 重启 Nginx

### 中国用户访问慢

检查：

1. 确认 DNS 记录是灰云（DNS only）
2. 不要开启橙云代理
3. 确认服务器在香港

---

## Cloudflare 功能说明

### 推荐使用的功能

```text
✓ DNS 管理
✓ SSL/TLS 证书管理
✓ 基础 WAF 防护
✓ DNSSEC
✓ 页面规则
✓ 重定向规则
```

### 不推荐使用的功能

```text
❌ 橙云代理（对中国用户无益）
❌ Bot Fight Mode（可能误伤正常用户）
❌ Cloudflare Pages（中国访问慢）
❌ Cloudflare Workers（中国访问慢）
❌ Cloudflare R2（中国访问慢）
```

---

## 后续优化

### 启用 DNSSEC

1. 在 Cloudflare 控制台
2. 进入 "DNS" → "设置"
3. 启用 DNSSEC
4. 在域名注册商添加 DS 记录

### 配置 CAA 记录

限制哪些 CA 可以为你的域名签发证书：

```text
类型：CAA
名称：@
内容：0 issue "letsencrypt.org"
```

### 监控流量

在 Cloudflare "分析" 页面可以查看：

- 请求数
- 带宽使用
- 威胁统计
- 性能指标

---

## 成本说明

Cloudflare 免费套餐包含：

```text
✓ 无限 DNS 查询
✓ 基础 DDoS 防护
✓ 免费 SSL 证书
✓ 基础 WAF 规则
✓ 页面规则（3 条）
```

对于当前项目，免费套餐完全够用。

---

## 技术支持

如遇到问题：

1. 查看 Cloudflare 文档：https://developers.cloudflare.com
2. 查看 Cloudflare 社区：https://community.cloudflare.com
3. 检查服务器日志
4. 检查 Nginx 配置

---

## 总结

Cloudflare 在这个方案中的作用：

```text
用户
  ↓
Cloudflare DNS（灰云）
  ↓
香港服务器
  ↓
Next.js 应用
```

**关键点：**

- Cloudflare 只做 DNS 管理
- 不开启橙云代理
- 保持灰云状态
- 服务器在香港，直连中国用户

这样可以实现：

- 中国用户访问快
- 配置简单
- 成本低
- 稳定性好
